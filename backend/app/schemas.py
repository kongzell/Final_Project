"""รูปแบบ JSON ที่คุยกับ frontend

ใช้ alias เป็น camelCase ให้ตรงกับ types.ts ฝั่ง React (assigneeIds, dueDate)
โดยที่ฝั่ง Python ยังเขียน snake_case ตามปกติ
"""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

StatusId = Literal["todo", "in-progress", "review", "complete"]
PriorityId = Literal["urgent", "high", "normal", "low", "none"]
Complexity = Literal["low", "medium", "high"]


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


# ---------- members ----------

class MemberUpdate(ApiModel):
    """แก้ข้อมูลของตัวเอง — บทบาท สี และอีเมลรับแจ้งเตือน"""

    role: str | None = Field(default=None, min_length=1, max_length=60)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    #: อีเมลรับแจ้งเตือน — ส่งสตริงว่างมาเพื่อเลิกรับ
    email: str | None = Field(default=None, max_length=200)


class MemberOut(ApiModel):
    id: str
    name: str
    role: str
    color: str
    github_login: str | None = None
    avatar_url: str | None = None


class MeOut(MemberOut):
    """ข้อมูลของตัวเอง — มีอีเมลด้วย

    ตั้งใจไม่ใส่ email ไว้ใน MemberOut เพราะ /api/members คืนรายชื่อทุกคน
    ในระบบ ถ้าใส่ตรงนั้นเท่ากับเปิดอีเมลของทุกคนให้ทุกคนที่ล็อกอินเห็น
    """

    email: str | None = None


# ---------- tasks ----------

class TaskCreate(ApiModel):
    title: str = Field(min_length=1)
    description: str | None = None
    parent_id: str | None = None
    status: StatusId = "todo"
    priority: PriorityId = "none"
    due_date: date | None = None
    category: str | None = None
    tags: list[str] = Field(default_factory=list)
    estimate_hours: float | None = None
    complexity: Complexity | None = None
    #: id ของงานที่ต้องเสร็จก่อน — ตัวที่ไม่ได้อยู่ในโปรเจคเดียวกันจะถูกตัดทิ้ง
    depends_on: list[str] = Field(default_factory=list)


class TaskUpdate(ApiModel):
    """ทุกฟิลด์ไม่บังคับ — ส่งมาเฉพาะอันที่จะแก้"""

    title: str | None = Field(default=None, min_length=1)
    description: str | None = None
    status: StatusId | None = None
    priority: PriorityId | None = None
    due_date: date | None = None
    position: float | None = None
    category: str | None = None
    tags: list[str] | None = None
    estimate_hours: float | None = None
    complexity: Complexity | None = None


class TaskOut(ApiModel):
    id: str
    #: เลขงานในโปรเจค ใช้คู่กับ taskPrefix ของโปรเจคเป็นรหัสอย่าง KST-001
    number: int
    parent_id: str | None
    title: str
    #: รายละเอียดงานที่เจ้าของเขียนไว้
    description: str | None = None
    status: StatusId
    priority: PriorityId
    due_date: date | None
    position: float
    assignee_ids: list[str]
    category: str | None
    tags: list[str]
    estimate_hours: float | None
    complexity: Complexity | None
    #: true เมื่อถูกตีกลับจากรอตรวจให้ไปแก้
    needs_rework: bool = False
    #: จำนวนครั้งที่ถูกตีกลับสะสม ใช้ดูคุณภาพงานย้อนหลัง
    rework_count: int = 0
    #: เวลาที่ปิดงาน ใช้เทียบกับ due_date ว่าส่งทันไหม
    completed_at: datetime | None = None
    #: เวลาที่งานถูกดึงออกจาก "รอเริ่ม" ครั้งแรก — null แปลว่ายังไม่มีใครเริ่มทำ
    started_at: datetime | None = None
    #: เวลาที่ใช้จริง (ชั่วโมง) นับจาก started_at ถึง completed_at — null ถ้ายังไม่เสร็จ
    #: แยกจาก estimate_hours ซึ่งเป็นแค่ตัวเลขที่ AI เดาไว้ล่วงหน้า ไม่ใช่เวลาที่ใช้จริง
    actual_hours: float | None = None
    #: งานที่ต้องเสร็จก่อนใบนี้ถึงจะเริ่มได้ — ว่าง = เริ่มได้เลย ไม่ต้องรอใคร
    depends_on: list[str] = []
    #: branch ล่าสุดที่ commit ถึงงานนี้ (ไม่รวม branch หลัก)
    branch: str | None = None
    #: ลิงก์ PR ล่าสุดที่อ้างถึงงานนี้
    review_url: str | None = None


