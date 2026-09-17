/** เรียก backend ผ่าน path สัมพัทธ์ — vite (dev) และ nginx (prod) proxy /api ให้อยู่แล้ว */

import type { Case, CaseStatus, FileCategory, Project, PriorityId, StatusId, Task } from "./types"


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

async function readError(res: Response): Promise<string> {
  try {
    const body = await res.json()
    if (typeof body?.detail === "string") return body.detail
  } catch {
    /* ไม่ใช่ JSON ก็ปล่อยไปใช้ข้อความมาตรฐาน */
  }
  return `Server responded with ${res.status}`
}

export async function breakdownTask(
  title: string,
  /** บริบทเพิ่มเติม — อยากบังคับวิธีแตกงานก็เขียนตรงนี้ AI จะทำตาม */
  context: string,
  /** backend มีค่าเริ่มต้นให้อยู่แล้ว ส่งมาเฉพาะตอนอยากบังคับจำนวน */
  count?: number,
): Promise<BreakdownResult> {
  const res = await fetch("/api/ai/breakdown", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(count === undefined ? { title, context } : { title, context, count }),
  })
  if (!res.ok) throw new ApiError(await readError(res), res.status)
  return res.json()
}

// ---------- documents ----------
//
// รายการเรื่องส่งมาเป็น camelCase ตรงกับ Case อยู่แล้ว ไม่ต้องแปลงเหมือน Task
// อัปโหลดใช้ FormData ไม่ใช่ JSON เพราะมีไฟล์แนบมาในคำขอเดียว — ห้ามตั้ง Content-Type เอง
// เบราว์เซอร์ต้องเป็นคนใส่ boundary ให้

export async function getCases(): Promise<Case[]> {
  const res = await fetch("/api/cases")
  if (!res.ok) throw new ApiError(await readError(res), res.status)
  return res.json()
}

export type NewCase = {
  title: string
  docNumber?: string
  agency?: string
  deadline?: string
  projectId?: string
}

