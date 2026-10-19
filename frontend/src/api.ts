/** เรียก backend ผ่าน path สัมพัทธ์ — vite (dev) และ nginx (prod) proxy /api ให้อยู่แล้ว */

import type {
  Case, CaseDirectoryEntry, CaseStatus, FileCategory, Project, ProjectDocuments, PriorityId, StatusId, Task,
} from "./types"


export type SubtaskSuggestion = {
  title: string
  /** ขอบเขตงานที่ AI เขียนให้ ไปลงช่อง Details ของการ์ด */
  description: string
  category: string
  tags: string[]
  estimateHours: number
  complexity: "low" | "medium" | "high"
  reason: string
  /** ตำแหน่งของงานอื่นในชุดเดียวกันที่ต้องเสร็จก่อน (อ้างถอยหลังเสมอ) */
  dependsOn: number[]
  /** กำหนดส่ง YYYY-MM-DD ที่ AI ดึงจากงวดงาน — สตริงว่างเมื่อไม่มี */
  dueDate: string
}

export type BreakdownResult = {
  summary: string
  subtasks: SubtaskSuggestion[]
  /** วิธีที่ AI ใช้แตกจริง — ตอนขอ auto จะได้รู้ว่ามันเลือกอะไร */
  style: "vertical" | "layered"
  /** เหตุผลหนึ่งบรรทัดว่าทำไมแบบนั้นถึงเหมาะกับคำขอนี้ */
  styleReason: string
  /** true = ยังไม่ได้ตั้ง GEMINI_API_KEY กำลังใช้ข้อมูลตัวอย่าง */
  mock: boolean
}

/** error จาก API ที่พก HTTP status มาด้วย เพื่อให้ฝั่งเรียกแยกได้ว่า 401 หรือพังจริง */
export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiError"
    this.status = status
  }
}

/** true เมื่อ error เกิดจากยังไม่ได้ล็อกอิน — ไม่ใช่ความผิดพลาดที่ต้องเตือน */
export const isUnauthorized = (e: unknown) => e instanceof ApiError && e.status === 401

/** หนึ่งรายการใน detail ของ 422 ที่ FastAPI/Pydantic ส่งมา */
type FieldError = { loc?: (string | number)[]; msg?: string; type?: string; ctx?: Record<string, unknown> }

/** แปลง error ของ Pydantic เป็นประโยคที่ผู้ใช้อ่านรู้เรื่อง แทน "Server responded with 422" */
function describeFieldError(e: FieldError): string {
  const field = String(e.loc?.[e.loc.length - 1] ?? "value")
  const label = field.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ")
  const name = label.charAt(0).toUpperCase() + label.slice(1).toLowerCase()
  switch (e.type) {
    case "missing":
      return `${name} is required`
    case "string_too_short":
      return `${name} must be at least ${e.ctx?.min_length} characters`
    case "string_too_long":
      return `${name} must be at most ${e.ctx?.max_length} characters`
    case "string_pattern_mismatch":
      return field === "username"
        ? "Username can only use letters, numbers, dot (.), dash (-) and underscore (_)"
        : `${name} has an invalid format`
    default:
      return e.msg ? `${name}: ${e.msg}` : `${name} is invalid`
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json()
    if (typeof body?.detail === "string") return body.detail
    if (Array.isArray(body?.detail) && body.detail.length > 0) {
      return (body.detail as FieldError[]).map(describeFieldError).join(" · ")
    }
  } catch {
    /* ไม่ใช่ JSON ก็ปล่อยไปใช้ข้อความมาตรฐาน */
  }
  return `Server responded with ${res.status}`
}

/** ยิง API แล้วโยน ApiError เมื่อไม่สำเร็จ — ทุกฟังก์ชันในไฟล์นี้ผ่านตัวนี้ */
async function request(path: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(path, init)
  if (!res.ok) throw new ApiError(await readError(res), res.status)
  return res
}

/** เหมือน request แต่อ่านคำตอบเป็น JSON */
async function json<T>(path: string, init?: RequestInit): Promise<T> {
  return (await request(path, init)).json()
}

/** ส่ง body เป็น JSON ด้วย method ที่ระบุ */
const withJson = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

