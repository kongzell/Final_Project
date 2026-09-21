# 3work

บอร์ดติดตามงานที่ผูกกับ GitHub — แตกงานด้วย AI, ดึงทีมจาก collaborator ของ repo
ขยับการ์ดเองเมื่อมี commit หรือ merge PR แจ้งเตือนทางอีเมล มีแดชบอร์ดให้หัวหน้าดูภาพรวม
และมีที่เก็บเอกสารกลางของทีม (TOR สัญญา หนังสือราชการ) ที่ผูกกับโปรเจคและให้ AI แตกงานจากไฟล์ได้

React 19 + TypeScript · FastAPI + SQLAlchemy (async) · PostgreSQL 18 · Gemini · GitHub OAuth · Brevo

## ทำอะไรได้บ้าง

- **บอร์ด Kanban** รอเริ่ม / กำลังทำ / รอตรวจ / เสร็จแล้ว — จัดกลุ่มตามคน หมวดหมู่ หรือความสำคัญได้
  เวลาประเมินและเวลาที่ใช้จริงเป็นวัน การ์ดเลยกำหนดขึ้นสีส้ม การ์ดที่ต้องรองานอื่นก่อนมีป้าย "รอ …"
- **แตกงานด้วย AI** พิมพ์สิ่งที่อยากได้ (หรือให้อ่านจากไฟล์ TOR) Gemini แตกเป็นการ์ดพร้อมรายละเอียด
  หมวดหมู่ เวลาประเมิน ลำดับก่อนหลัง และเลือกเองว่าจะแตกตามฟีเจอร์ (agile) หรือตามชั้นงาน (waterfall)
  — บังคับแบบไหนหรือระบุ framework ได้ที่ช่อง More context แก้ทุกช่องได้ก่อนกดเพิ่ม
- **Documents** ที่เก็บเอกสารกลางของทีม เอกสารทุกเรื่องส่งเข้าที่เดียว แต่ละใบมีเรื่อง เลขที่ หน่วยงาน
  กำหนดส่ง สถานะ (รับเรื่อง → ดำเนินการ → ส่งมอบ → ปิด) และผูกโปรเจคเป็นรายใบ — เอกสารที่ผูกโปรเจค
  ทีมโปรเจคเห็นและเปิดได้จากบอร์ด · ขอเอกสารข้ามทีมได้ (อีกฝั่งเลือกไฟล์ส่งหรือปฏิเสธ) · เก็บเวอร์ชันเก่าไว้
- **GitHub** ล็อกอินด้วย GitHub, ดึงทีมจาก collaborator, webhook ย้ายการ์ดตามรหัสงานใน commit/PR
  หรือสมัครบัญชีธรรมดาด้วย username/password ก็ได้ (ปิดการสมัครด้วย `ALLOW_SIGNUP=false`)
- **แจ้งเตือนอีเมล** งานใหม่ มีคนรับงาน งานเลยกำหนด และเหตุการณ์ในที่เก็บเอกสาร (ใครอยากรับก็กรอกอีเมลในเมนูโปรไฟล์)
- **แดชบอร์ด** ภาพรวมโปรเจค + รายคน (งานเสร็จ ส่งตรงเวลา โดนตีกลับ ภาระงาน) ไว้ประกอบการประเมิน
- **โน้ตใต้การ์ด** คนรับงานจดปัญหา/แนวทางแก้ไว้ให้หัวหน้าเห็น
- **admin ของโปรเจค/ที่เก็บ** เจ้าของตั้งสมาชิกให้มีสิทธิ์เท่าตัวเองในเว็บได้ (ไม่เกี่ยวกับสิทธิ์บน GitHub)

## เริ่มใช้งาน

สร้างไฟล์ `.env` ที่ root แล้ววางค่าข้างล่าง จากนั้น

```bash
docker compose up -d --build  # เปิด http://localhost:8081
```

โหมด dev (hot reload, เว็บไปพอร์ต 5173):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