/** สร้าง Document เปล่า (พื้นที่ทำงาน) — ไฟล์ค่อยเพิ่มทีหลังด้วย addCaseFile */
export async function createCase(input: NewCase): Promise<Case> {
  const res = await fetch("/api/cases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new ApiError(await readError(res), res.status)
  return res.json()
}

export type CasePatch = Partial<{
  title: string
  status: CaseStatus
  docNumber: string | null
  agency: string | null
  deadline: string | null
  projectId: string | null
}>

export async function updateCase(id: string, patch: CasePatch): Promise<Case> {
  const res = await fetch(`/api/cases/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new ApiError(await readError(res), res.status)
  return res.json()
}

export async function deleteCase(id: string): Promise<void> {
  const res = await fetch(`/api/cases/${id}`, { method: "DELETE" })
  if (!res.ok) throw new ApiError(await readError(res), res.status)
}

/** เพิ่มเอกสารที่เกี่ยวข้อง — ส่ง replacesId เมื่อเป็นฉบับแก้ไขของไฟล์เดิม */
export async function addCaseFile(
  caseId: string,
  file: File,
  category: FileCategory,
  replacesId?: string,
): Promise<Case> {
  const form = new FormData()
  form.append("file", file)
  form.append("category", category)
  if (replacesId) form.append("replaces_id", replacesId)
  const res = await fetch(`/api/cases/${caseId}/files`, { method: "POST", body: form })
  if (!res.ok) throw new ApiError(await readError(res), res.status)
  return res.json()
}

export async function deleteCaseFile(caseId: string, fileId: string): Promise<void> {
  const res = await fetch(`/api/cases/${caseId}/files/${fileId}`, { method: "DELETE" })
  if (!res.ok) throw new ApiError(await readError(res), res.status)
}

/** ลิงก์ดาวน์โหลด/เปิดไฟล์ — cookie ส่งไปเองเพราะโดเมนเดียวกัน */
export const caseFileUrl = (caseId: string, fileId: string) =>
  `/api/cases/${caseId}/files/${fileId}`

/** สิ่งที่ AI อ่านได้จากเอกสาร — ไว้เติมฟอร์มเพิ่มเอกสาร ผู้ใช้แก้ก่อนบันทึกได้ */
export type FileMetadata = {
  title: string
  docNumber: string
  agency: string
  /** YYYY-MM-DD หรือว่าง */
  deadline: string
  category: FileCategory
  summary: string
}

/** ให้ AI อ่านไฟล์ที่อัปโหลดไว้แล้ว — ยังไม่บันทึกอะไร (1 คำขอ Gemini) */
export async function extractFileMetadata(caseId: string, fileId: string): Promise<FileMetadata> {
  const res = await fetch(`/api/cases/${caseId}/files/${fileId}/extract`, { method: "POST" })
  if (!res.ok) throw new ApiError(await readError(res), res.status)
  return res.json()
}

/** ให้ AI อ่านไฟล์แล้วเสนอการ์ดงาน — ผลลัพธ์รูปแบบเดียวกับแตกจากข้อความ */
export async function breakdownFile(
  caseId: string,
  fileId: string,
  context: string,
): Promise<BreakdownResult> {
  const res = await fetch(`/api/cases/${caseId}/files/${fileId}/breakdown`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context }),
  })
  if (!res.ok) throw new ApiError(await readError(res), res.status)
  return res.json()
}

export async function addCaseMember(caseId: string, memberId: string): Promise<void> {
  const res = await fetch(`/api/cases/${caseId}/members/${memberId}`, { method: "POST" })
  if (!res.ok) throw new ApiError(await readError(res), res.status)
}

export async function removeCaseMember(caseId: string, memberId: string): Promise<void> {
  const res = await fetch(`/api/cases/${caseId}/members/${memberId}`, { method: "DELETE" })
  if (!res.ok) throw new ApiError(await readError(res), res.status)
}

export async function setCaseMemberRole(
  caseId: string,
  memberId: string,
  role: "member" | "admin",
): Promise<void> {
  const res = await fetch(`/api/cases/${caseId}/members/${memberId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  })
  if (!res.ok) throw new ApiError(await readError(res), res.status)
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
  const res = await fetch("/api/projects")
  if (!res.ok) throw new ApiError(await readError(res), res.status)
  return (await res.json()).map(toProject)
}

export async function createProject(name: string, githubRepo: string | null): Promise<Project> {
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, githubRepo }),
  })
  if (!res.ok) throw new ApiError(await readError(res), res.status)
  return toProject(await res.json())
}

export async function updateProject(id: string, patch: { name?: string }): Promise<void> {
  const res = await fetch(`/api/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new ApiError(await readError(res), res.status)
}

export async function deleteProject(id: string): Promise<void> {
  const res = await fetch(`/api/projects/${id}`, { method: "DELETE" })
  if (!res.ok) throw new ApiError(await readError(res), res.status)
}

export async function addProjectMember(projectId: string, memberId: string): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/members/${memberId}`, { method: "POST" })
  if (!res.ok) throw new ApiError(await readError(res), res.status)
}

/** ตั้งหรือถอด admin — เจ้าของโปรเจคเท่านั้น */
export async function setProjectMemberRole(
  projectId: string,
  memberId: string,
  role: "member" | "admin",
): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/members/${memberId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  })
  if (!res.ok) throw new ApiError(await readError(res), res.status)
}

export async function removeProjectMember(projectId: string, memberId: string): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/members/${memberId}`, { method: "DELETE" })
  if (!res.ok) throw new ApiError(await readError(res), res.status)
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
  const res = await fetch(`/api/projects/${projectId}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(task),
  })
  if (!res.ok) throw new ApiError(await readError(res), res.status)
  return toTask(await res.json())
}

