export type StatusId = "todo" | "in-progress" | "review" | "complete"

export type PriorityId = "urgent" | "high" | "normal" | "low" | "none"

export type Complexity = "low" | "medium" | "high"

export type Member = {
  id: string
  name: string
  role: string
  /** สีพื้นหลังของ avatar — ใช้เมื่อไม่มีรูปโปรไฟล์ */
  color: string
  /** รูปโปรไฟล์จาก GitHub — null สำหรับคนที่เจ้าของสร้างเองด้วยมือ */
  avatarUrl: string | null
  /** login บน GitHub / ชื่อผู้ใช้ของบัญชีธรรมดา — ไว้ค้นหาคนตอนเพิ่มสมาชิก */
  githubLogin?: string | null
  username?: string | null
}

export type Task = {
  id: string
  /** เลขงานในโปรเจค ใช้คู่กับ taskPrefix เป็นรหัสอย่าง KST-001 */
  number: number
  /** งานย่อยที่ AI แตกให้จะชี้กลับมาที่งานแม่ — งานแม่เท่านั้นที่ขึ้นบนบอร์ด */
  parentId: string | null
  title: string
  /** รายละเอียดงานที่เจ้าของเขียนไว้ */
  description: string | null
  status: StatusId
  /** id ของพนักงานที่ถูก assign (ดึงจาก members ของโปรเจค) */
  assigneeIds: string[]
  dueDate: string | null
  priority: PriorityId
  /** ฟิลด์ด้านล่างนี้ AI เติมให้ตอนแตกงาน แต่แก้เองได้ */
  category: string | null
  tags: string[]
  estimateHours: number | null
  /** true เมื่อถูกตีกลับจากรอตรวจให้ไปแก้ */
  needsRework: boolean
  /** จำนวนครั้งที่ถูกตีกลับสะสม */
  reworkCount: number
  /** เวลาที่ปิดงาน (ISO) — null ถ้ายังไม่เสร็จ */
  completedAt: string | null
  /** เวลาที่ดึงงานออกจาก "รอเริ่ม" ครั้งแรก (ISO) — null ถ้ายังไม่มีใครเริ่ม */
  startedAt: string | null
  /** เวลาที่ใช้จริง (ชม.) จาก startedAt ถึง completedAt — null ถ้ายังไม่เสร็จ
   *  ต่างจาก estimateHours ที่เป็นแค่ตัวเลขที่ AI เดาไว้ล่วงหน้า ไม่ใช่เวลาที่ใช้จริง */
  actualHours: number | null
  /** id ของงานที่ต้องเสร็จก่อนใบนี้ถึงจะเริ่มได้ — ว่าง = เริ่มได้เลย */
  dependsOn: string[]
  /** ไฟล์ในหน้า Documents ที่งานนี้แตกมาจาก — null ถ้าสร้างเองหรือเอกสารถูกลบแล้ว */
  sourceFileId: string | null
  /** branch ล่าสุดที่ commit ถึงงานนี้ */
  branch: string | null
  /** ลิงก์ PR ล่าสุดที่อ้างถึงงานนี้ */
  reviewUrl: string | null
  complexity: Complexity | null
}

export type Project = {
  id: string
  name: string
  /** id ของคนที่สร้างโปรเจค — ลบโปรเจคกับตั้ง admin ได้คนเดียว */
  ownerId: string | null
  /** สมาชิกที่เจ้าของตั้งเป็น admin — ทำได้เท่าเจ้าของในหน้าเว็บ */
  adminIds: string[]
  /** รหัสย่อที่ใช้นำหน้าเลขงาน เช่น "KST" */
  taskPrefix: string
  /** repo บน GitHub ที่โปรเจคนี้ผูกอยู่ เช่น "kongzell/Follow-up" */
  githubRepo: string | null
  tasks: Task[]
  memberIds: string[]
}

// ---------- Documents ----------

export type CaseStatus = "received" | "in_progress" | "delivered" | "closed"
export type FileCategory = "tor" | "contract" | "amendment" | "minutes" | "acceptance" | "other"

/** เอกสาร 1 ฉบับในเรื่อง — metadata เท่านั้น ตัวไฟล์ดึงผ่าน caseFileUrl() */
/** เอกสาร 1 ใบในที่เก็บ — เรื่อง/สถานะ/โปรเจคเป็นของใบนี้เอง */
export type CaseFile = {
  id: string
  /** เรื่อง — ตั้งต้นจากชื่อไฟล์ แก้ได้ */
  title: string
  status: CaseStatus
  docNumber: string | null
  agency: string | null
  deadline: string | null
  /** โปรเจคที่ใบนี้เกี่ยว — null = ไม่เกี่ยวโปรเจค */
  projectId: string | null
  filename: string
  contentType: string
  size: number
  category: FileCategory
  version: number
  /** ไฟล์ฉบับก่อนที่ฉบับนี้มาแทน — null ถ้าเป็นฉบับแรก */
  replacesId: string | null
  uploadedBy: string | null
  uploadedAt: string
}