> สลับโหมดแล้วต้องแก้ `GITHUB_CALLBACK_URL` ให้ตรงพอร์ต และเพิ่ม URL นั้นใน OAuth App

## .env

```bash
# --- Postgres (ใช้ตอนรันด้วย docker compose) ---
POSTGRES_USER=followup
POSTGRES_PASSWORD=followup
POSTGRES_DB=followup
DB_PORT=55432          # เลี่ยงชนกับ postgres ที่อาจมีอยู่แล้วในเครื่อง
API_PORT=3000
WEB_PORT=8081

DATABASE_URL=

GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.6-flash
AI_MOCK=false          # true = ใช้ข้อมูลตัวอย่างแทนการเรียก Gemini

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_CALLBACK_URL=http://localhost:8081/api/auth/github/callback
GITHUB_REPO=           # owner/repo ที่จะดึง commit มาแสดง
GITHUB_WEBHOOK_SECRET= # ค่าเดียวกับที่ตั้งตอนสร้าง webhook
ALLOW_SIGNUP=true      # false = ปิดหน้าสมัครบัญชีธรรมดา เหลือแค่ล็อกอิน

# --- ความลับ: ตอน deploy ต้องสุ่มใหม่ทั้งคู่ ---
SESSION_SECRET=dev-secret-change-me   # เซ็น session cookie
TOKEN_SECRET=                         # เข้ารหัส github_token (ว่าง = ยืม SESSION_SECRET)
CORS_ORIGIN=http://localhost:8081

BREVO_API_KEY=
MAIL_FROM=             # อีเมลผู้ส่งที่ยืนยันใน Brevo แล้ว
MAIL_FROM_NAME=3work
APP_URL=http://localhost:8081   # ลิงก์กลับมาที่บอร์ดในอีเมล — ตอน deploy ใส่ URL จริง
```

> ใช้ HTTPS API ของ Brevo ไม่ใช่ SMTP เพราะ Render บล็อกพอร์ต 587 ขาออก · ฟรี 300 ฉบับ/วัน

## โครงสร้าง

```
frontend/              หน้าเว็บ (บอร์ด การ์ด แถบข้าง แดชบอร์ด หน้า Documents)
backend/app/routers/   endpoint ทั้งหมด (auth github projects tasks members cases ai system)
backend/app/models.py  ตาราง 8 ตัว (members projects tasks task_comments cases case_files
                       document_requests webhook_events + ตารางเชื่อม)
backend/app/ai.py      คุยกับ Gemini — แตกงานจากข้อความหรือไฟล์ / เดาว่า commit ตรงกับงานไหน
backend/app/notify.py  เนื้อหาอีเมล + หาผู้รับ · mailer.py ส่งผ่าน Brevo
backend/app/overdue.py งานเบื้องหลังเช็คงานเลยกำหนดทุกชั่วโมง
backend/app/passwords.py  แฮชรหัสผ่านบัญชีธรรมดา (scrypt)
backend/app/crypto.py  เข้ารหัส github_token ก่อนเก็บ
backend/app/db.py      แปลง DSN ของ Neon ให้ asyncpg ใช้ได้
backend/alembic/       migration — container รันให้เองตอน start
Dockerfile             image รวม frontend + API สำหรับ deploy
render.yaml            ค่าตั้งสำหรับ Render (env ทั้งหมดที่ต้องกรอก)
```

## สิทธิ์

สิทธิ์เป็นรายโปรเจค — คนเดียวกันเป็นเจ้าของโปรเจคหนึ่งและสมาชิกธรรมดาในอีกโปรเจคได้
เจ้าของตั้ง **admin** ได้จากหน้า Add member (สิทธิ์ในเว็บอย่างเดียว ไม่แตะ collaborator บน GitHub)