export async function breakdownTask(
  title: string,
  /** บริบทเพิ่มเติม — อยากบังคับวิธีแตกงานก็เขียนตรงนี้ AI จะทำตาม */
  context: string,
  /** backend มีค่าเริ่มต้นให้อยู่แล้ว ส่งมาเฉพาะตอนอยากบังคับจำนวน */
  count?: number,
): Promise<BreakdownResult> {
  return json(
    "/api/ai/breakdown",
    withJson("POST", count === undefined ? { title, context } : { title, context, count }),
  )
}

// ---------- documents ----------
//

export async function getCases(): Promise<Case[]> {
  return json("/api/cases")
}

export type NewCase = { title: string }

/** สร้างที่เก็บด้วยชื่อ — เอกสารค่อยส่งเข้ามาทีหลังด้วย addCaseFile */
export async function createCase(input: NewCase): Promise<Case> {
  return json("/api/cases", withJson("POST", input))
}

export type CasePatch = { title: string }

/** เปลี่ยนชื่อที่เก็บ — อย่างอื่นแก้ที่เอกสารแต่ละใบด้วย updateCaseFile */
export async function updateCase(id: string, patch: CasePatch): Promise<Case> {
  return json(`/api/cases/${id}`, withJson("PATCH", patch))
}

export async function deleteCase(id: string): Promise<void> {
  await request(`/api/cases/${id}`, { method: "DELETE" })
}

export type NewCaseFile = {
  file: File
  category: FileCategory
  /** เรื่อง — ว่างแล้วฝั่ง API ใช้ชื่อไฟล์ */
  title?: string
  docNumber?: string
  agency?: string
  deadline?: string
  projectId?: string
  /** ใส่เมื่อเป็นฉบับแก้ไขของใบเดิม — สืบทอดเรื่อง/โปรเจคจากใบนั้น */
  replacesId?: string
}

/** ส่งเอกสารเข้าที่เก็บ — ฟิลด์เป็น snake_case เพราะเป็น form ไม่ผ่าน alias ของ Pydantic */
export async function addCaseFile(caseId: string, input: NewCaseFile): Promise<Case> {
  const form = new FormData()
  form.append("file", input.file)
  form.append("category", input.category)
  if (input.title) form.append("title", input.title)
  if (input.docNumber) form.append("doc_number", input.docNumber)
  if (input.agency) form.append("agency", input.agency)
  if (input.deadline) form.append("deadline", input.deadline)
  if (input.projectId) form.append("project_id", input.projectId)
  if (input.replacesId) form.append("replaces_id", input.replacesId)
  return json(`/api/cases/${caseId}/files`, { method: "POST", body: form })
}

export type CaseFilePatch = Partial<{
  title: string
  status: CaseStatus
  category: FileCategory
  docNumber: string | null
  agency: string | null
  deadline: string | null
  projectId: string | null
}>

/** แก้ข้อมูลเอกสารใบเดียว — คืน Document ทั้งอันเพราะหน้าเว็บถือเป็นก้อนเดียว */
export async function updateCaseFile(caseId: string, fileId: string, patch: CaseFilePatch): Promise<Case> {
  return json(`/api/cases/${caseId}/files/${fileId}`, withJson("PATCH", patch))
}

/** ที่เก็บทุกอันในระบบ (ชื่อ+จำนวนคน ไม่มีไฟล์) — ไว้เลือกปลายทางตอนขอเอกสาร */
export async function getCaseDirectory(): Promise<CaseDirectoryEntry[]> {
  return json("/api/cases/directory")
}

export type NewDocumentRequest = { toCaseId: string; title: string; note?: string; projectId?: string }

/** ขอเอกสารจากที่เก็บอื่น — คืนที่เก็บผู้ขอ (มี requestsOut ใหม่) */
export async function createDocumentRequest(caseId: string, input: NewDocumentRequest): Promise<Case> {
  return json(`/api/cases/${caseId}/requests`, withJson("POST", input))
}

