# syntax=docker/dockerfile:1
#
# build context = root ของ repo (ให้ path เหมือนเดิมกับตอนเป็น npm workspaces)
#   docker build -f backend/Dockerfile -t 3work-api .

FROM python:3.13-slim AS base
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=3000 \
    PATH="/opt/venv/bin:$PATH"


# ---------- deps: venv + dependency ของ production ----------
FROM base AS deps
COPY backend/requirements.txt ./
RUN python -m venv /opt/venv
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt


# ---------- dev: ใช้กับ docker-compose.dev.yml (uvicorn --reload) ----------
FROM deps AS dev
ENV ENV=development
COPY backend/requirements-dev.txt ./
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements-dev.txt
COPY backend/ ./
EXPOSE 3000
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-3000} --reload"]


# ---------- runner: image สุดท้าย (ไม่มี dev tool, ไม่มี pip cache) ----------
FROM base AS runner
COPY --from=deps /opt/venv /opt/venv
COPY backend/app ./app
COPY backend/alembic ./alembic
COPY backend/alembic.ini ./alembic.ini

RUN useradd --create-home --uid 1000 app
USER app
EXPOSE 3000
# รัน migration ให้ตารางตรงกับโค้ดก่อนเปิดรับ request เสมอ
# เชื่อ X-Forwarded-Proto จาก nginx ข้างหน้า ให้ทำงานเหมือนบน Render — ไฟล์นี้ใช้กับ compose บนเครื่องเท่านั้น
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-3000} --proxy-headers --forwarded-allow-ips='*'"]
