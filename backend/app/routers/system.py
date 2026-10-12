import logging

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import require_member
from app.config import get_settings
from app.db import get_session
from app.models import Member
from app.schemas import SystemHealth

router = APIRouter(prefix="/api/system", tags=["system"])
log = logging.getLogger("system")


@router.get("/health", response_model=SystemHealth)
async def health(
    _me: Member = Depends(require_member),
    session: AsyncSession = Depends(get_session),
) -> SystemHealth:
    """สถานะของระบบหลังบ้าน ใช้แสดงในแถบ System & Database Health

    ต้องล็อกอินก่อน เพราะบอกการตั้งค่าภายใน (ชื่อ repo, สถานะ secret) ที่คนนอกไม่ควรเห็น
    Render กับ docker ตรวจสุขภาพผ่าน /api/health ซึ่งไม่มีข้อมูลพวกนี้ จึงไม่กระทบ
    """
    settings = get_settings()

    database_ok = True
    database_error: str | None = None
    try:
        await session.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001 — ฐานข้อมูลล่มต้องตอบได้ว่าล่ม ไม่ใช่พังตาม
        # ข้อความ error ดิบอาจมีชื่อโฮสต์/ผู้ใช้ฐานข้อมูล — เก็บไว้ใน log ฝั่งเซิร์ฟเวอร์เท่านั้น
        log.exception("database health check failed")
        database_ok = False
        database_error = "Database is unreachable"

    return SystemHealth(
        api_ok=True,
        database_ok=database_ok,
        database_error=database_error,
        database_kind="postgres",
        ai_ready=settings.ai_ready,
        ai_model=settings.gemini_model,
        auth_ready=settings.auth_ready,
        github_repo=settings.github_repo or None,
        webhook_ready=bool(settings.github_webhook_secret),
        secrets_ready=settings.secrets_ready,
    )
