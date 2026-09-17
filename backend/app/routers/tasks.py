from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import mailer, notify
from app.auth import require_member
from app.db import get_session
from app.models import (
    Member,
    Project,
    Task,
    TaskComment,
    apply_status_change,
    project_members,
)
from app.schemas import CommentCreate, CommentOut, TaskOut, TaskUpdate
from app.serialize import task_out

router = APIRouter(prefix="/api/tasks", tags=["tasks"])

#: ฟิลด์ที่สมาชิกธรรมดาแก้ได้ — ที่เหลือเป็นการวางแผนงาน ซึ่งเป็นเรื่องของเจ้าของ
MEMBER_EDITABLE = {"status", "position"}


async def _task_with_project(
    session: AsyncSession, task_id: str, me: Member
) -> tuple[Task, Project]:
    """งาน + โปรเจคของมัน เมื่อ me เป็นสมาชิกอยู่ — คนนอกได้ 404 เหมือนไม่มีงานนี้"""
    task = await session.get(Task, task_id)
    if task is None:
        raise HTTPException(404, f"Task {task_id} not found")

    project = await session.scalar(
        select(Project)
        .join(project_members, project_members.c.project_id == Project.id)
        .where(Project.id == task.project_id, project_members.c.member_id == me.id)
    )
    if project is None:
        raise HTTPException(404, f"Task {task_id} not found")
    return task, project


async def _park_if_unclaimed(session: AsyncSession, task: Task) -> None:
    """งานที่ไม่มีใครถืออยู่แล้ว ให้กลับไปคอลัมน์ "รอเริ่ม"

    เป็นขากลับของกฎ "รับงานแล้วย้ายไปกำลังทำ" ไม่งั้นจะเหลือการ์ดค้างอยู่
    คอลัมน์กำลังทำโดยไม่มีใครทำ ซึ่งอ่านบอร์ดแล้วเข้าใจผิด

    ไม่แตะงานที่ส่งตรวจหรือปิดไปแล้ว เพราะงานถูกทำไปจริง
    """
    if task.assignees or task.status != "in-progress":
        return

    # ต่อท้ายคอลัมน์ปลายทาง เหมือนตอนย้ายด้วยวิธีอื่น — อ่านลำดับก่อนเปลี่ยนสถานะ
    last = await session.scalar(
        select(func.max(Task.position)).where(
            Task.project_id == task.project_id, Task.status == "todo"
        )
    )
    apply_status_change(task, "todo")
    task.position = (last or 0.0) + 1000.0


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: str,
    payload: TaskUpdate,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> TaskOut:
    task, project = await _task_with_project(session, task_id, me)
    data = payload.model_dump(exclude_unset=True)

    # สมาชิกย้ายคอลัมน์งานที่ตัวเองทำได้ แต่เปลี่ยนชื่อ ความสำคัญ หมวดหมู่ ไม่ได้
    if not project.can_manage(me.id):
        blocked = sorted(set(data) - MEMBER_EDITABLE)
        if blocked:
            raise HTTPException(
                403, f"Only the project owner can change: {', '.join(blocked)}"
            )
        # ปิดงานคือการตรวจรับ ซึ่งเป็นหน้าที่เจ้าของ สมาชิกส่งได้แค่ถึงรอตรวจ
        if data.get("status") == "complete":
            raise HTTPException(
                403, "You can send work to review, but closing a task is up to the owner or an admin"
            )

    # ย้ายคอลัมน์แล้วไม่ได้สั่งลำดับมาด้วย -> ต่อท้ายคอลัมน์ปลายทาง
    if "status" in data and data["status"] != task.status and "position" not in data:
        last = await session.scalar(
            select(func.max(Task.position)).where(
                Task.project_id == task.project_id, Task.status == data["status"]
            )
        )
        data["position"] = (last or 0.0) + 1000.0

    # แก้กำหนดส่งใหม่ หรือเปิดงานที่ปิดแล้วขึ้นมาทำต่อ ให้แจ้งเตือน "เลยกำหนดส่ง" ได้อีกรอบ
    # ถ้าไม่ล้างไว้ งานที่เคยเลยกำหนดแล้วโดนแจ้งไปแล้วจะไม่มีทางแจ้งซ้ำอีกเลยแม้เลยกำหนดใหม่จริง ๆ
    old_status = task.status
    if "due_date" in data and data["due_date"] != task.due_date:
        task.overdue_notified_at = None

    # ต้องเรียกก่อนลูป setattr ข้างล่าง เพราะตัวช่วยเทียบสถานะเก่ากับใหม่
    if "status" in data:
        apply_status_change(task, data["status"])
        if old_status == "complete" and data["status"] != "complete":
            task.overdue_notified_at = None

    for field, value in data.items():
        setattr(task, field, value)

    await session.commit()
    await session.refresh(task)
    return task_out(task)