export type RequestStatus = "pending" | "fulfilled" | "declined"

/** คำขอเอกสารข้ามที่เก็บ — ชื่อที่เก็บอีกฝั่งดูจาก CaseDirectoryEntry */
export type DocumentRequest = {
  id: string
  fromCaseId: string
  toCaseId: string
  requestedBy: string | null
  title: string
  note: string | null
  status: RequestStatus
  /** สำเนาที่ส่งเข้าที่เก็บผู้ขอ (เฉพาะ fulfilled) */
  fileId: string | null
  /** โปรเจคที่จะเอาเอกสารไปใช้ — ยื่นจากบอร์ด ไฟล์ที่ได้รับผูกโปรเจคนี้ให้เอง */
  projectId: string | null
  reply: string | null
  resolvedBy: string | null
  resolvedAt: string | null
  createdAt: string
}

/** ที่เก็บทุกอันในระบบแบบย่อ — ไว้เลือกปลายทางตอนขอเอกสาร */
export type CaseDirectoryEntry = {
  id: string
  title: string
  ownerId: string | null
  memberCount: number
  isMember: boolean
}

/** Document = ที่เก็บเอกสารกลางของทีม — มีแค่ชื่อกับสมาชิก เอกสารทุกเรื่องส่งเข้าที่นี่ */
export type Case = {
  id: string
  title: string
  ownerId: string | null
  memberIds: string[]
  adminIds: string[]
  files: CaseFile[]
  /** คำขอที่ที่เก็บนี้ส่งออก / ได้รับ */
  requestsOut: DocumentRequest[]
  requestsIn: DocumentRequest[]
  createdAt: string
}

export const CASE_STATUSES: { id: CaseStatus; label: string; color: string }[] = [
  { id: "received", label: "Received", color: "var(--status-todo)" },
  { id: "in_progress", label: "In progress", color: "var(--status-progress)" },
  { id: "delivered", label: "Delivered", color: "var(--status-review)" },
  { id: "closed", label: "Closed", color: "var(--status-complete)" },
]

export const FILE_CATEGORIES: { id: FileCategory; label: string }[] = [
  { id: "tor", label: "TOR" },
  { id: "contract", label: "Contract" },
  { id: "amendment", label: "Amendment" },
  { id: "minutes", label: "Minutes" },
  { id: "acceptance", label: "Acceptance" },
  { id: "other", label: "Other" },
]

/** ไฟล์ฉบับล่าสุดของแต่ละสาย — ฉบับที่ถูกแทนที่แล้วเป็นแค่ประวัติ ไม่นับเป็นเอกสารแยก
 *  ใช้ตัวเดียวกันทั้ง sidebar การ์ด และแผงรายละเอียด ตัวเลขจะได้ตรงกันทุกที่ */
export const currentFiles = (c: Case): CaseFile[] => {
  const replaced = new Set(c.files.map((f) => f.replacesId).filter(Boolean))
  return c.files.filter((f) => !replaced.has(f.id))
}

/** ขนาดไฟล์อ่านง่าย — เอกสารส่วนใหญ่อยู่หลัก KB ถึงไม่กี่ MB */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/** รหัสงานที่เอาไปพิมพ์ใน commit ได้ เช่น KST-001 */
export const taskKey = (prefix: string, number: number) =>
  `${prefix}-${String(number).padStart(3, "0")}`

/** ที่อยู่ของโค้ดสำหรับงานหนึ่งใบ — คืน null ถ้ายังไม่เคยมี commit อ้างถึง
 *
 * ชอบลิงก์ PR มากกว่า เพราะเห็นทั้ง diff และคอมเมนต์รีวิวในหน้าเดียว
 * ถ้ามีแค่ branch ใช้หน้า compare เพราะบอกได้ว่าเปลี่ยนอะไรไปจาก branch หลัก
 */
export const codeLink = (
  task: Pick<Task, "branch" | "reviewUrl">,
  githubRepo: string | null,
): { url: string; label: string } | null => {
  if (task.reviewUrl) return { url: task.reviewUrl, label: "View Pull Request" }
  if (task.branch && githubRepo) {
    return {
      url: `https://github.com/${githubRepo}/compare/${encodeURIComponent(task.branch)}`,
      label: task.branch,
    }
  }
  return null
}