class CommentCreate(ApiModel):
    body: str = Field(min_length=1, max_length=2000)


class CommentOut(ApiModel):
    id: str
    task_id: str
    member_id: str | None
    #: เก็บชื่อไว้ตรงนี้เลย หน้าเว็บจะได้ไม่ต้องไปหาในรายชื่อสมาชิกอีกรอบ
    member_name: str
    body: str
    created_at: datetime


# ---------- projects ----------

class ProjectCreate(ApiModel):
    name: str = Field(min_length=1, max_length=160)
    github_repo: str | None = Field(default=None, max_length=200)


class ProjectUpdate(ApiModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    github_repo: str | None = Field(default=None, max_length=200)
    #: ตัวอักษรกับตัวเลข ขึ้นต้นด้วยตัวอักษร — ต้องพิมพ์ใน commit ได้ง่าย
    task_prefix: str | None = Field(default=None, pattern=r"^[A-Za-z][A-Za-z0-9]{0,9}$")


class ProjectOut(ApiModel):
    owner_id: str | None = None
    task_prefix: str = "TASK"
    id: str
    name: str
    github_repo: str | None
    member_ids: list[str]
    #: สมาชิกที่เจ้าของตั้งเป็น admin — ทำได้เท่าเจ้าของในหน้าเว็บ
    admin_ids: list[str] = []
    tasks: list[TaskOut]


class MemberRoleUpdate(ApiModel):
    role: Literal["member", "admin"]


# ---------- AI ----------

class BreakdownRequest(ApiModel):
    title: str = Field(min_length=1, max_length=300)
    context: str = Field(default="", max_length=1000)
    count: int = Field(default=5, ge=2, le=12)


class SubtaskSuggestion(ApiModel):
    title: str
    #: ขอบเขตงานสั้น ๆ ที่ AI เขียนให้ ไปลงช่อง Details ของการ์ด
    description: str = ""
    category: str
    tags: list[str] = Field(default_factory=list)
    estimate_hours: float
    complexity: Complexity
    reason: str = ""
    #: ตำแหน่งของงานอื่นในลิสต์เดียวกันที่ต้องเสร็จก่อน (อ้างถอยหลังเท่านั้น)
    #: ใช้ index แทน id เพราะตอน AI ตอบกลับมา งานยังไม่ถูกสร้างจึงยังไม่มี id
    depends_on: list[int] = Field(default_factory=list)


class BreakdownResult(ApiModel):
    summary: str
    subtasks: list[SubtaskSuggestion]
    #: true เมื่อยังไม่ได้ตั้ง API key และกำลังใช้ข้อมูลตัวอย่าง
    mock: bool = False


# ---------- auth ----------

class AuthStatus(ApiModel):
    #: ตั้ง GITHUB_CLIENT_ID/SECRET แล้วหรือยัง
    configured: bool
    member: MeOut | None = None


# ---------- github ----------

class CommitOut(ApiModel):
    sha: str
    message: str
    author: str
    date: str
    url: str
    task_ref: str | None = None


class WebhookEventOut(ApiModel):
    id: str
    event: str
    summary: str
    actor: str | None
    url: str | None
    task_ref: str | None
    #: ข้อเสนอจาก AI ตอน commit ไม่ได้เขียนรหัสงานมา
    suggested_task_id: str | None = None
    suggested_task_key: str | None = None
    suggested_task_title: str | None = None
    suggest_confidence: str | None = None
    suggest_reason: str | None = None
    received_at: datetime


class GithubRepo(ApiModel):
    full_name: str
    private: bool
    collaborator_count: int | None = None


class ImportResult(ApiModel):
    #: ชื่อ org หรือ repo ที่ดึงมา
    org: str
    #: จำนวนคนที่เพิ่งสร้างใหม่
    created: int
    #: จำนวนคนที่มีอยู่แล้ว อัปเดตข้อมูลให้
    updated: int
    #: จำนวนคนที่ถูกเชิญแต่ยังไม่กดรับ (นับรวมอยู่ใน created/updated แล้ว)
    pending: int = 0
    members: list[MemberOut]


# ---------- system ----------

class SystemHealth(ApiModel):
    api_ok: bool
    database_ok: bool
    database_error: str | None
    database_kind: str
    ai_ready: bool
    ai_model: str
    auth_ready: bool
    github_repo: str | None
    webhook_ready: bool
    #: false เมื่อ SESSION_SECRET ยังเป็นค่า default ของ dev — ห้าม deploy ทั้งแบบนี้
    secrets_ready: bool