/** ผู้ดูแลของที่เก็บที่ถูกขอ ส่งไฟล์ของตัวเองให้ — ระบบคัดลอกเข้าที่เก็บผู้ขอ */
export async function fulfillDocumentRequest(caseId: string, requestId: string, fileId: string): Promise<Case> {
  return json(`/api/cases/${caseId}/requests/${requestId}/fulfill`, withJson("POST", { fileId }))
}

export async function declineDocumentRequest(caseId: string, requestId: string, reply: string): Promise<Case> {
  return json(`/api/cases/${caseId}/requests/${requestId}/decline`, withJson("POST", { reply }))
}

/** ผู้ขอถอนคำขอที่ยังค้าง */
export async function cancelDocumentRequest(caseId: string, requestId: string): Promise<Case> {
  return json(`/api/cases/${caseId}/requests/${requestId}`, { method: "DELETE" })
}

/** เอกสาร + คำขอค้างของโปรเจค — สมาชิกโปรเจคเห็นทุกใบที่ผูก แม้ไม่ได้อยู่ในที่เก็บต้นทาง */
export async function getProjectDocuments(projectId: string): Promise<ProjectDocuments> {
  return json(`/api/projects/${projectId}/documents`)
}

export async function deleteCaseFile(caseId: string, fileId: string): Promise<void> {
  await request(`/api/cases/${caseId}/files/${fileId}`, { method: "DELETE" })
}

/** ลิงก์ดาวน์โหลด/เปิดไฟล์ — cookie ส่งไปเองเพราะโดเมนเดียวกัน */
export const caseFileUrl = (caseId: string, fileId: string) =>
  `/api/cases/${caseId}/files/${fileId}`

/** สิ่งที่ AI อ่านได้จากเอกสาร — ไว้เติมฟอร์มเพิ่มเอกสาร ผู้ใช้แก้ก่อนบันทึกได้ */
/** ให้ AI อ่านไฟล์แล้วเสนอการ์ดงาน — ผลลัพธ์รูปแบบเดียวกับแตกจากข้อความ */
export async function breakdownFile(
  caseId: string,
  fileId: string,
  context: string,
): Promise<BreakdownResult> {
  return json(`/api/cases/${caseId}/files/${fileId}/breakdown`, withJson("POST", { context }))
}

export async function addCaseMember(caseId: string, memberId: string): Promise<void> {
  await request(`/api/cases/${caseId}/members/${memberId}`, { method: "POST" })
}

export async function removeCaseMember(caseId: string, memberId: string): Promise<void> {
  await request(`/api/cases/${caseId}/members/${memberId}`, { method: "DELETE" })
}

export async function setCaseMemberRole(
  caseId: string,
  memberId: string,
  role: "member" | "admin",
): Promise<void> {
  await request(`/api/cases/${caseId}/members/${memberId}`, withJson("PATCH", { role }))
}

// ---------- projects & tasks ----------

type ApiTask = {
  id: string
  number: number
  needsRework: boolean
  reworkCount: number
  completedAt: string | null
  startedAt: string | null
  actualHours: number | null
  dependsOn: string[]
  sourceFileId: string | null
  branch: string | null
  reviewUrl: string | null
  parentId: string | null
  title: string
  description: string | null
  status: StatusId
  priority: PriorityId
  dueDate: string | null
  assigneeIds: string[]
  category: string | null
  tags: string[]
  estimateHours: number | null
  complexity: "low" | "medium" | "high" | null
}

type ApiProject = {
  id: string
  name: string
  ownerId: string | null
  adminIds: string[]
  taskPrefix: string
  githubRepo: string | null
  memberIds: string[]
  tasks: ApiTask[]
}

const toTask = (t: ApiTask): Task => ({
  id: t.id,
  number: t.number,
  needsRework: t.needsRework,
  reworkCount: t.reworkCount,
  completedAt: t.completedAt,
  startedAt: t.startedAt,
  actualHours: t.actualHours,
  dependsOn: t.dependsOn ?? [],
  sourceFileId: t.sourceFileId ?? null,
  branch: t.branch,
  reviewUrl: t.reviewUrl,
  parentId: t.parentId,
  title: t.title,
  description: t.description,
  status: t.status,
  assigneeIds: t.assigneeIds,
  dueDate: t.dueDate,
  priority: t.priority,
  category: t.category,
  tags: t.tags,
  estimateHours: t.estimateHours,
  complexity: t.complexity,
})

