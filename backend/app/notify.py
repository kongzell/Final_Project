from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Case, CaseFile, DocumentRequest, Member, Project, Task, case_members, project_members

log = logging.getLogger("notify")


def explain_skip(event: str, task: Task, candidates: int, with_email: int) -> None:
    """บอกใน log ว่าทำไมเหตุการณ์นี้ถึงไม่มีอีเมลออก

    เดิมเงียบสนิทเมื่อไม่มีผู้รับ ทำให้แยกไม่ออกว่า "ไม่มีใครกรอกอีเมล"
    กับ "คนกดเป็นคนเดียวกับผู้ที่ควรได้รับ" — ไล่หาสาเหตุเสียเวลาไปหลายรอบ
    """
    if candidates == 0:
        why = "ผู้ที่ควรได้รับถูกตัดออกหมด (คนกดปุ่มคือคนเดียวกับผู้รับ)"
    else:
        why = f"ผู้ที่ควรได้รับ {candidates} คน แต่กรอกอีเมลไว้ {with_email} คน"
    log.info("%s #%s — ไม่ส่งแจ้งเตือน: %s", event, task.number, why)


async def project_emails(
    session: AsyncSession, project_id: str, exclude: set[str]
) -> list[str]:
    """อีเมลของสมาชิกในโปรเจค ยกเว้นคนที่ระบุ

    คนที่ไม่ได้กรอกอีเมลไว้จะไม่ถูกนับ — ถือว่าเลือกไม่รับแจ้งเตือน
    """
    rows = await session.scalars(
        select(Member.email)
        .join(project_members, project_members.c.member_id == Member.id)
        .where(
            project_members.c.project_id == project_id,
            Member.email.is_not(None),
            Member.id.not_in(exclude) if exclude else Member.id.is_not(None),
        )
    )
    return [e for e in rows if e]


async def emails_of(session: AsyncSession, member_ids: set[str | None]) -> list[str]:
    """อีเมลของคนตาม id ที่ให้มา — ข้ามคนที่ไม่ได้กรอกอีเมลไว้"""
    ids = {m for m in member_ids if m}
    if not ids:
        return []
    rows = await session.scalars(
        select(Member.email).where(Member.id.in_(ids), Member.email.is_not(None))
    )
    return [e for e in rows if e]


async def case_emails(session: AsyncSession, case_id: str, exclude: set[str]) -> list[str]:
    """อีเมลของสมาชิกในเรื่อง ยกเว้นคนที่ระบุ — กติกาเดียวกับ project_emails"""
    rows = await session.scalars(
        select(Member.email)
        .join(case_members, case_members.c.member_id == Member.id)
        .where(
            case_members.c.case_id == case_id,
            Member.email.is_not(None),
            Member.id.not_in(exclude) if exclude else Member.id.is_not(None),
        )
    )
    return [e for e in rows if e]


async def case_manager_emails(session: AsyncSession, case: Case, exclude: set[str]) -> list[str]:
    """อีเมลของเจ้าของ + admin ของที่เก็บ — คำขอเอกสารส่งถึงคนที่ตัดสินใจได้ ไม่รบกวนสมาชิกทั้งหมด"""
    ids = {case.owner_id, *case.admin_ids} - {None} - exclude
    if not ids:
        return []
    rows = await session.scalars(select(Member.email).where(Member.id.in_(ids), Member.email.is_not(None)))
    return [e for e in rows if e]


def document_requested(to_case: Case, from_case: Case, req: DocumentRequest, who: Member) -> tuple[str, str]:
    """มีทีมอื่นขอเอกสารจากที่เก็บนี้ — แจ้งเจ้าของ/admin ให้ไปเลือกไฟล์ส่ง"""
    subject = f"[{to_case.title}] {from_case.title} ขอเอกสาร: {req.title}"
    lines = [
        f"{who.name} ({from_case.title}) ขอเอกสารจาก \"{to_case.title}\"",
        "",
        f"  เอกสารที่ขอ: {req.title}",
    ]
    if req.note:
        lines.append(f"  หมายเหตุ: {req.note}")
    lines += ["", "เปิดที่เก็บแล้วเลือกไฟล์ส่งให้ หรือปฏิเสธพร้อมเหตุผลได้ที่แผง Requests"]
    url = get_settings().app_url
    return subject, "\n".join(lines) + f"\n\nเปิดหน้า Documents: {url}\n\n--\nอีเมลนี้ส่งอัตโนมัติจากระบบ 3work"


def _document_lines(f: CaseFile) -> list[str]:
    lines = [f"  ไฟล์: {f.filename}"]
    if f.doc_number:
        lines.append(f"  เลขที่: {f.doc_number}")
    if f.agency:
        lines.append(f"  หน่วยงาน: {f.agency}")
    return lines


def _document_footer() -> str:
    url = get_settings().app_url
    return f"\n\nเปิดหน้า Documents: {url}\n\n--\nอีเมลนี้ส่งอัตโนมัติจากระบบ 3work"


def document_due_soon(case: Case, f: CaseFile, days_left: int) -> tuple[str, str]:
    """เอกสารใกล้ถึงกำหนดส่ง — แจ้งล่วงหน้าให้ทันเตรียม"""
    when = "พรุ่งนี้" if days_left == 1 else "วันนี้" if days_left == 0 else f"อีก {days_left} วัน"
    subject = f"[{case.title}] เอกสารใกล้กำหนดส่ง ({when}): {f.title}"
    body = "\n".join([
        f'เอกสาร "{f.title}" ถึงกำหนดส่ง{when} ({f.deadline.isoformat()})',
        "",
        *_document_lines(f),
    ])
    return subject, body + _document_footer()