export const STATUSES: { id: StatusId; label: string; color: string }[] = [
  { id: "todo", label: "To Do", color: "var(--status-todo)" },
  { id: "in-progress", label: "In Progress", color: "var(--status-progress)" },
  { id: "review", label: "In Review", color: "var(--status-review)" },
  { id: "complete", label: "Done", color: "var(--status-complete)" },
]

export const PRIORITIES: { id: PriorityId; label: string; color: string }[] = [
  { id: "urgent", label: "Urgent", color: "var(--danger)" },
  { id: "high", label: "High", color: "var(--prio-high)" },
  { id: "normal", label: "Normal", color: "var(--status-progress)" },
  { id: "low", label: "Low", color: "var(--text-dim)" },
  { id: "none", label: "None", color: "var(--text-faint)" },
]

export const CATEGORIES: { id: string; color: string }[] = [
  { id: "Frontend", color: "#4a9eff" },
  { id: "Backend", color: "#22c55e" },
  { id: "Database", color: "#f5a524" },
  { id: "Design", color: "#ec4899" },
  { id: "DevOps", color: "#14b8a6" },
  { id: "Testing", color: "#a855f7" },
  { id: "Other", color: "#8b8b8b" },
]

export const COMPLEXITIES: { id: Complexity; label: string; color: string }[] = [
  { id: "low", label: "Easy", color: "var(--status-complete)" },
  { id: "medium", label: "Medium", color: "var(--prio-high)" },
  { id: "high", label: "Hard", color: "var(--danger)" },
]

/**
 * แต้มภาระงานตามความยาก — ใช้วัด workload ของแต่ละคน
 * งานที่ไม่ได้ระบุความยากให้ 2 แต้ม (ประมาณว่าปานกลางค่อนไปทางง่าย)
 */
export const COMPLEXITY_POINTS: Record<string, number> = {
  low: 1,
  medium: 3,
  high: 5,
}

export const UNRATED_POINTS = 2

/** เพดานแต้มที่คนหนึ่งควรถืออยู่พร้อมกัน — เกินกว่านี้ถือว่างานล้นมือ
 *
 * 10 แต้ม ≈ งานยาก 2 ใบ หรืองานกลาง 3 ใบ กับงานง่ายอีกใบ
 * ใช้ค่าเดียวกันทุกคนเพื่อให้เทียบกันได้ตรง ๆ ว่าใครแบกเกิน
 */
export const WORKLOAD_CAPACITY = 10

/** ระดับภาระเทียบกับเพดาน — ใช้เลือกสีหลอด */
export const workloadLevel = (points: number): "ok" | "busy" | "over" => {
  if (points >= WORKLOAD_CAPACITY) return "over"
  if (points >= WORKLOAD_CAPACITY * 0.7) return "busy"
  return "ok"
}

/** แต้มของงานหนึ่งใบ */
export const taskPoints = (t: Task): number =>
  t.complexity ? (COMPLEXITY_POINTS[t.complexity] ?? UNRATED_POINTS) : UNRATED_POINTS

/** งานที่ยังไม่เสร็จของคนคนหนึ่ง — ภาระที่ยังแบกอยู่จริง */
export const openTasksOf = (tasks: Task[], memberId: string): Task[] =>
  tasks.filter((t) => t.assigneeIds.includes(memberId) && t.status !== "complete")

/** แปลงชั่วโมงที่ใช้จริงเป็นจำนวนวันเต็ม — ปัดขึ้นเสมอ (เศษของวันนับเป็น 1 วัน) */
export function formatDuration(hours: number): string {
  const days = Math.max(1, Math.ceil(hours / 24))
  return `${days} วัน`
}

/** วันที่วันนี้ตามเวลาเครื่องผู้ใช้ แบบ YYYY-MM-DD — เทียบกับ dueDate ได้ตรง ๆ
 *  ห้ามใช้ toISOString() เพราะแปลงเป็น UTC ก่อน อาจได้วันที่ผิดตอนใกล้เที่ยงคืน */
export function todayIso(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** งานเลยกำหนดส่งแล้วหรือยัง — ปิดงานแล้วไม่นับว่าเลยกำหนดอีกต่อไป */
export function isOverdue(task: Task): boolean {
  return task.dueDate !== null && task.status !== "complete" && task.dueDate < todayIso()
}

export const categoryColor = (name: string | null): string =>
  CATEGORIES.find((c) => c.id === name)?.color ?? "var(--text-faint)"

/**
 * สายที่ถนัด — GitHub ไม่มีข้อมูลนี้ ผู้ใช้ต้องเลือกเอง
 * ตั้งชื่อให้ตรงกับ CATEGORIES ที่ AI ใช้ จะได้จับคู่คนกับงานได้
 */
export const ROLES = [
  "Frontend",
  "Backend",
  "Fullstack",
  "Database",
  "Design",
  "DevOps",
  "Testing",
]

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}
