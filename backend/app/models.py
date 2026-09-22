"""ตาราง 5 ตัว: members, projects, tasks + ตารางเชื่อม 2 ตัว

สถานะกับความสำคัญเก็บเป็น string ไม่ได้ใช้ ENUM ของ postgres
เพราะ ENUM แก้ทีหลังต้องเขียน migration เอง ส่วนการตรวจค่าให้ pydantic ทำแทน
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from app import crypto


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


# ---------- ตารางเชื่อม ----------

project_members = Table(
    "project_members",
    Base.metadata,
    Column("project_id", ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True),
    Column("member_id", ForeignKey("members.id", ondelete="CASCADE"), primary_key=True),
    #: "member" หรือ "admin" — admin ทำได้เท่าเจ้าของในหน้าเว็บ (สร้าง/ปิดงาน จัดการสมาชิก)
    #: ยกเว้นลบโปรเจคกับตั้ง admin คนอื่น ซึ่งเป็นของเจ้าของคนเดียว
    #: เป็นสิทธิ์ต่อโปรเจค ไม่เกี่ยวกับสิทธิ์บน GitHub
    Column("role", String(10), nullable=False, default="member", server_default="member"),
)

task_assignees = Table(
    "task_assignees",
    Base.metadata,
    Column("task_id", ForeignKey("tasks.id", ondelete="CASCADE"), primary_key=True),
    Column("member_id", ForeignKey("members.id", ondelete="CASCADE"), primary_key=True),
)

#: สมาชิกของ "เรื่อง" ในหน้า Documents — โครงเดียวกับ project_members ทุกประการ
#: แยกจากสมาชิกโปรเจคเพราะฝ่ายรับเอกสารกับฝ่ายเขียนโค้ดอาจเป็นคนละคน
case_members = Table(
    "case_members",
    Base.metadata,
    Column("case_id", ForeignKey("cases.id", ondelete="CASCADE"), primary_key=True),
    Column("member_id", ForeignKey("members.id", ondelete="CASCADE"), primary_key=True),
    Column("role", String(10), nullable=False, default="member", server_default="member"),
)


# ---------- ตารางหลัก ----------

class Member(Base):
    __tablename__ = "members"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(120))
    #: ตำแหน่งงาน — GitHub ไม่มีข้อมูลนี้ ต้องกรอกเอง
    role: Mapped[str] = mapped_column(String(60), default="Member")
    #: สีพื้นหลังของ avatar เช่น #7b68ee (ใช้เมื่อไม่มี avatar_url)
    color: Mapped[str] = mapped_column(String(9))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    # --- ข้อมูลจาก GitHub (มีเฉพาะคนที่ login เข้ามา) ---
    github_id: Mapped[str | None] = mapped_column(String(40), unique=True, nullable=True)
    github_login: Mapped[str | None] = mapped_column(String(80), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    email: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # --- บัญชีแบบธรรมดา (username + รหัสผ่าน) — บัญชี GitHub ปล่อยเป็น NULL ทั้งคู่ ---
    #: ชื่อผู้ใช้สำหรับล็อกอิน ตัวพิมพ์เล็ก ไม่ซ้ำ — แยกจาก email ที่ใช้รับแจ้งเตือน
    username: Mapped[str | None] = mapped_column(String(40), unique=True, nullable=True)
    #: scrypt hash จาก app.passwords — ห้ามอ่านหรือส่งออกไปที่ไหน
    password_hash: Mapped[str | None] = mapped_column(Text, nullable=True)

    #: access token ของ GitHub — เก็บไว้เรียก API ทีหลัง (เช่น ดึงรายชื่อสมาชิก org)
    #: หมายเหตุความปลอดภัย: เก็บเป็น plaintext ตอน dev
    #: ก่อนขึ้น production ควรเข้ารหัสก่อนบันทึก
    #: เก็บเป็นค่าที่เข้ารหัสแล้ว — อ่าน/เขียนผ่าน property `token` เท่านั้น
    github_token: Mapped[str | None] = mapped_column(Text, nullable=True)

    @property
    def token(self) -> str | None:
        """access token ของ GitHub แบบถอดรหัสแล้ว"""
        return crypto.decrypt(self.github_token)

    @token.setter
    def token(self, value: str | None) -> None:
        self.github_token = crypto.encrypt(value)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(160))
    #: repo บน GitHub ที่โปรเจคนี้ผูกอยู่ เช่น "kongzell/Follow-up"
    github_repo: Mapped[str | None] = mapped_column(String(200), nullable=True)
    #: รหัสย่อที่ใช้นำหน้าเลขงาน เช่น "KST" -> KST-001
    #: ตั้งจากชื่อ repo ตอนสร้าง แล้วเจ้าของแก้เองได้
    task_prefix: Mapped[str] = mapped_column(String(10), default="TASK")
    #: คนที่สร้างโปรเจค — ลบ/เปลี่ยนชื่อโปรเจคได้คนเดียว
    #: null ได้เพื่อไม่ให้โปรเจคหายตามเจ้าของที่ถูกลบ (ON DELETE SET NULL)
    owner_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("members.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    members: Mapped[list[Member]] = relationship(secondary=project_members, lazy="selectin")
    #: แถวในตารางเชื่อมพร้อม role — อ่านอย่างเดียว การเพิ่ม/ลบคนยังทำผ่าน members
    memberships: Mapped[list[ProjectMember]] = relationship(lazy="selectin", viewonly=True)
    tasks: Mapped[list[Task]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="Task.position",
        lazy="selectin",
    )

    @property
    def admin_ids(self) -> set[str]:
        return {pm.member_id for pm in self.memberships if pm.role == "admin"}

    def can_manage(self, member_id: str | None) -> bool:
        """เจ้าของหรือ admin — ใช้แทนการเช็ค owner_id ตรง ๆ ในทุก endpoint"""
        return member_id is not None and (member_id == self.owner_id or member_id in self.admin_ids)


class ProjectMember(Base):
    """แถวหนึ่งในตารางเชื่อม — มีไว้อ่าน role เท่านั้น"""

    __table__ = project_members

    member: Mapped[Member] = relationship(lazy="selectin")


class Task(Base):
    __tablename__ = "tasks"
    #: เลขงานห้ามซ้ำในโปรเจคเดียวกัน ไม่งั้น commit อ้างถึงแล้วไม่รู้ว่าใบไหน
    __table_args__ = (UniqueConstraint("project_id", "number", name="uq_tasks_project_number"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"))
    #: เลขงานในโปรเจค เริ่มที่ 1 — ประกอบกับ task_prefix เป็นรหัสอย่าง KST-001
    number: Mapped[int] = mapped_column(Integer)
    #: งานแม่ — งานที่ AI แตกให้จะชี้กลับมาที่หัวข้อกว้าง ๆ ที่ผู้ใช้พิมพ์
    parent_id: Mapped[str | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True
    )
    title: Mapped[str] = mapped_column(Text)
    #: รายละเอียดงาน — ขอบเขต เงื่อนไข หรือสิ่งที่ต้องส่งมอบ เจ้าของเป็นคนเขียน
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="todo")
    priority: Mapped[str] = mapped_column(String(20), default="none")
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    #: ลำดับการ์ดในคอลัมน์ — เป็น float เพื่อให้แทรกระหว่างสองใบได้โดยไม่ต้องเรียงใหม่ทั้งคอลัมน์
    position: Mapped[float] = mapped_column(Float, default=1000.0)

    # --- ฟิลด์ที่ AI เติมให้ (ผู้ใช้แก้เองได้) ---
    #: Frontend / Backend / Database / ... — ใช้เป็นคอลัมน์ได้เมื่อจัดกลุ่มตามหมวดหมู่
    category: Mapped[str | None] = mapped_column(String(40), nullable=True)
    #: true เมื่อเจ้าของตีงานกลับจาก "รอตรวจ" ให้กลับไปแก้
    #: ล้างเมื่อส่งตรวจใหม่หรือปิดงาน — ใช้ทำให้การ์ดขึ้นสีเตือน
    needs_rework: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    #: นับสะสมว่างานใบนี้ถูกตีกลับมาแก้กี่ครั้ง
    #: ต้องแยกจาก needs_rework เพราะอันนั้นถูกล้างทุกครั้งที่ส่งตรวจใหม่
    #: ประวัติจึงหายไป ใช้ประเมินคุณภาพงานย้อนหลังไม่ได้
    rework_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    #: เวลาที่งานถูกปิด — เทียบกับ due_date เพื่อดูว่าส่งทันกำหนดไหม
    #: ใช้ updated_at แทนไม่ได้ เพราะขยับทุกครั้งที่มีคนแก้การ์ดหลังปิดงาน
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    #: เวลาที่งานถูกดึงออกจาก "รอเริ่ม" ครั้งแรก — ตั้งครั้งเดียวไม่เปลี่ยนอีก
    #: แม้จะถูกตีกลับไปแก้กี่รอบก็ตาม เพราะถือว่างานเริ่มทำมาตั้งแต่ตอนนั้น
    #: ใช้คู่กับ completed_at คำนวณเวลาที่ใช้จริง แยกจาก estimate_hours ที่เป็นแค่การเดา
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    #: เวลาที่ส่งอีเมลแจ้งเตือน "เลยกำหนดส่ง" ไปแล้ว — กันไม่ให้ยิงซ้ำทุกครั้งที่เช็ค
    #: ล้างกลับเป็น NULL เมื่อแก้ due_date ใหม่หรือเปิดงานที่ปิดแล้วขึ้นมาทำต่อ
    #: เพื่อให้แจ้งเตือนรอบใหม่ได้ถ้าเลยกำหนดอีกครั้ง
    overdue_notified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    #: branch ล่าสุดที่มี commit อ้างถึงงานนี้ ใช้ลิงก์ไปดู diff บน GitHub
    branch: Mapped[str | None] = mapped_column(String(255), nullable=True)
    #: ลิงก์ PR ล่าสุดที่อ้างถึงงานนี้ — ดีกว่า branch เพราะเห็นรีวิวด้วย
    review_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: ทักษะ/เครื่องมือที่ต้องใช้ เก็บเป็น JSON array
    #: ปล่อยให้เป็น NULL ได้ เพราะ sqlite เพิ่มคอลัมน์ NOT NULL ที่ไม่มี default ไม่ได้
    tags: Mapped[list[str] | None] = mapped_column(JSON, nullable=True, default=list)
    #: id ของงานที่ต้องเสร็จก่อนงานใบนี้จะเริ่มได้ — AI เป็นคนเสนอตอนแตกงาน
    #: เก็บเป็น JSON array เหมือน tags แทนที่จะทำตารางเชื่อม เพราะใช้แค่แสดงผล
    #: ไม่ได้ query ย้อนกลับว่า "ใครรอใบนี้อยู่" และระบบไม่ได้ล็อกไม่ให้เริ่มงานจริง ๆ
    depends_on: Mapped[list[str] | None] = mapped_column(JSON, nullable=True, default=list)
    #: ไฟล์ในหน้า Documents ที่งานนี้ถูกแตกมาจาก — ย้อนกลับได้ว่างานมาจากเอกสารฉบับไหน
    #: SET NULL เพราะลบเอกสารทิ้งแล้วงานที่ทำอยู่ต้องไม่หายตาม
    source_file_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("case_files.id", ondelete="SET NULL"), nullable=True
    )
    estimate_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    complexity: Mapped[str | None] = mapped_column(String(10), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )

    project: Mapped[Project] = relationship(back_populates="tasks")
    assignees: Mapped[list[Member]] = relationship(secondary=task_assignees, lazy="selectin")


def apply_status_change(task: Task, new_status: str) -> None:
    """เปลี่ยนสถานะงานพร้อมบันทึกประวัติที่ใช้ประเมินผลงานทีหลัง

    ต้องเรียกผ่านตัวนี้เสมอแทนการ set task.status ตรง ๆ เพราะมีสองทางที่ย้าย
    การ์ดได้ — คนกดบนเว็บ กับ webhook ที่ GitHub ยิงมา ถ้าแยกกันเขียนจะลืม
    อัปเดตข้างใดข้างหนึ่งแล้วตัวเลขในแดชบอร์ดเพี้ยน
    """
    if new_status == task.status:
        return

    # จับเวลาที่ใช้จริงตั้งแต่ครั้งแรกที่งานขยับออกจาก "รอเริ่ม" — ไม่แตะอีกแม้ถูกตีกลับ
    if task.started_at is None and new_status != "todo":
        task.started_at = _now()

    # ตีกลับจากรอตรวจ (คนกด Rework หรือ GitHub ขอแก้) = การ์ดแดง นับรอบแก้
    # ส่งตรวจใหม่หรือปิดงาน = เลิกทำเครื่องหมาย
    # ถ้าถูกดึงกลับไปรอเริ่มยังคงธงไว้ เพราะงานก็ยังไม่ผ่านการตรวจอยู่ดี
    if task.status == "review" and new_status == "in-progress":
        task.needs_rework = True
        task.rework_count += 1
    elif new_status in ("review", "complete"):
        task.needs_rework = False

    # เปิดงานที่ปิดไปแล้วขึ้นมาใหม่ ให้ลืมวันปิดเดิม ไม่งั้นจะนับว่าเสร็จซ้ำ
    if new_status == "complete":
        task.completed_at = _now()
    elif task.completed_at is not None:
        task.completed_at = None

    task.status = new_status


class TaskComment(Base):
    """บันทึกสั้น ๆ ใต้การ์ด — คนที่รับงานเขียนว่าติดอะไร จะแก้ยังไง

    แยกเป็นตารางต่างหากแทนที่จะต่อท้าย description เพราะต้องรู้ว่าใครเขียนและเมื่อไหร่
    """

    __tablename__ = "task_comments"
    #: อ่านคอมเมนต์ทีละการ์ดเสมอ เรียงตามเวลา — ต้องประกาศไว้ตรงนี้ด้วย ไม่ใช่แค่ใน migration
    #: ไม่งั้น autogenerate จะเห็นว่าโมเดลไม่มี index นี้ แล้วสร้าง migration ลบทิ้งให้เงียบ ๆ
    __table_args__ = (Index("ix_task_comments_task_created", "task_id", "created_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    #: null ได้เพื่อไม่ให้คอมเมนต์หายตามคนที่ถูกลบออกจากระบบ
    member_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("members.id", ondelete="SET NULL"), nullable=True
    )
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    member: Mapped[Member | None] = relationship(lazy="selectin")


class Case(Base):
    """Document 1 อัน = ที่เก็บเอกสารกลางของทีม/หน่วยงาน — เอกสารทุกเรื่องส่งเข้าที่นี่

    สร้างครั้งเดียวด้วยชื่อ (เช่น "เอกสารเข้า ฝ่ายไอที") มีสมาชิกเป็นเจ้าหน้าที่ที่เห็นร่วมกัน
    ตัว Document ไม่มีเรื่อง/สถานะของตัวเอง — ข้อมูลพวกนั้นอยู่ที่เอกสารแต่ละใบ (CaseFile)
    เพราะใบหนึ่งเป็น TOR ผูกโปรเจค A อีกใบเป็นหนังสือเชิญประชุมที่ไม่เกี่ยวโปรเจคเลย
    """

    __tablename__ = "cases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    #: ชื่อที่เก็บ — เจ้าของ/admin แก้ได้
    title: Mapped[str] = mapped_column(Text)
    #: SET NULL — คนถูกลบ เอกสารของทีมต้องยังอยู่
    owner_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("members.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, onupdate=_now
    )

    members: Mapped[list[Member]] = relationship(secondary=case_members, lazy="selectin")
    memberships: Mapped[list[CaseMember]] = relationship(lazy="selectin", viewonly=True)
    files: Mapped[list[CaseFile]] = relationship(
        back_populates="case",
        cascade="all, delete-orphan",
        order_by="CaseFile.uploaded_at",
        lazy="selectin",
    )
    #: คำขอเอกสารที่ที่เก็บนี้ส่งออก / ได้รับ — ไม่ผูก relationship กลับไป Case อีกฝั่ง
    #: (selectin สองทางจะวนโหลดไม่รู้จบ) หน้าเว็บเอาชื่ออีกฝั่งจาก /directory แทน
    requests_out: Mapped[list[DocumentRequest]] = relationship(
        foreign_keys="DocumentRequest.from_case_id",
        cascade="all, delete-orphan",
        order_by="DocumentRequest.created_at.desc()",
        lazy="selectin",
    )
    requests_in: Mapped[list[DocumentRequest]] = relationship(
        foreign_keys="DocumentRequest.to_case_id",
        cascade="all, delete-orphan",
        order_by="DocumentRequest.created_at.desc()",
        lazy="selectin",
    )

    @property
    def admin_ids(self) -> set[str]:
        return {cm.member_id for cm in self.memberships if cm.role == "admin"}

    def can_manage(self, member_id: str | None) -> bool:
        """เจ้าของหรือ admin ของที่เก็บ — เปลี่ยนชื่อ เพิ่มคน แก้ข้อมูลเอกสาร ผูกโปรเจค"""
        return member_id is not None and (member_id == self.owner_id or member_id in self.admin_ids)


class CaseMember(Base):
    """แถวหนึ่งในตารางเชื่อม — มีไว้อ่าน role เท่านั้น"""

    __table__ = case_members

    member: Mapped[Member] = relationship(lazy="selectin", overlaps="members")


class CaseFile(Base):
    """เอกสาร 1 ใบในที่เก็บ — มีเรื่อง/เลขที่/กำหนดส่ง/สถานะ/โปรเจคของตัวเอง ตัวไฟล์เก็บใน Postgres ตรง ๆ

    เก็บเป็น bytea แทนดิสก์เพราะ Render (free) ไม่มีดิสก์ถาวร ไฟล์จะหายทุกครั้งที่ deploy
    จำกัดขนาดต่อไฟล์ไว้ที่ router — เอกสารราชการเป็น PDF ไม่กี่ร้อย KB อยู่แล้ว
    """

    __tablename__ = "case_files"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id", ondelete="CASCADE"))
    #: เรื่อง — ตั้งต้นจากชื่อไฟล์ตัดนามสกุล แก้ได้ทีหลัง ("Fill details" ให้ AI อ่านมาเติมก็ได้)
    title: Mapped[str] = mapped_column(Text, default="")
    #: received / in_progress / delivered / closed — วงจรของเอกสารใบนี้
    status: Mapped[str] = mapped_column(String(20), default="received")
    #: เลขที่หนังสือ เช่น "สธ 0201/1234"
    doc_number: Mapped[str | None] = mapped_column(String(60), nullable=True)
    #: หน่วยงานต้นเรื่อง
    agency: Mapped[str | None] = mapped_column(String(160), nullable=True)
    #: กำหนดส่งมอบตามเอกสาร — ใช้ป้าย Overdue เดียวกับงาน
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    #: โปรเจคที่เอกสารใบนี้เกี่ยว — ไม่ unique เพราะ TOR กับสัญญาชี้โปรเจคเดียวกันได้
    #: SET NULL โปรเจคถูกลบ เอกสารยังอยู่แค่หลุดจากบอร์ด
    project_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    filename: Mapped[str] = mapped_column(Text)
    content_type: Mapped[str] = mapped_column(String(120))
    size: Mapped[int] = mapped_column(Integer)
    #: tor / contract / amendment / minutes / acceptance / other
    category: Mapped[str] = mapped_column(String(30), default="other")
    #: ฉบับที่เท่าไหร่ของเอกสารเดิม — ฉบับแก้ไขชี้กลับไปฉบับก่อนหน้าด้วย replaces_id
    version: Mapped[int] = mapped_column(Integer, default=1)
    replaces_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("case_files.id", ondelete="SET NULL"), nullable=True
    )
    #: ตัวไฟล์ — ห้ามใส่ใน JSON รายการ ดึงผ่าน endpoint ดาวน์โหลดเท่านั้น
    data: Mapped[bytes] = mapped_column(LargeBinary)
    uploaded_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("members.id", ondelete="SET NULL"), nullable=True
    )
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    #: ธงกันส่งอีเมลซ้ำ — ล้างเมื่อเลื่อนกำหนดส่งหรือเปิดเรื่องใหม่ (ดู routers/cases.py)
    due_soon_notified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    overdue_notified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    case: Mapped[Case] = relationship(back_populates="files")
    project: Mapped[Project | None] = relationship(lazy="selectin")


class DocumentRequest(Base):
    """คำขอเอกสารข้ามที่เก็บ — ทีม A (from) ขอเอกสารจากทีม B (to)

    ผู้ดูแลของ B เลือกไฟล์ในที่เก็บตัวเองส่งให้ ระบบคัดลอกเป็นแถวใหม่ใน A (file_id ชี้สำเนานั้น)
    คัดลอกแทนการอ้างถึงเพราะสิทธิ์ยึดจากสมาชิกของที่เก็บ — ถ้าอ้างถึง ไฟล์ของ B จะโผล่ให้คนของ A
    เห็นผ่านช่องทางพิเศษ และถ้า B ลบทีหลัง A จะเสียเอกสารที่เคยได้รับไปแล้ว
    """

    __tablename__ = "document_requests"
    __table_args__ = (
        Index("ix_document_requests_to", "to_case_id", "status"),
        Index("ix_document_requests_from", "from_case_id", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    from_case_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("cases.id", ondelete="CASCADE")
    )
    to_case_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("cases.id", ondelete="CASCADE")
    )
    requested_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("members.id", ondelete="SET NULL"), nullable=True
    )
    #: เอกสารที่ขอ เช่น "สัญญาจ้างระบบจองห้อง ฉบับลงนาม"
    title: Mapped[str] = mapped_column(Text)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: pending / fulfilled / declined
    status: Mapped[str] = mapped_column(String(20), default="pending")
    #: สำเนาที่ถูกส่งเข้าที่เก็บผู้ขอ — SET NULL ถ้าผู้ขอลบสำเนาทีหลัง คำขอยังนับว่าเคยได้รับ
    file_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("case_files.id", ondelete="SET NULL"), nullable=True
    )
    #: โปรเจคที่เอกสารนี้จะไปใช้ — ยื่นจากบอร์ด ไฟล์ที่ได้รับผูกโปรเจคนี้ให้เลย SET NULL ถ้าโปรเจคถูกลบ
    project_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    #: ข้อความตอบกลับตอนปฏิเสธ
    reply: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("members.id", ondelete="SET NULL"), nullable=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class WebhookEvent(Base):
    """เก็บ event ที่ GitHub ยิงเข้ามา ไว้แสดงใน Webhook Log ฝั่งขวา"""

    __tablename__ = "webhook_events"
    #: ฟีดดึงตาม repo เรียงตามเวลา — ประกาศไว้ตรงนี้ด้วยให้ตรงกับ migration ไม่งั้น autogenerate จะลบทิ้ง
    __table_args__ = (Index("ix_webhook_events_repo_received", "repo", "received_at"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    #: ชนิด event จาก header X-GitHub-Event เช่น push, pull_request
    event: Mapped[str] = mapped_column(String(40))
    #: ข้อความสรุปที่เอาไปแสดงตรง ๆ
    summary: Mapped[str] = mapped_column(Text)
    actor: Mapped[str | None] = mapped_column(String(120), nullable=True)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    #: รหัสงานที่อ่านได้จากข้อความ commit เช่น TASK-001
    task_ref: Mapped[str | None] = mapped_column(String(40), nullable=True)
    #: repo ต้นทาง (owner/name) — ใช้กรองฟีดให้เห็นเฉพาะโปรเจคที่ตัวเองอยู่
    #: NULL = แถวเก่าที่เดา repo ไม่ได้ จะไม่ถูกแสดงให้ใครเห็น
    repo: Mapped[str | None] = mapped_column(String(200), nullable=True)

    #: งานที่ AI เดาว่า commit นี้น่าจะหมายถึง — ใช้ตอนที่ commit ไม่ได้เขียนรหัสมา
    #: เป็นแค่ข้อเสนอ ต้องมีคนกดยืนยันถึงจะย้ายการ์ด
    suggested_task_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True
    )
    suggest_confidence: Mapped[str | None] = mapped_column(String(10), nullable=True)
    suggest_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