@router.delete("/{task_id}", status_code=204)
async def delete_task(
    task_id: str,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> None:
    task, project = await _task_with_project(session, task_id, me)
    if not project.can_manage(me.id):
        raise HTTPException(403, "Only the project owner or an admin can delete a task")
    await session.delete(task)
    await session.commit()


@router.put("/{task_id}/assignees/{member_id}", response_model=TaskOut)
async def assign(
    task_id: str,
    member_id: str,
    background: BackgroundTasks,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> TaskOut:
    task, project = await _task_with_project(session, task_id, me)

    # สมาชิกรับงานเข้าตัวเองได้ แต่มอบหมายให้คนอื่นเป็นเรื่องของเจ้าของ
    if not project.can_manage(me.id) and member_id != me.id:
        raise HTTPException(403, "Only the project owner or an admin can assign work to someone else")

    member = await session.get(Member, member_id)
    if member is None:
        raise HTTPException(404, f"Member {member_id} not found")

    # มอบหมายได้เฉพาะคนที่อยู่ในโปรเจคนี้ ไม่งั้นจะโผล่ชื่อคนนอกบนการ์ด
    in_project = await session.scalar(
        select(project_members.c.member_id).where(
            project_members.c.project_id == task.project_id,
            project_members.c.member_id == member_id,
        )
    )
    if in_project is None:
        raise HTTPException(400, "That person is not in this project")

    if member.id not in {m.id for m in task.assignees}:
        task.assignees.append(member)
        await session.commit()
        await session.refresh(task)

        # เจ้าของต้องรู้ว่างานเริ่มเดินแล้ว ส่วนคนที่ถูกมอบหมายต้องรู้ว่ามีงานเข้า
        # ตัดคนที่กดปุ่มเองออก เพราะเขารู้อยู่แล้ว
        watchers = {project.owner_id, member.id} - {me.id, None}
        to = await notify.emails_of(session, watchers)
        if to:
            subject, body = notify.task_claimed(project, task, member)
            background.add_task(mailer.send, to, subject, body)
        else:
            notify.explain_skip("รับงาน", task, len(watchers), 0)
    return task_out(task)


@router.delete("/{task_id}/assignees/{member_id}", response_model=TaskOut)
async def unassign(
    task_id: str,
    member_id: str,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> TaskOut:
    task, project = await _task_with_project(session, task_id, me)
    if not project.can_manage(me.id) and member_id != me.id:
        raise HTTPException(403, "Only the project owner or an admin can unassign someone else")

    task.assignees = [m for m in task.assignees if m.id != member_id]
    await _park_if_unclaimed(session, task)
    await session.commit()
    await session.refresh(task)
    return task_out(task)


# ---------- คอมเมนต์ใต้การ์ด ----------


def _comment_out(row: TaskComment) -> CommentOut:
    return CommentOut(
        id=row.id,
        task_id=row.task_id,
        member_id=row.member_id,
        # คนเขียนอาจถูกลบออกจากระบบไปแล้ว แต่คอมเมนต์ยังอยู่
        member_name=row.member.name if row.member else "อดีตสมาชิก",
        body=row.body,
        created_at=row.created_at,
    )


@router.get("/{task_id}/comments", response_model=list[CommentOut])
async def list_comments(
    task_id: str,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> list[CommentOut]:
    """ทุกคนในโปรเจคอ่านคอมเมนต์ได้ — เจ้าของต้องอ่านเพื่อรู้ว่าลูกทีมติดอะไร"""
    await _task_with_project(session, task_id, me)
    rows = await session.scalars(
        select(TaskComment)
        .where(TaskComment.task_id == task_id)
        .order_by(TaskComment.created_at)
    )
    return [_comment_out(r) for r in rows]


@router.post("/{task_id}/comments", response_model=CommentOut, status_code=201)
async def add_comment(
    task_id: str,
    payload: CommentCreate,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> CommentOut:
    """เขียนได้เฉพาะคนที่รับงานใบนี้ กับเจ้าของโปรเจค

    คนอื่นในทีมอ่านได้แต่เขียนไม่ได้ เพราะคอมเมนต์ตรงนี้คือบันทึกของคนที่ลงมือทำ
    ไม่ใช่กระดานคุยรวม ถ้าใครก็เขียนได้จะกลายเป็นที่ถกเถียงจนหาสาระไม่เจอ
    """
    task, project = await _task_with_project(session, task_id, me)

    mine = any(m.id == me.id for m in task.assignees)
    if not mine and not project.can_manage(me.id):
        raise HTTPException(403, "Only the people on this task and the project owner can comment")

    body = payload.body.strip()
    if not body:
        raise HTTPException(400, "The comment is empty")

    row = TaskComment(task_id=task_id, member_id=me.id, body=body)
    session.add(row)
    await session.commit()
    await session.refresh(row, ["member"])
    return _comment_out(row)


@router.delete("/{task_id}/comments/{comment_id}", status_code=204)
async def delete_comment(
    task_id: str,
    comment_id: str,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> None:
    """ลบได้เฉพาะคอมเมนต์ของตัวเอง — เจ้าของโปรเจคลบของใครก็ได้"""
    _, project = await _task_with_project(session, task_id, me)

    row = await session.get(TaskComment, comment_id)
    if row is None or row.task_id != task_id:
        raise HTTPException(404, "Comment not found")
    if row.member_id != me.id and not project.can_manage(me.id):
        raise HTTPException(403, "You can only delete your own comment")

    await session.delete(row)
    await session.commit()
