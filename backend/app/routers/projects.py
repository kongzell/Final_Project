import re

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app import mailer, notify
from app.auth import require_member
from app.db import get_session
from app.models import CaseFile, Member, Project, Task, project_members, task_assignees
from app.schemas import (
    MemberRoleUpdate,
    ProjectCreate,
    ProjectOut,
    ProjectUpdate,
    TaskCreate,
    TaskOut,
)
from app.serialize import project_out, task_out

router = APIRouter(prefix="/api/projects", tags=["projects"])


def _prefix_from_repo(github_repo: str | None) -> str:
    """รหัสย่อจากอักษรตัวแรกของแต่ละคำในชื่อ repo"""
    if not github_repo:
        return "TASK"
    name = github_repo.split("/")[-1]
    initials = "".join(w[0] for w in re.split(r"[^A-Za-z0-9]+", name) if w and w[0].isalpha())
    return initials.upper()[:10] if initials else "TASK"


async def _get_project(session: AsyncSession, project_id: str, me: Member) -> Project:
    """โปรเจคที่ me เป็นสมาชิกอยู่

    ถ้าไม่ได้เป็นสมาชิกจะตอบ 404 เหมือนไม่มีโปรเจคนี้ ไม่ใช่ 403
    เพราะ 403 เท่ากับบอกคนนอกว่า id นี้มีอยู่จริง
    """
    project = await session.get(Project, project_id)
    if project is None or me.id not in {m.id for m in project.members}:
        raise HTTPException(404, f"Project {project_id} not found")
    return project


async def _get_owned_project(session: AsyncSession, project_id: str, me: Member) -> Project:
    """โปรเจคที่ me เป็นเจ้าของจริง ๆ — เฉพาะเรื่องที่ admin ก็ทำไม่ได้: ลบโปรเจค ตั้ง admin"""
    project = await _get_project(session, project_id, me)
    if project.owner_id != me.id:
        raise HTTPException(403, "Only the project owner can do this")
    return project


async def _get_managed_project(session: AsyncSession, project_id: str, me: Member) -> Project:
    """โปรเจคที่ me เป็นเจ้าของหรือ admin — งานวางแผนทั่วไป: สร้างงาน แก้ชื่อ จัดการสมาชิก"""
    project = await _get_project(session, project_id, me)
    if not project.can_manage(me.id):
        raise HTTPException(403, "Only the project owner or an admin can do this")
    return project


