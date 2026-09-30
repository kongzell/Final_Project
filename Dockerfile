# syntax=docker/dockerfile:1
#
# image เดียวจบสำหรับ deploy (Render + Neon)
#   - build frontend ด้วย node แล้วคัดลอก dist เข้ามาเป็น backend/static
#   - FastAPI เสิร์ฟทั้ง /api/* และหน้าเว็บ จากโดเมนเดียวกัน
#
# ที่ต้องเป็นโดเมนเดียวเพราะ session cookie เป็น SameSite=Lax
# ถ้าแยก frontend/backend คนละโดเมน เบราว์เซอร์จะไม่ส่ง cookie = ล็อกอินไม่ติด
#
# รันในเครื่องเพื่อทดสอบก่อน deploy:
#   docker build -t 3work-allinone .
#   docker run --rm -p 3000:3000 -e DATABASE_URL=... 3work-allinone

# ---------- build หน้าเว็บ ----------
FROM node:24-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
RUN --mount=type=cache,target=/root/.npm npm ci
COPY frontend ./frontend
RUN npm run build -w frontend


# ---------- dependency ของ python ----------
FROM python:3.13-slim AS deps
ENV PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
COPY backend/requirements.txt ./
RUN python -m venv /opt/venv
RUN --mount=type=cache,target=/root/.cache/pip /opt/venv/bin/pip install -r requirements.txt


# ---------- image สุดท้าย ----------
FROM python:3.13-slim AS runner
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=3000 \
    PATH="/opt/venv/bin:$PATH"

COPY --from=deps /opt/venv /opt/venv
COPY backend/app ./app
COPY backend/alembic ./alembic
COPY backend/alembic.ini ./alembic.ini
COPY --from=web /app/frontend/dist ./static

RUN useradd --create-home --uid 1000 app
USER app

EXPOSE 3000
# รัน migration ให้ตารางตรงกับโค้ดก่อนเปิดรับ request เสมอ
# Render กำหนดพอร์ตผ่าน $PORT ซึ่งเปลี่ยนได้ จึงต้องอ่านจาก env ไม่ fix ไว้
# Render ปิด HTTPS ที่ proxy แล้วส่งต่อเป็น http — ต้องเชื่อ X-Forwarded-Proto ถึงจะรู้ว่าเป็น https
# และตั้ง cookie แบบ Secure ได้ เชื่อทุก IP ได้เพราะ container นี้รับ request ผ่าน proxy ของ Render เท่านั้น
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-3000} --proxy-headers --forwarded-allow-ips='*'"]
