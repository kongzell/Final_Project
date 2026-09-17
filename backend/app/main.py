import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app import overdue
from app.config import get_settings
from app.routers import ai, auth, cases, github, members, projects, system, tasks

settings = get_settings()

# uvicorn ตั้ง handler ให้เฉพาะ logger ของตัวเอง logger ของแอปเราจึงเงียบสนิท
# ตั้งแต่ระดับ INFO ลงมา ทำให้ log ของการแจ้งเตือนไม่โผล่ทั้งที่ทำงานอยู่
logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s | %(message)s")
# httpx log ทุกครั้งที่เรียก GitHub/Gemini ที่ระดับ INFO — รกและไม่ได้ใช้
logging.getLogger("httpx").setLevel(logging.WARNING)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # เช็คงานเลยกำหนดส่งเป็นระยะอยู่เบื้องหลัง ตลอดอายุของแอป
    task = asyncio.create_task(overdue.run_forever())
    try:
        yield
    finally:
        task.cancel()


# docs วางไว้ใต้ /api เพื่อให้ผ่าน proxy ของ vite (dev) และ nginx (prod) ได้เหมือน endpoint อื่น
app = FastAPI(
    title="3work api",
    docs_url="/api/docs",
    redoc_url=None,
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ai.router)
app.include_router(auth.router)
app.include_router(cases.router)
app.include_router(github.router)
app.include_router(system.router)
app.include_router(members.router)
app.include_router(projects.router)
app.include_router(tasks.router)


class Health(BaseModel):
    ok: bool
    service: str
    time: datetime


@app.get("/api/health")
def health() -> Health:
    return Health(ok=True, service="3work api", time=datetime.now(UTC))


# ---------- หน้าเว็บ ----------
#
# ตอน deploy รวม frontend กับ API ไว้ที่ service เดียว เพราะ session cookie เป็น
# SameSite=Lax ถ้าแยกคนละโดเมนเบราว์เซอร์จะไม่ส่ง cookie ข้ามไป = ล็อกอินไม่ติด
# อยู่โดเมนเดียวกันยังทำให้ไม่ต้องตั้ง CORS และมี callback/webhook URL ที่เดียว
#
# ตอนรันในเครื่องด้วย docker compose โฟลเดอร์นี้จะไม่มี — nginx เป็นคนเสิร์ฟแทน
STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


class SpaFiles(StaticFiles):
    """เสิร์ฟไฟล์ที่ build แล้ว และคืน index.html ให้เส้นทางที่ไม่มีไฟล์จริง

    บอร์ดเป็น SPA เส้นทางอย่าง /project/123 ไม่มีไฟล์อยู่จริง ถ้าไม่ fallback
    ผู้ใช้ที่ refresh หน้ากลางทางจะเจอ 404

    เรื่อง cache ต้องจัดเองเพราะไม่ได้ผ่าน nginx เหมือนตอนรันบนเครื่อง:
    - index.html ห้ามจำ — ชื่อไฟล์ใน /assets/ เปลี่ยนทุก build ถ้าเบราว์เซอร์จำ
      index.html เก่าไว้ จะขอ JS ชื่อเก่าที่ไม่มีแล้ว และเห็นหน้าเว็บเวอร์ชันเก่าค้าง
    - /assets/ จำได้ยาว ๆ — ชื่อไฟล์มี hash อยู่แล้ว เนื้อหาเปลี่ยนชื่อก็เปลี่ยน
    """

    async def get_response(self, path: str, scope):  # noqa: ANN001, ANN201
        try:
            response = await super().get_response(path, scope)
        except Exception:
            # ไฟล์ที่มีนามสกุล (js/css/svg) หาไม่เจอต้องเป็น 404 จริง ๆ
            # ไม่งั้น JS ชื่อเก่าจะได้ HTML กลับไปแทน แล้วหน้าเว็บพังแบบหาสาเหตุยาก
            name = path.rsplit("/", 1)[-1]
            if "." in name:
                raise
            index = STATIC_DIR / "index.html"
            if not index.is_file():
                raise
            response = FileResponse(index)

        # ดูจากไฟล์ที่ตอบกลับจริง ไม่ดูจาก path — เพราะ "/" ถูกส่งมาเป็น "." และ
        # หน้า SPA ที่ fallback ก็ไม่มีคำว่า index.html ใน path เลย
        served = str(getattr(response, "path", ""))
        if served.endswith("index.html"):
            response.headers["Cache-Control"] = "no-cache"
        elif path.startswith("assets/"):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response


if STATIC_DIR.is_dir():
    # ต้อง mount ท้ายสุด ไม่งั้นจะกลืน /api/* ที่ประกาศไว้ข้างบน
    app.mount("/", SpaFiles(directory=STATIC_DIR, html=True), name="web")