export async function updateTask(
  id: string,
  patch: Partial<
    Pick<Task, "title" | "description" | "status" | "priority" | "dueDate" | "category">
  >,
): Promise<void> {
  const res = await fetch(`/api/tasks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new ApiError(await readError(res), res.status)
}

export async function deleteTask(id: string): Promise<void> {
  const res = await fetch(`/api/tasks/${id}`, { method: "DELETE" })
  if (!res.ok) throw new ApiError(await readError(res), res.status)
}

export async function setAssignee(taskId: string, memberId: string, on: boolean): Promise<void> {
  const res = await fetch(`/api/tasks/${taskId}/assignees/${memberId}`, {
    method: on ? "PUT" : "DELETE",
  })
  if (!res.ok) throw new ApiError(await readError(res), res.status)
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
  const res = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) throw new ApiError(await readError(res), res.status)
  return res.json()
}

export async function register(input: {
  name: string
  username: string
  password: string
  email?: string
}): Promise<AuthMember> {
  const res = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!res.ok) throw new ApiError(await readError(res), res.status)
  return res.json()
}

export async function getAuthStatus(): Promise<AuthStatus> {
  const res = await fetch("/api/auth/status")
  if (!res.ok) throw new ApiError(await readError(res), res.status)
  return res.json()
}

export async function updateMyRole(role: string): Promise<AuthMember> {
  return patchMe({ role })
}

/** ตั้งอีเมลรับแจ้งเตือน — ส่งสตริงว่างเพื่อเลิกรับ */
export async function updateMyEmail(email: string): Promise<AuthMember> {
  return patchMe({ email })
}

async function patchMe(patch: Record<string, string>): Promise<AuthMember> {
  const res = await fetch("/api/auth/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new ApiError(await readError(res), res.status)
  return res.json()
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
  const res = await fetch("/api/members")
  if (!res.ok) throw new ApiError(await readError(res), res.status)
  return res.json()
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
  const res = await fetch("/api/github/repos")
  if (!res.ok) throw new ApiError(await readError(res), res.status)
  return res.json()
}

export async function importRepoCollaborators(repo: string): Promise<ImportResult> {
  const res = await fetch(`/api/github/import-collaborators?repo=${encodeURIComponent(repo)}`, {
    method: "POST",
  })
  if (!res.ok) throw new ApiError(await readError(res), res.status)
  return res.json()
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
  const res = await fetch("/api/system/health")
  if (!res.ok) throw new ApiError(await readError(res), res.status)
  return res.json()
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
  const res = await fetch(`/api/github/events/${eventId}/apply`, { method: "POST" })
  if (!res.ok) throw new ApiError(await readError(res), res.status)
}

export async function getCommits(projectId: string, limit = 8): Promise<Commit[]> {
  const res = await fetch(`/api/github/commits?project_id=${projectId}&limit=${limit}`)
  if (!res.ok) throw new ApiError(await readError(res), res.status)
  return res.json()
}

export async function getWebhookEvents(projectId: string, limit = 10): Promise<WebhookEvent[]> {
  const res = await fetch(`/api/github/events?project_id=${projectId}&limit=${limit}`)
  if (!res.ok) throw new ApiError(await readError(res), res.status)
  return res.json()
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
  const res = await fetch(`/api/tasks/${taskId}/comments`)
  if (!res.ok) throw new ApiError(await readError(res), res.status)
  return res.json()
}

export async function addComment(taskId: string, body: string): Promise<TaskComment> {
  const res = await fetch(`/api/tasks/${taskId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  })
  if (!res.ok) throw new ApiError(await readError(res), res.status)
  return res.json()
}

export async function deleteComment(taskId: string, commentId: string): Promise<void> {
  const res = await fetch(`/api/tasks/${taskId}/comments/${commentId}`, { method: "DELETE" })
  if (!res.ok) throw new ApiError(await readError(res), res.status)
}