const toProject = (p: ApiProject): Project => ({
  id: p.id,
  name: p.name,
  ownerId: p.ownerId,
  adminIds: p.adminIds,
  taskPrefix: p.taskPrefix,
  githubRepo: p.githubRepo,
  memberIds: p.memberIds,
  tasks: p.tasks.map(toTask),
})

export async function getProjects(): Promise<Project[]> {
  return (await json<ApiProject[]>("/api/projects")).map(toProject)
}

export async function createProject(name: string, githubRepo: string | null): Promise<Project> {
  return toProject(await json("/api/projects", withJson("POST", { name, githubRepo })))
}

export async function updateProject(id: string, patch: { name?: string }): Promise<void> {
  await request(`/api/projects/${id}`, withJson("PATCH", patch))
}

export async function deleteProject(id: string): Promise<void> {
  await request(`/api/projects/${id}`, { method: "DELETE" })
}

export async function addProjectMember(projectId: string, memberId: string): Promise<void> {
  await request(`/api/projects/${projectId}/members/${memberId}`, { method: "POST" })
}

/** ตั้งหรือถอด admin — เจ้าของโปรเจคเท่านั้น */
export async function setProjectMemberRole(
  projectId: string,
  memberId: string,
  role: "member" | "admin",
): Promise<void> {
  await request(`/api/projects/${projectId}/members/${memberId}`, withJson("PATCH", { role }))
}

export async function removeProjectMember(projectId: string, memberId: string): Promise<void> {
  await request(`/api/projects/${projectId}/members/${memberId}`, { method: "DELETE" })
}

export type NewTask = {
  title: string
  description?: string | null
  status?: StatusId
  priority?: PriorityId
  dueDate?: string | null
  parentId?: string | null
  category?: string | null
  tags?: string[]
  estimateHours?: number | null
  complexity?: "low" | "medium" | "high" | null
  /** id ของงานที่ต้องเสร็จก่อน — ฝั่ง API ตัดตัวที่ไม่ได้อยู่ในโปรเจคเดียวกันทิ้ง */
  dependsOn?: string[]
  /** ไฟล์ต้นทางในหน้า Documents ที่งานนี้แตกมาจาก */
  sourceFileId?: string | null
}

export async function createTask(projectId: string, task: NewTask): Promise<Task> {
  return toTask(await json(`/api/projects/${projectId}/tasks`, withJson("POST", task)))
}

export async function updateTask(
  id: string,
  patch: Partial<
    Pick<Task, "title" | "description" | "status" | "priority" | "dueDate" | "category">
  >,
): Promise<void> {
  await request(`/api/tasks/${id}`, withJson("PATCH", patch))
}

export async function deleteTask(id: string): Promise<void> {
  await request(`/api/tasks/${id}`, { method: "DELETE" })
}

export async function setAssignee(taskId: string, memberId: string, on: boolean): Promise<void> {
  await request(`/api/tasks/${taskId}/assignees/${memberId}`, { method: on ? "PUT" : "DELETE" })
}

// ---------- auth ----------

export type AuthMember = {
  id: string
  name: string
  role: string
  color: string
  githubLogin: string | null
  avatarUrl: string | null
  /** อีเมลรับแจ้งเตือน — null คือไม่รับ */
  email: string | null
  /** บัญชีแบบธรรมดา — null สำหรับคนที่มาจาก GitHub */
  username: string | null
}

export type AuthStatus = {
  /** ตั้ง GITHUB_CLIENT_ID/SECRET แล้วหรือยัง — ปุ่ม GitHub โชว์เมื่อ true */
  configured: boolean
  /** เปิดให้สมัครบัญชีแบบธรรมดาไหม (ALLOW_SIGNUP ฝั่ง API) */
  signupOpen: boolean
  member: AuthMember | null
}

/** ล็อกอินบัญชีธรรมดา — cookie ถูกตั้งให้โดย API เหมือน GitHub */
export async function login(username: string, password: string): Promise<AuthMember> {
  return json("/api/auth/login", withJson("POST", { username, password }))
}

