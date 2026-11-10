"""ไฟล์ผลงานที่แนบกับการ์ด — เก็บลงที่เก็บเอกสารประจำโปรเจคเมื่องานผ่านการตรวจ

งานปิดได้หลายทาง (หัวหน้ากด Done บนเว็บ หรือ PR ถูก merge บน GitHub) ทุกทางต้องเรียก
archive_attachments ตัวเดียวกัน ไม่งั้นไฟล์ของงานที่ปิดจาก GitHub จะค้างอยู่ที่การ์ดตลอด
"""

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CaseFile, Project, Task, TaskAttachment


async def archive_attachments(session: AsyncSession, project: Project, task: Task) -> int:
    """คัดลอกไฟล์ที่ยังรออยู่ของงานที่ปิดแล้วลงที่เก็บประจำโปรเจค คืนจำนวนไฟล์ที่เก็บ

    ไม่ commit เอง — ผู้เรียก commit พร้อมการเปลี่ยนสถานะ ไฟล์กับสถานะจะได้ไม่หลุดกัน
    ยังไม่ได้ตั้งที่เก็บประจำโปรเจค = ไฟล์รออยู่ที่การ์ดก่อน แล้วถูกเก็บตอนตั้งที่เก็บ
    """
    if task.status != "complete" or project.document_case_id is None:
        return 0
    pending = [a for a in task.attachments if a.archived_at is None]
    if not pending:
        return 0

    key = project.task_key(task)
    now = datetime.now(UTC)
    for att in pending:
        # data ถูก defer ไว้ — ดึงทีละไฟล์ตอนจะคัดลอกจริง ไม่ลากทุกไฟล์มาพร้อมกัน
        data = await session.scalar(select(TaskAttachment.data).where(TaskAttachment.id == att.id))
        doc = CaseFile(
            case_id=project.document_case_id,
            # ใส่รหัสงานนำหน้า คนเปิดที่เก็บเอกสารจะรู้ทันทีว่าเป็นผลงานของการ์ดใบไหน
            title=f"{key} {att.filename.rsplit('.', 1)[0]}",
            # ผ่านการตรวจแล้ว = ส่งมอบแล้ว ไม่ต้องติดตามต่อแบบเอกสารที่รับเข้ามาใหม่
            status="delivered",
            project_id=task.project_id,
            filename=att.filename,
            content_type=att.content_type,
            size=att.size,
            data=data or b"",
            category="other",
            uploaded_by=att.uploaded_by,
        )
        session.add(doc)
        await session.flush()
        att.file_id = doc.id
        att.archived_at = now
        # ไฟล์อยู่ในที่เก็บกลางแล้ว ไม่ต้องเก็บซ้ำที่การ์ด — ดาวน์โหลดจากการ์ดจะไปดึงฉบับในที่เก็บแทน
        att.data = b""
    return len(pending)


async def archive_backlog(session: AsyncSession, project: Project) -> int:
    """งานที่ปิดไปตอนยังไม่ได้ตั้งที่เก็บประจำโปรเจค — เก็บไฟล์ที่ค้างไว้ทั้งหมดทีเดียว"""
    total = 0
    for task in project.tasks:
        total += await archive_attachments(session, project, task)
    return total
