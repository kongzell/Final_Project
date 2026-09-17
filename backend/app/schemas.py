"""รูปแบบ JSON ที่คุยกับ frontend

ใช้ alias เป็น camelCase ให้ตรงกับ types.ts ฝั่ง React (assigneeIds, dueDate)
โดยที่ฝั่ง Python ยังเขียน snake_case ตามปกติ
"""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator
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
    #: บัญชีแบบธรรมดา — null สำหรับคนที่มาจาก GitHub
    username: str | None = None


class MeOut(MemberOut):
    """ข้อมูลของตัวเอง — มีอีเมลด้วย

    ตั้งใจไม่ใส่ email ไว้ใน MemberOut เพราะ /api/members คืนรายชื่อทุกคน
    ในระบบ ถ้าใส่ตรงนั้นเท่ากับเปิดอีเมลของทุกคนให้ทุกคนที่ล็อกอินเห็น
    """

    email: str | None = None


class RegisterIn(ApiModel):
    name: str = Field(min_length=1, max_length=120)
    #: ตัวพิมพ์เล็ก ตัวเลข จุด ขีด ขีดล่าง 3-40 ตัว — เก็บเป็นตัวพิมพ์เล็กเสมอ
    username: str = Field(min_length=3, max_length=40, pattern=r"^[A-Za-z0-9._-]+$")
    password: str = Field(min_length=8, max_length=200)
    #: อีเมลรับแจ้งเตือน ไม่บังคับ
    email: str | None = Field(default=None, max_length=200)


class LoginIn(ApiModel):
    username: str = Field(min_length=1, max_length=40)
    password: str = Field(min_length=1, max_length=200)


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
    #: ไฟล์ในหน้า Documents ที่งานนี้แตกมาจาก — ย้อนกลับได้ว่ามาจาก TOR ฉบับไหน
    source_file_id: str | None = None


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
    #: ไฟล์ต้นทางในหน้า Documents — null ถ้าสร้างเองหรือเอกสารถูกลบไปแล้ว
    source_file_id: str | None = None
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


# ---------- documents ----------

CaseStatus = Literal["received", "in_progress", "delivered", "closed"]
FileCategory = Literal["tor", "contract", "amendment", "minutes", "acceptance", "other"]


class CaseFileOut(ApiModel):
    """เอกสาร 1 ใบ — เรื่อง/สถานะ/โปรเจคเป็นของใบนี้เอง ไม่ใช่ของ Document"""

    id: str
    title: str
    status: CaseStatus
    doc_number: str | None = None
    agency: str | None = None
    deadline: date | None = None
    #: โปรเจคที่ใบนี้เกี่ยว — null = ไม่เกี่ยวโปรเจค ปุ่มแตกงานยังกดไม่ได้
    project_id: str | None = None
    filename: str
    content_type: str
    size: int
    category: FileCategory
    version: int
    #: ไฟล์ฉบับก่อนที่ฉบับนี้มาแทน — ไว้โชว์ประวัติ
    replaces_id: str | None = None
    uploaded_by: str | None = None
    uploaded_at: datetime


RequestStatus = Literal["pending", "fulfilled", "declined"]


class DocumentRequestOut(ApiModel):
    """คำขอเอกสารข้ามที่เก็บ — ชื่อที่เก็บอีกฝั่งดูจาก /api/cases/directory"""

    id: str
    from_case_id: str
    to_case_id: str
    requested_by: str | None = None
    title: str
    note: str | None = None
    status: RequestStatus
    #: สำเนาที่ส่งเข้าที่เก็บผู้ขอ (เฉพาะ fulfilled)
    file_id: str | None = None
    reply: str | None = None
    resolved_by: str | None = None
    resolved_at: datetime | None = None
    created_at: datetime


class DocumentRequestCreate(ApiModel):
    to_case_id: str
    title: str = Field(min_length=1, max_length=300)
    note: str = Field(default="", max_length=1000)

    @field_validator("title")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("title must not be blank")
        return v


class DocumentRequestFulfill(ApiModel):
    #: ไฟล์ในที่เก็บผู้ให้ที่จะคัดลอกไปให้ผู้ขอ
    file_id: str


class DocumentRequestDecline(ApiModel):
    reply: str = Field(default="", max_length=1000)


class CaseDirectoryEntry(ApiModel):
    """ที่เก็บทุกอันในระบบแบบย่อ — ไว้เลือกปลายทางตอนขอเอกสาร ไม่มีรายการไฟล์"""

    id: str
    title: str
    owner_id: str | None = None
    member_count: int
    #: ฉันเป็นสมาชิกอยู่แล้วหรือไม่
    is_member: bool


class CaseOut(ApiModel):
    """Document = ที่เก็บเอกสารกลางของทีม — มีแค่ชื่อกับสมาชิก"""

    id: str
    title: str
    owner_id: str | None = None
    member_ids: list[str]
    admin_ids: list[str] = []
    files: list[CaseFileOut]
    #: คำขอที่ที่เก็บนี้ส่งออก / ได้รับ
    requests_out: list[DocumentRequestOut] = []
    requests_in: list[DocumentRequestOut] = []
    created_at: datetime