@router.get("", response_model=list[ProjectOut])
async def list_projects(
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> list[ProjectOut]:
    """เฉพาะโปรเจคที่ตัวเองเป็นสมาชิก"""
    rows = await session.scalars(
        select(Project)
        .join(project_members, project_members.c.project_id == Project.id)
        .where(project_members.c.member_id == me.id)
        .order_by(Project.created_at)
    )
    return [project_out(p) for p in rows]


@router.post("", response_model=ProjectOut, status_code=201)
async def create_project(
    payload: ProjectCreate,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> ProjectOut:
    """คนสร้างเป็นเจ้าของ และถูกใส่เป็นสมาชิกไปด้วย ไม่งั้นจะมองไม่เห็นโปรเจคที่ตัวเองเพิ่งสร้าง"""
    project = Project(
        name=payload.name,
        github_repo=payload.github_repo,
        owner_id=me.id,
        task_prefix=_prefix_from_repo(payload.github_repo),
    )
    project.members.append(me)
    session.add(project)
    await session.commit()
    await session.refresh(project)
    return project_out(project)


@router.patch("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: str,
    payload: ProjectUpdate,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> ProjectOut:
    project = await _get_managed_project(session, project_id, me)
    data = payload.model_dump(exclude_unset=True)
    for field, value in data.items():
        setattr(project, field, value)
    await session.commit()
    await session.refresh(project)
    return project_out(project)


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    project_id: str,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> None:
    project = await _get_owned_project(session, project_id, me)
    await session.delete(project)
    await session.commit()


# ---------- พนักงานในโปรเจค ----------


@router.patch("/{project_id}/members/{member_id}", status_code=204)
async def set_member_role(
    project_id: str,
    member_id: str,
    payload: MemberRoleUpdate,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> None:
    """ตั้งหรือถอด admin — เจ้าของเท่านั้น

    admin ตั้ง admin คนอื่นไม่ได้ ไม่งั้นสิทธิ์จะกระจายจนเจ้าของคุมไม่อยู่
    เจ้าของเองไม่มี role เพราะสิทธิ์มาจาก owner_id อยู่แล้ว
    """
    project = await _get_owned_project(session, project_id, me)
    if member_id == project.owner_id:
        raise HTTPException(400, "The owner already has every permission")
    if member_id not in {m.id for m in project.members}:
        raise HTTPException(404, "That person is not in this project")

    await session.execute(
        update(project_members)
        .where(
            project_members.c.project_id == project_id,
            project_members.c.member_id == member_id,
        )
        .values(role=payload.role)
    )
    await session.commit()

@router.post("/{project_id}/members/{member_id}", status_code=204)
async def add_member(
    project_id: str,
    member_id: str,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> None:
    project = await _get_managed_project(session, project_id, me)
    member = await session.get(Member, member_id)
    if member is None:
        raise HTTPException(404, f"Member {member_id} not found")
    if member.id not in {m.id for m in project.members}:
        project.members.append(member)
        await session.commit()


@router.delete("/{project_id}/members/{member_id}", status_code=204)
async def remove_member(
    project_id: str,
    member_id: str,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> None:
    """เอาออกจากโปรเจค + ถอด assign ออกจากทุกงานของโปรเจคนี้ (งานโปรเจคอื่นไม่แตะ)"""
    project = await _get_managed_project(session, project_id, me)
    if member_id == project.owner_id:
        raise HTTPException(400, "The project owner cannot be removed")

    await session.execute(
        delete(task_assignees).where(
            task_assignees.c.member_id == member_id,
            task_assignees.c.task_id.in_(select(Task.id).where(Task.project_id == project_id)),
        )
    )
    await session.execute(
        delete(project_members).where(
            project_members.c.project_id == project_id,
            project_members.c.member_id == member_id,
        )
    )

    # งานที่เคยเป็นของเขาและตอนนี้ไม่เหลือใครถือ ให้กลับไปรอเริ่ม
    # ไม่งั้นจะค้างอยู่คอลัมน์กำลังทำทั้งที่ไม่มีคนทำแล้ว
    orphaned = await session.scalars(
        select(Task).where(
            Task.project_id == project_id,
            Task.status == "in-progress",
            ~Task.id.in_(select(task_assignees.c.task_id)),
        )
    )
    for task in orphaned:
        task.status = "todo"

    await session.commit()


# ---------- งานในโปรเจค ----------

@router.post("/{project_id}/tasks", response_model=TaskOut, status_code=201)
async def create_task(
    project_id: str,
    payload: TaskCreate,
    background: BackgroundTasks,
    me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> TaskOut:
    """เจ้าของหรือ admin เพิ่มงานได้ — สมาชิกรับงานและอัปเดตสถานะได้อย่างเดียว"""
    project = await _get_managed_project(session, project_id, me)

    # เก็บเฉพาะงานที่มีจริงและอยู่โปรเจคเดียวกัน — กัน id มั่วหรือข้ามโปรเจคหลุดลง database
    # ไม่ throw ถ้ามีตัวไม่ผ่าน เพราะฝั่งหน้าเว็บอาจส่ง id ของงานที่ผู้ใช้เพิ่งเอาออกจากรายการมาด้วย
    depends_on: list[str] = []
    if payload.depends_on:
        rows = await session.scalars(
            select(Task.id).where(
                Task.project_id == project_id, Task.id.in_(set(payload.depends_on))
            )
        )
        valid = set(rows)
        depends_on = [t for t in payload.depends_on if t in valid]

    # ไฟล์ต้นทางต้องมีจริง — id มั่วให้ตัดทิ้งเงียบ ๆ แบบเดียวกับ depends_on
    source_file_id = None
    if payload.source_file_id and await session.get(CaseFile, payload.source_file_id) is not None:
        source_file_id = payload.source_file_id

    # วางต่อท้ายคอลัมน์ที่ระบุ
    last = await session.scalar(
        select(func.max(Task.position)).where(
            Task.project_id == project_id, Task.status == payload.status
        )
    )
    # เลขงานนับต่อจากใบล่าสุดของโปรเจคนี้
    # สองคนกดสร้างพร้อมกันอาจได้เลขชนกัน unique constraint จะกันไว้ แล้วลองใหม่
    for attempt in range(3):
        highest = await session.scalar(
            select(func.max(Task.number)).where(Task.project_id == project_id)
        )
        task = Task(
            project_id=project_id,
            number=(highest or 0) + 1,
            parent_id=payload.parent_id,
            title=payload.title,
            description=payload.description,
            status=payload.status,
            priority=payload.priority,
            due_date=payload.due_date,
            position=(last or 0.0) + 1000.0,
            category=payload.category,
            tags=payload.tags,
            estimate_hours=payload.estimate_hours,
            complexity=payload.complexity,
            depends_on=depends_on,
            source_file_id=source_file_id,
        )
        session.add(task)
        try:
            await session.commit()
        except IntegrityError:
            await session.rollback()
            if attempt == 2:
                raise HTTPException(409, "Could not create the task, the task number collided — please try again") from None
            continue
        await session.refresh(task)

        # งานย่อยที่ AI แตกมาไม่ต้องแจ้ง ไม่งั้นกดครั้งเดียวได้อีเมล 5 ฉบับรวด
        # แจ้งเฉพาะการ์ดหลักที่โผล่บนบอร์ดจริง ๆ
        if task.parent_id is None:
            to = await notify.project_emails(session, project_id, exclude={me.id})
            if to:
                subject, body = notify.task_created(project, task, me)
                background.add_task(mailer.send, to, subject, body)
            else:
                others = len([m for m in project.members if m.id != me.id])
                notify.explain_skip("งานใหม่", task, others, 0)

        return task_out(task)

    raise HTTPException(409, "Could not create the task")