export async function register(input: {
  name: string
  username: string
  password: string
  email?: string
}): Promise<AuthMember> {
  return json("/api/auth/register", withJson("POST", input))
}

export async function getAuthStatus(): Promise<AuthStatus> {
  return json("/api/auth/status")
}

export async function updateMyRole(role: string): Promise<AuthMember> {
  return patchMe({ role })
}

/** ตั้งอีเมลรับแจ้งเตือน — ส่งสตริงว่างเพื่อเลิกรับ */
export async function updateMyEmail(email: string): Promise<AuthMember> {
  return patchMe({ email })
}

async function patchMe(patch: Record<string, string>): Promise<AuthMember> {
  return json("/api/auth/me", withJson("PATCH", patch))
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" })
}

// ---------- members ----------

export type ApiMember = {
  id: string
  name: string
  role: string
  color: string
  githubLogin: string | null
  avatarUrl: string | null
}

export async function getMembers(): Promise<ApiMember[]> {
  return json("/api/members")
}

// ---------- ดึงรายชื่อจาก GitHub ----------

export type ImportResult = {
  org: string
  created: number
  updated: number
  /** คนที่ถูกเชิญแต่ยังไม่กดรับ (นับรวมใน created/updated แล้ว) */
  pending: number
  members: ApiMember[]
}

export type GithubRepo = { fullName: string; private: boolean }

export async function getMyRepos(): Promise<GithubRepo[]> {
  return json("/api/github/repos")
}

export async function importRepoCollaborators(repo: string): Promise<ImportResult> {
  return json(`/api/github/import-collaborators?repo=${encodeURIComponent(repo)}`, {
    method: "POST",
  })
}

// ---------- system ----------

export type SystemHealth = {
  apiOk: boolean
  databaseOk: boolean
  databaseError: string | null
  databaseKind: string
  aiReady: boolean
  aiModel: string
  authReady: boolean
  githubRepo: string | null
  webhookReady: boolean
  /** false = SESSION_SECRET ยังเป็นค่า default ของ dev */
  secretsReady: boolean
}

export async function getSystemHealth(): Promise<SystemHealth> {
  return json("/api/system/health")
}

// ---------- github ----------

export type Commit = {
  sha: string
  message: string
  author: string
  date: string
  url: string
  taskRef: string | null
}

export type WebhookEvent = {
  id: string
  event: string
  summary: string
  actor: string | null
  url: string | null
  taskRef: string | null
  /** งานที่ AI เดาว่า commit นี้หมายถึง — มีค่าเมื่อ commit ไม่ได้เขียนรหัสมา */
  suggestedTaskId: string | null
  suggestedTaskKey: string | null
  suggestedTaskTitle: string | null
  suggestConfidence: "high" | "medium" | "low" | null
  suggestReason: string | null
  receivedAt: string
}

/** ยืนยันข้อเสนอของ AI แล้วย้ายการ์ดไป "รอตรวจ" — เจ้าของโปรเจคเท่านั้น */
export async function applySuggestion(eventId: string): Promise<void> {
  await request(`/api/github/events/${eventId}/apply`, { method: "POST" })
}

export async function getCommits(projectId: string, limit = 8): Promise<Commit[]> {
  return json(`/api/github/commits?project_id=${projectId}&limit=${limit}`)
}

export async function getWebhookEvents(projectId: string, limit = 10): Promise<WebhookEvent[]> {
  return json(`/api/github/events?project_id=${projectId}&limit=${limit}`)
}


/* ---------- คอมเมนต์ใต้การ์ด ---------- */

export type TaskComment = {
  id: string
  taskId: string
  memberId: string | null
  memberName: string
  body: string
  createdAt: string
}

export async function getComments(taskId: string): Promise<TaskComment[]> {
  return json(`/api/tasks/${taskId}/comments`)
}

export async function addComment(taskId: string, body: string): Promise<TaskComment> {
  return json(`/api/tasks/${taskId}/comments`, withJson("POST", { body }))
}

export async function deleteComment(taskId: string, commentId: string): Promise<void> {
  await request(`/api/tasks/${taskId}/comments/${commentId}`, { method: "DELETE" })
}