ที่เก็บเอกสาร (Documents) ใช้กติกาเดียวกัน: สมาชิกส่ง/ดูเอกสาร · คนส่งแก้ข้อมูลใบของตัวเอง ·
เจ้าของหรือ admin แก้ได้ทุกใบ จัดการคน ตอบคำขอจากทีมอื่น · เจ้าของคนเดียวลบไฟล์/ลบที่เก็บ
ผูกเอกสารกับโปรเจค (ต้องเป็นเจ้าของ/admin ของโปรเจคนั้น) = สมาชิกโปรเจคเปิดใบนั้นได้แม้ไม่ได้อยู่ในที่เก็บ

## รหัสงาน

การ์ดทุกใบมีรหัส `<รหัสย่อโปรเจค>-<เลข>` เช่น `KST-001` (รหัสย่อตั้งจากอักษรตัวแรกของชื่อ repo)

```bash
git commit -m "พัฒนา REST API สินค้า KST-003"   # การ์ดย้ายไป "รอตรวจ"
```
merge PR ที่อ้างรหัสนั้น → การ์ดเป็น **เสร็จแล้ว** · อ่านเฉพาะบรรทัดแรกของ commit และชื่อ/รายละเอียด PR

push ขึ้น branch ไหนก็นับ (ไม่ต้องรอ merge เข้า main) · คนที่ทำคือ author ของ commit ไม่ใช่คน push

commit ที่ลืมใส่รหัส Gemini จะเดาให้ว่าตรงกับงานใบไหน แล้วขึ้นเป็นข้อเสนอในแถบ GitHub Activity
พร้อมเหตุผลและระดับความมั่นใจ — **ไม่ย้ายการ์ดเอง** เจ้าของหรือ admin ต้องกดยืนยันก่อน

งานที่ปิดแล้วถูกดันกลับมาทำใหม่จะติดป้าย "Rework" และนับจำนวนครั้งไว้ให้ดูในแดชบอร์ด

## แจ้งเตือนอีเมล

| เหตุการณ์ | ส่งถึง |
| --- | --- |
| สร้างงานใหม่ | สมาชิกทุกคนในโปรเจค ยกเว้นคนสร้าง |
| มีคนรับงาน | เจ้าของโปรเจคกับคนที่ถูก assign ยกเว้นคนกดเอง |
| งานเลยกำหนดส่ง (เช็คทุกชั่วโมง) | คนรับงานทุกคน + เจ้าของโปรเจค — ครั้งเดียวต่อการ์ด |
| เอกสารใกล้กำหนดส่ง (3 วันก่อน) / เลยกำหนดส่ง | คนอัปโหลด + เจ้าของ/admin ของที่เก็บ — อย่างละครั้ง รีเซ็ตเมื่อเลื่อนกำหนดหรือเปิดเรื่องใหม่ |
| มีคนส่งเอกสารเข้าที่เก็บ | สมาชิกที่เก็บ ยกเว้นคนอัปโหลด |
| ทีมอื่นขอเอกสารจากเรา | เจ้าของ + admin ของที่เก็บที่ถูกขอ |
| คำขอได้รับไฟล์ / ถูกปฏิเสธ | สมาชิกทีมผู้ขอ |

ส่งเฉพาะคนที่กรอกอีเมลไว้ในเมนูโปรไฟล์ — ไม่กรอกถือว่าไม่รับแจ้งเตือน
ถ้าไม่มีอีเมลออก ดู `docker compose logs api` จะบอกเหตุผล (logger `notify` / `mailer`)

## Deploy (Render + Neon)

image เดียวตาม `Dockerfile` — ตอน start รัน `alembic upgrade head` แล้วเสิร์ฟทั้ง API และหน้าเว็บ
ค่า env ทั้งหมดอยู่ใน `render.yaml` · `DATABASE_URL` ใส่ของ Neon · `GITHUB_CALLBACK_URL`, `APP_URL`, `CORS_ORIGIN` ใส่ URL ของ Render
push ขึ้น `master` แล้ว Render build ให้เอง