class CaseCreate(ApiModel):
    """สร้าง Document (ที่เก็บ) ด้วยชื่อ — เหมือนสร้างโปรเจค เอกสารค่อยส่งเข้ามาทีหลัง"""

    title: str = Field(min_length=1, max_length=300)

    @field_validator("title")
    @classmethod
    def _not_blank(cls, v: str) -> str:
        # min_length นับช่องว่างด้วย "   " ผ่านได้ แล้วกลายเป็นชื่อว่างหลัง strip
        v = v.strip()
        if not v:
            raise ValueError("title must not be blank")
        return v


class CaseUpdate(ApiModel):
    """เปลี่ยนชื่อที่เก็บ — อย่างอื่นไม่มีให้แก้ระดับนี้แล้ว"""

    title: str = Field(min_length=1, max_length=300)


class CaseFileUpdate(ApiModel):
    """แก้ข้อมูลเอกสาร 1 ใบ — ส่งมาเฉพาะฟิลด์ที่จะแก้ ส่ง project_id เป็น null เพื่อถอดจากโปรเจค"""

    title: str | None = Field(default=None, min_length=1, max_length=300)
    status: CaseStatus | None = None
    category: FileCategory | None = None
    doc_number: str | None = Field(default=None, max_length=60)
    agency: str | None = Field(default=None, max_length=160)
    deadline: date | None = None
    project_id: str | None = None


# ---------- AI ----------

#: วิธีแตกงานที่ AI เลือกใช้ — vertical = ตามฟีเจอร์ (agile), layered = ตามชั้น (waterfall)
SliceStyle = Literal["vertical", "layered"]


class BreakdownRequest(ApiModel):
    title: str = Field(min_length=1, max_length=300)
    #: บริบทเพิ่มเติม — อยากบังคับวิธีแตกงานก็เขียนตรงนี้ เช่น "แบ่งตาม layer"
    context: str = Field(default="", max_length=1000)
    count: int = Field(default=5, ge=2, le=12)


class FileBreakdownRequest(ApiModel):
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
    #: กำหนดส่ง YYYY-MM-DD ที่ AI ดึงจากงวดงานในเอกสาร — ว่างเมื่อไม่มีกำหนด
    #: responseSchema ของ Gemini ไม่รับ null จึงใช้สตริงว่างแทน
    due_date: str = ""

    @field_validator("due_date")
    @classmethod
    def _valid_date_or_blank(cls, v: str) -> str:
        """โมเดลบางทีตอบ "30 days" หรือรูปแบบวันแปลก ๆ — ตัดทิ้งดีกว่าปล่อยให้สร้างงานพัง"""
        v = (v or "").strip()
        if not v:
            return ""
        try:
            date.fromisoformat(v)
        except ValueError:
            return ""
        return v
    #: ตำแหน่งของงานอื่นในลิสต์เดียวกันที่ต้องเสร็จก่อน (อ้างถอยหลังเท่านั้น)
    #: ใช้ index แทน id เพราะตอน AI ตอบกลับมา งานยังไม่ถูกสร้างจึงยังไม่มี id
    depends_on: list[int] = Field(default_factory=list)


class FileMetadata(ApiModel):
    """สิ่งที่ AI อ่านได้จากหน้าแรก ๆ ของเอกสาร — ไว้เติมฟอร์มให้ ผู้ใช้แก้ก่อนบันทึกได้"""

    title: str = ""
    doc_number: str = ""
    agency: str = ""
    #: YYYY-MM-DD หรือว่าง
    deadline: str = ""
    category: FileCategory = "other"
    #: สรุป 1-2 ประโยคว่าเอกสารนี้เกี่ยวกับอะไร
    summary: str = ""

    @field_validator("deadline")
    @classmethod
    def _valid_deadline(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            return ""
        try:
            date.fromisoformat(v)
        except ValueError:
            return ""
        return v


class BreakdownResult(ApiModel):
    summary: str
    subtasks: list[SubtaskSuggestion]
    #: วิธีที่ใช้แตกจริง — ตอนขอ auto จะได้รู้ว่า AI เลือกอะไร
    style: SliceStyle = "vertical"
    #: เหตุผลหนึ่งบรรทัดว่าทำไมแบบนั้นถึงเหมาะกับคำขอนี้
    style_reason: str = ""
    #: true เมื่อยังไม่ได้ตั้ง API key และกำลังใช้ข้อมูลตัวอย่าง
    mock: bool = False


# ---------- auth ----------

class AuthStatus(ApiModel):
    #: ตั้ง GITHUB_CLIENT_ID/SECRET แล้วหรือยัง — ปุ่ม "Sign in with GitHub" โชว์เมื่อ true
    configured: bool
    #: เปิดให้สมัครบัญชีแบบธรรมดาไหม (ALLOW_SIGNUP)
    signup_open: bool = True
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
