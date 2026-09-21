from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import exists, or_, select

from app import mailer, notify
from app.config import LOCAL_TZ
from app.db import SessionLocal
from app.models import Case, CaseFile, Project, Task

log = logging.getLogger("overdue")

#: ไม่ใช่ระบบเรียลไทม์ — เช็คทุกชั่วโมงก็เพียงพอ ไม่ต้องถี่กว่านี้
CHECK_INTERVAL_SECONDS = 60 * 60

#: แจ้ง "ใกล้กำหนดส่ง" ล่วงหน้ากี่วัน — หนังสือราชการมักให้เวลาเป็นสัปดาห์ 3 วันพอทันเตรียม
DOC_DUE_SOON_DAYS = 3
DOC_OPEN_STATUSES = ("received", "in_progress")

# "วันนี้" ต้องเป็นวันตามปฏิทินไทย (LOCAL_TZ ใน config) — ถ้าใช้ date.today() ของคอนเทนเนอร์
# ซึ่งเป็น UTC การ์ดจะขึ้นสีส้มบนหน้าเว็บตั้งแต่เที่ยงคืนไทย แต่อีเมลไม่ออกจนกว่าจะ 7 โมงเช้า


async def _check_once() -> None:
    """ไล่งานที่เลยกำหนดและยังไม่เคยแจ้ง — ส่งอีเมลแล้วปักธงกันแจ้งซ้ำ"""
    today = datetime.now(LOCAL_TZ).date()

    async with SessionLocal() as session:
        rows = await session.scalars(
            select(Task).where(
                Task.due_date.is_not(None),
                Task.due_date < today,
                Task.status != "complete",
                Task.overdue_notified_at.is_(None),
            )
        )
        tasks = list(rows)
        if not tasks:
            return

        sent = 0
        for task in tasks:
            project = await session.get(Project, task.project_id)
            if project is None:
                continue

            # คนรับงาน + เจ้าของโปรเจค — โปรเจคเก่าบางใบไม่มีเจ้าของ ต้องกรอง None ออก
            recipient_ids = {m.id for m in task.assignees} | {project.owner_id}
            recipient_ids.discard(None)

            recipients = await notify.emails_of(session, recipient_ids)
            if recipients:
                subject, body = notify.task_overdue(project, task)
                await mailer.send(recipients, subject, body)
                sent += 1
            else:
                notify.explain_skip("overdue", task, len(recipient_ids), 0)

            # ปักธงแม้ไม่มีใครกรอกอีเมลไว้เลย ไม่งั้นจะวนเช็คงานใบเดิมทุกชั่วโมงตลอดไป
            task.overdue_notified_at = datetime.now(UTC)

        await session.commit()
        log.info("งานเลยกำหนดส่ง %d งาน — ส่งอีเมลได้ %d งาน", len(tasks), sent)


async def _document_recipients(session, case: Case, f: CaseFile) -> list[str]:
    """คนอัปโหลด + เจ้าของ/admin ของที่เก็บ — ไม่มี "ผู้รับผิดชอบ" รายใบ จึงส่งหาคนที่ดูแลได้ทั้งหมด"""
    ids = {f.uploaded_by, case.owner_id, *case.admin_ids}
    ids.discard(None)
    return await notify.emails_of(session, ids)


async def _check_documents_once() -> None:
    """เอกสารที่ยังไม่จบและเป็นฉบับล่าสุดของสาย — แจ้งใกล้กำหนด 1 ครั้ง เลยกำหนด 1 ครั้ง"""
    today = datetime.now(LOCAL_TZ).date()
    soon = today + timedelta(days=DOC_DUE_SOON_DAYS)

    async with SessionLocal() as session:
        newer = CaseFile.__table__.alias("newer")
        superseded = exists().where(newer.c.replaces_id == CaseFile.id)
        rows = await session.scalars(
            select(CaseFile).where(
                CaseFile.deadline.is_not(None),
                CaseFile.deadline <= soon,
                CaseFile.status.in_(DOC_OPEN_STATUSES),
                ~superseded,
                or_(CaseFile.overdue_notified_at.is_(None), CaseFile.due_soon_notified_at.is_(None)),
            )
        )
        files = list(rows)
        if not files:
            return

        sent = checked = 0
        now = datetime.now(UTC)
        for f in files:
            case = await session.get(Case, f.case_id)
            if case is None:
                continue

            if f.deadline < today:
                if f.overdue_notified_at is not None:
                    continue
                subject, body = notify.document_overdue(case, f)
                f.overdue_notified_at = now
                # เลยกำหนดแล้วไม่ต้องตามด้วย "ใกล้กำหนด" อีก
                f.due_soon_notified_at = f.due_soon_notified_at or now
            else:
                if f.due_soon_notified_at is not None:
                    continue
                subject, body = notify.document_due_soon(case, f, (f.deadline - today).days)
                f.due_soon_notified_at = now

            checked += 1
            recipients = await _document_recipients(session, case, f)
            if recipients:
                await mailer.send(recipients, subject, body)
                sent += 1
            else:
                log.info("document deadline %s — ไม่ส่งแจ้งเตือน: คนที่ดูแลไม่มีอีเมล", f.title)

        await session.commit()
        if checked:
            log.info("เอกสารใกล้/เลยกำหนดส่ง %d ใบ — ส่งอีเมลได้ %d ใบ", checked, sent)


async def run_forever() -> None:
    """ลูปพื้นหลัง เริ่มตอนแอปสตาร์ท เช็คทันทีหนึ่งรอบแล้วค่อยรอตามรอบปกติ"""
    while True:
        try:
            await _check_once()
        except Exception:  # noqa: BLE001 — เช็ครอบนี้พังก็แค่รอรอบหน้า ห้ามทำแอปล้ม
            log.exception("เช็คงานเลยกำหนดส่งพัง")
        try:
            await _check_documents_once()
        except Exception:  # noqa: BLE001
            log.exception("เช็คเอกสารใกล้/เลยกำหนดส่งพัง")
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)