def document_overdue(case: Case, f: CaseFile) -> tuple[str, str]:
    """เอกสารเลยกำหนดส่งแล้วแต่ยังไม่ส่งมอบ/ปิดเรื่อง"""
    subject = f"[{case.title}] เอกสารเลยกำหนดส่ง: {f.title}"
    body = "\n".join([
        f'เอกสาร "{f.title}" เลยกำหนดส่งแล้ว (กำหนดส่ง: {f.deadline.isoformat()}) และยังไม่ได้ส่งมอบ',
        "",
        *_document_lines(f),
        "",
        "ถ้าส่งมอบแล้ว เปลี่ยนสถานะเป็น Delivered หรือ Closed เพื่อหยุดแจ้งเตือน",
    ])
    return subject, body + _document_footer()


def document_request_resolved(from_case: Case, to_case: Case, req: DocumentRequest, who: Member) -> tuple[str, str]:
    """ผลคำขอกลับมาถึงผู้ขอ — ได้ไฟล์แล้ว หรือถูกปฏิเสธ"""
    if req.status == "fulfilled":
        subject = f"[{from_case.title}] ได้รับเอกสารแล้ว: {req.title}"
        lines = [f"{who.name} ({to_case.title}) ส่งเอกสาร \"{req.title}\" เข้าที่เก็บ \"{from_case.title}\" แล้ว"]
    else:
        subject = f"[{from_case.title}] คำขอเอกสารถูกปฏิเสธ: {req.title}"
        lines = [f"{who.name} ({to_case.title}) ปฏิเสธคำขอเอกสาร \"{req.title}\""]
        if req.reply:
            lines += ["", f"  เหตุผล: {req.reply}"]
    url = get_settings().app_url
    return subject, "\n".join(lines) + f"\n\nเปิดหน้า Documents: {url}\n\n--\nอีเมลนี้ส่งอัตโนมัติจากระบบ 3work"


def file_added(case: Case, f: CaseFile, who: Member) -> tuple[str, str]:
    """มีคนส่งเอกสารเข้าที่เก็บ — สมาชิกคนอื่นควรรู้ โดยเฉพาะฉบับแก้ไข"""
    what = f"ฉบับใหม่ (v{f.version}) ของเอกสารเดิม" if f.replaces_id else "เอกสารใหม่"
    subject = f"[{case.title}] {who.name} ส่ง{what}: {f.title}"
    lines = [
        f"{who.name} ส่ง{what}เข้า \"{case.title}\"",
        "",
        f"  เรื่อง: {f.title}",
        f"  ไฟล์: {f.filename}  ({f.category}, v{f.version})",
    ]
    if f.doc_number:
        lines.append(f"  เลขที่: {f.doc_number}")
    if f.agency:
        lines.append(f"  จาก: {f.agency}")
    if f.deadline:
        lines.append(f"  กำหนดส่ง: {f.deadline.isoformat()}")
    body = "\n".join(lines)
    url = get_settings().app_url
    return subject, body + f"\n\nเปิดหน้า Documents: {url}\n\n--\nอีเมลนี้ส่งอัตโนมัติจากระบบ 3work"


def _task_key(project: Project, task: Task) -> str:
    return f"{project.task_prefix}-{task.number:03d}"


def _footer(project: Project) -> str:
    url = get_settings().app_url
    return (
        f"\n\nเปิดบอร์ด: {url}\n"
        f"\n--\n"
        f"อีเมลนี้ส่งอัตโนมัติจากระบบ 3work ({project.name})\n"
        f"ไม่อยากรับแล้ว ลบอีเมลออกจากเมนูโปรไฟล์ในเว็บได้เลย"
    )


def task_created(project: Project, task: Task, author: Member) -> tuple[str, str]:
    key = _task_key(project, task)
    subject = f"[{project.name}] งานใหม่ {key} — {task.title}"

    lines = [
        f"{author.name} เพิ่มงานใหม่เข้าบอร์ด",
        "",
        f"  {key}  {task.title}",
    ]
    if task.category:
        lines.append(f"  หมวดหมู่: {task.category}")
    if task.estimate_hours:
        lines.append(f"  เวลาที่ประเมิน: {task.estimate_hours} ชม.")
    if task.due_date:
        lines.append(f"  กำหนดส่ง: {task.due_date}")
    if task.description:
        lines += ["", "รายละเอียด:", task.description]

    return subject, "\n".join(lines) + _footer(project)


def task_overdue(project: Project, task: Task) -> tuple[str, str]:
    """เลยกำหนดส่งแล้วแต่ยังไม่ปิดงาน — แจ้งคนรับงานกับเจ้าของโปรเจค"""
    key = _task_key(project, task)
    subject = f"[{project.name}] งานเลยกำหนดส่ง {key} — {task.title}"

    body = "\n".join([
        f"งาน {key} เลยวันที่กำหนดส่งแล้ว (กำหนดส่ง: {task.due_date.isoformat()})",
        "",
        f"  {key}  {task.title}",
    ])
    return subject, body + _footer(project)


def task_claimed(project: Project, task: Task, who: Member) -> tuple[str, str]:
    key = _task_key(project, task)
    subject = f"[{project.name}] {who.name} รับงาน {key} แล้ว"

    body = "\n".join([
        f"{who.name} รับงานใบนี้ไปทำแล้ว การ์ดย้ายไปคอลัมน์ \"กำลังทำ\"",
        "",
        f"  {key}  {task.title}",
    ])
    return subject, body + _footer(project)
