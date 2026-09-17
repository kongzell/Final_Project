from datetime import timedelta, timezone
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

#: ค่าเริ่มต้นชี้ไป postgres ที่ docker compose เปิดพอร์ตไว้ที่เครื่อง
#: ใน container เองจะถูก override เป็น host `db` ผ่าน environment
DEFAULT_DATABASE_URL = "postgresql://followup:followup@localhost:55432/followup"


class Settings(BaseSettings):
    """ค่า config ทั้งหมดอ่านจาก environment (หรือไฟล์ .env ตอน dev)

    pydantic ตรวจชนิดข้อมูลให้ตั้งแต่ตอนบูต ถ้าค่าผิดรูปแบบ
    แอปจะไม่ start พร้อมบอกว่าตัวไหนพัง
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # หมายเหตุ: PORT ไม่ได้อ่านตรงนี้ — uvicorn เป็นคนรับผิดชอบ (ดู CMD ใน Dockerfile)
    # origin ที่อนุญาตให้เรียก API (คั่นหลายค่าด้วย ,)
    cors_origin: str = "http://localhost:5173"
    database_url: str = DEFAULT_DATABASE_URL

    # --- Gemini ---
    #: ขอได้ที่ https://aistudio.google.com/apikey แล้วใส่ใน .env
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.6-flash"
    #: เปิดไว้เพื่อลอง UI โดยไม่ต้องมี API key — จะคืนข้อมูลตัวอย่างที่ติดป้ายว่า mock
    ai_mock: bool = False

    # --- GitHub ---
    #: จาก Settings > Developer settings > OAuth Apps
    github_client_id: str = ""
    github_client_secret: str = ""
    #: ต้องตรงกับ Authorization callback URL ที่ตั้งไว้บน GitHub เป๊ะ ๆ
    github_callback_url: str = "http://localhost:8081/api/auth/github/callback"
    #: เปิดให้สมัครบัญชีแบบธรรมดาเองได้ไหม — ปิดเมื่ออยากให้มีแต่คนที่ถูกสร้างไว้แล้ว
    allow_signup: bool = True

    #: repo ที่จะดึง commit มาแสดง เช่น "kongzell008/follow-up"
    github_repo: str = ""
    #: secret ที่ตั้งไว้ตอนสร้าง webhook บน GitHub (ใช้ตรวจลายเซ็น)
    github_webhook_secret: str = ""

    # --- แจ้งเตือนทางอีเมล (Brevo) ---
    #: ขอได้ที่ Brevo > SMTP & API > API Keys
    #: ใช้ HTTPS API แทน SMTP เพราะ Render บล็อกพอร์ต 587 ขาออก
    brevo_api_key: str = ""
    #: อีเมลผู้ส่ง — ต้องยืนยันไว้ใน Brevo ก่อน ไม่งั้นจะถูกปฏิเสธ
    mail_from: str = ""
    #: ชื่อที่ผู้รับเห็นคู่กับอีเมลผู้ส่ง
    mail_from_name: str = "3work"
    #: URL ของเว็บ ใช้ทำลิงก์ในอีเมล
    app_url: str = "http://localhost:8081"

    @property
    def mail_ready(self) -> bool:
        return bool(self.brevo_api_key and self.mail_from)

    # --- session ---
    #: ใช้เซ็น cookie — ตอน deploy จริงต้องเปลี่ยนเป็นค่าสุ่มยาว ๆ
    session_secret: str = "dev-secret-change-me"
    #: ใช้เข้ารหัส github_token ที่เก็บในฐานข้อมูล
    #: ถ้าไม่ตั้งจะยืม session_secret มาใช้ — แยกกันดีกว่าเพราะเปลี่ยนคนละจังหวะ
    token_secret: str = ""

    @property
    def secrets_ready(self) -> bool:
        """true เมื่อไม่มี secret ตัวไหนยังเป็นค่า default ของ dev"""
        return self.session_secret != "dev-secret-change-me"

    @property
    def github_ready(self) -> bool:
        return bool(self.github_client_id and self.github_client_secret)

    @property
    def auth_ready(self) -> bool:
        return self.github_ready

    @property
    def ai_ready(self) -> bool:
        return bool(self.gemini_api_key) or self.ai_mock

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origin.split(",") if o.strip()]

    @property
    def database_dsn(self) -> str:
        """เติมชื่อไดรเวอร์ async ให้ URL ที่เขียนมาแบบสั้น

        compose เขียน `postgresql://...` ซึ่งอ่านง่ายกว่า แต่ SQLAlchemy แบบ async
        ต้องการ `postgresql+asyncpg://...` จึงแปลงให้ตรงนี้ที่เดียว
        """
        url = self.database_url
        if url.startswith("postgresql://"):
            return url.replace("postgresql://", "postgresql+asyncpg://", 1)
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql+asyncpg://", 1)
        return url


@lru_cache
def get_settings() -> Settings:
    return Settings()


#: เขตเวลาที่ใช้ตัดสินว่า "วันนี้" คือวันไหน — ผู้ใช้อยู่ไทย แต่คอนเทนเนอร์รันเป็น UTC
#: offset ตายตัวเพราะไทยไม่มี daylight saving และ image ไม่ได้ลง tzdata
LOCAL_TZ = timezone(timedelta(hours=7))
