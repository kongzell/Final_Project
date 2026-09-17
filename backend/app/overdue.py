from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime

from sqlalchemy import select

from app import mailer, notify
from app.config import LOCAL_TZ
from app.db import SessionLocal
from app.models import Project, Task

log = logging.getLogger("overdue")

#: ไม่ใช่ระบบเรียลไทม์ — เช็คทุกชั่วโมงก็เพียงพอ ไม่ต้องถี่กว่านี้
CHECK_INTERVAL_SECONDS = 60 * 60

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


async def run_forever() -> None:
    """ลูปพื้นหลัง เริ่มตอนแอปสตาร์ท เช็คทันทีหนึ่งรอบแล้วค่อยรอตามรอบปกติ"""
    while True:
        try:
            await _check_once()
        except Exception:  # noqa: BLE001 — เช็ครอบนี้พังก็แค่รอรอบหน้า ห้ามทำแอปล้ม
            log.exception("เช็คงานเลยกำหนดส่งพัง")
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)
