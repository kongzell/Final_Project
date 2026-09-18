import { useMemo, useRef, useState } from "react"
import type { CaseFilePatch, CasePatch, NewCaseFile, NewDocumentRequest } from "../api"
import { caseFileUrl } from "../api"
import type {
  Case, CaseDirectoryEntry, CaseFile, CaseStatus, DocumentRequest, FileCategory, Member, Project,
} from "../types"
import { CASE_STATUSES, currentFiles, FILE_CATEGORIES, formatBytes, todayIso } from "../types"
import { ACCEPT, MAX_BYTES } from "./AddDocumentModal"
import { Avatar } from "./Avatar"
import { DocumentFileModal } from "./DocumentFileModal"
import {
  IconDownload, IconFile, IconFolder, IconLink, IconPlus, IconSparkle, IconTrash,
} from "./Icons"
import { RequestDocumentModal } from "./RequestDocumentModal"
import "./Documents.css"

const fmtDate = (iso: string) =>
  new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  })

const categoryLabel = (id: FileCategory) => FILE_CATEGORIES.find((c) => c.id === id)?.label ?? id

/** ยังไม่จบ — received / in_progress */
const isOpen = (f: CaseFile) => f.status === "received" || f.status === "in_progress"

/** เลยกำหนดส่งแล้วแต่ยังไม่จบ — กติกาเดียวกับงาน */
const isLate = (f: CaseFile) => f.deadline !== null && isOpen(f) && f.deadline < todayIso()

/** AI อ่านได้เฉพาะ PDF/รูป/ข้อความ — Word/Excel ต้องแปลงก่อน */
const aiReadable = (f: Pick<CaseFile, "contentType">) =>
  ["application/pdf", "image/png", "image/jpeg", "text/plain"].includes(f.contentType)

export type DocumentActions = {
  onUpdate: (id: string, patch: CasePatch) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onAddFile: (id: string, input: NewCaseFile) => Promise<void>
  onUpdateFile: (id: string, fileId: string, patch: CaseFilePatch) => Promise<void>
  onDeleteFile: (id: string, fileId: string) => Promise<void>
  onManageMembers: (id: string) => void
  onBreakdown: (c: Case, file: CaseFile) => void
  /** ให้ AI อ่านไฟล์แล้วเติมเรื่อง/เลขที่/หน่วยงาน/กำหนดส่งที่ยังว่างของใบนั้น — คืนข้อความบอกว่าเติมอะไร */
  onExtract: (c: Case, file: CaseFile) => Promise<string>
  /** ขอเอกสารข้ามที่เก็บ */
  onRequest: (id: string, input: NewDocumentRequest) => Promise<void>
  onFulfill: (id: string, requestId: string, fileId: string) => Promise<void>
  /** อัปโหลดไฟล์ใหม่เข้าที่เก็บแล้วส่งตอบคำขอทันที — ใช้เมื่อเอกสารที่ถูกขอยังไม่อยู่ในระบบ */
  onFulfillUpload: (id: string, requestId: string, input: NewCaseFile) => Promise<void>
  onDecline: (id: string, requestId: string, reply: string) => Promise<void>
  onCancelRequest: (id: string, requestId: string) => Promise<void>
}

// ---------- หน้า Documents: รายการที่เก็บ หรือที่เก็บที่เปิดอยู่ ----------

type ViewProps = DocumentActions & {
  cases: Case[]
  /** ที่เก็บทุกอันในระบบ — ปลายทางของคำขอ และแปลง id → ชื่อ */
  directory: CaseDirectoryEntry[]
  projects: Project[]
  members: Member[]
  currentMemberId: string | null
  selected: Case | null
  onSelect: (id: string | null) => void
  onNew: () => void
  onOpenProject: (projectId: string) => void
}

export function DocumentsView(props: ViewProps) {
  const { cases, members, selected, onSelect, onNew } = props

  if (selected) return <Workspace key={selected.id} {...props} c={selected} />

  return (
    <div className="docs">
      <div className="docs-head">
        <div>
          <h2 className="docs-title"><IconFolder size={18} /> Documents</h2>
          <p className="docs-sub">A shared inbox for your team — every incoming document goes here, whatever it is about</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={onNew}>
          <IconPlus size={14} /> New document
        </button>
      </div>

      {cases.length === 0 ? (
        <div className="docs-empty">
          <IconFolder size={36} />
          <h3>No document space yet</h3>
          <p>Create one for your team or department, add the people who handle paperwork, then send every TOR, letter or contract into it. Link a file to a project when you want AI to turn it into task cards.</p>
          <button type="button" className="btn btn-primary" onClick={onNew}>
            <IconPlus size={14} /> New document
          </button>
        </div>
      ) : (
        <div className="docs-grid">
          {cases.map((c) => (
            <CaseCard key={c.id} c={c} members={members} onOpen={() => onSelect(c.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- การ์ดที่เก็บ (หน้ารวม) ----------

function CaseCard({ c, members, onOpen }: { c: Case; members: Member[]; onOpen: () => void }) {
  const people = members.filter((m) => c.memberIds.includes(m.id))
  const files = currentFiles(c)
  const open = files.filter(isOpen).length
  const late = files.filter(isLate).length

  return (
    <button type="button" className={"case-card" + (late > 0 ? " is-late" : "")} onClick={onOpen}>
      <div className="case-top">
        <IconFolder size={18} className="case-glyph" />
        {late > 0 && <span className="case-late-tag">{late} overdue</span>}
      </div>
      <h3 className="case-title">{c.title}</h3>
      <div className="case-row">
        <span className="case-files"><IconFile size={13} /><span>{files.length} document{files.length === 1 ? "" : "s"}</span></span>
        {open > 0 && <span className="case-open">{open} open</span>}
        <span className="case-people">
          {people.slice(0, 3).map((m) => <Avatar key={m.id} member={m} size={20} />)}
          {people.length > 3 && <span className="case-more">+{people.length - 3}</span>}
        </span>
      </div>
    </button>
  )
}

// ---------- ที่เก็บที่เปิดอยู่: หัว + ตัวกรอง + การ์ดเอกสาร ----------

type WorkspaceProps = ViewProps & { c: Case }
type StatusFilter = CaseStatus | "all" | "open"

function Workspace({
  c, projects, members, directory, currentMemberId,
  onUpdate, onAddFile, onUpdateFile, onDeleteFile, onBreakdown, onExtract,
  onRequest, onFulfill, onFulfillUpload, onDecline, onCancelRequest,
}: WorkspaceProps) {
  const isOwner = currentMemberId !== null && c.ownerId === currentMemberId
  const canManage = isOwner || (currentMemberId !== null && c.adminIds.includes(currentMemberId))
  /** แก้ข้อมูลใบนี้ได้ — คนส่งเอง หรือเจ้าของ/admin ของที่เก็บ (กติกาเดียวกับ API) */
  const canEdit = (f: CaseFile) => canManage || (currentMemberId !== null && f.uploadedBy === currentMemberId)
  const linkable = projects.filter(
    (p) => currentMemberId !== null && (p.ownerId === currentMemberId || p.adminIds.includes(currentMemberId)),
  )
  const canBreakdownIn = (p: Project | null) =>
    p !== null && currentMemberId !== null && (p.ownerId === currentMemberId || p.adminIds.includes(currentMemberId))

  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [extracting, setExtracting] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  // ชื่อในช่องแก้ — คัดลอกจากของจริงตอนเริ่มแก้ทีเดียว (key ของ Workspace รีเซ็ต state ตอนสลับที่เก็บอยู่แล้ว)
  const [title, setTitle] = useState("")
  const [adding, setAdding] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [editing, setEditing] = useState<CaseFile | null>(null)
  const [replacing, setReplacing] = useState<CaseFile | null>(null)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  // กระดาน = คอลัมน์ Requests + คอลัมน์ละประเภทเอกสาร (หรือละโปรเจค) — รายการ = การ์ดเรียงเฉย ๆ
  const [layout, setLayout] = useState<"board" | "list">("board")
  const [groupBy, setGroupBy] = useState<"category" | "project">("category")
  /** คำขอที่กำลังตอบด้วยการอัปโหลดไฟล์ใหม่ */
  const [uploadFor, setUploadFor] = useState<DocumentRequest | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const startRename = () => { setTitle(c.title); setRenaming(true) }

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong") }
  }

  const uploader = (id: string | null) => members.find((m) => m.id === id)?.name ?? "—"
  const files = useMemo(() => currentFiles(c), [c])
  const history = (f: CaseFile): CaseFile[] => {
    const out: CaseFile[] = []
    let cur: CaseFile | undefined = f
    while (cur?.replacesId) {
      cur = c.files.find((x) => x.id === cur!.replacesId)
      if (cur) out.push(cur)
    }
    return out
  }

  // ที่เก็บของทีมมีเอกสารหลายเรื่องปนกัน — กรองตามสถานะและค้นจากเรื่อง/เลขที่/หน่วยงาน/ชื่อไฟล์
  // ใบที่เลยกำหนดขึ้นก่อน ที่เหลือใหม่สุดก่อน
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const projectName = (f: CaseFile) => projects.find((p) => p.id === f.projectId)?.name
    return files
      .filter((f) => statusFilter === "all" ? true : statusFilter === "open" ? isOpen(f) : f.status === statusFilter)
      .filter((f) => !q || [f.title, f.docNumber, f.agency, f.filename, projectName(f)]
        .some((s) => s?.toLowerCase().includes(q)))
      .sort((a, b) => Number(isLate(b)) - Number(isLate(a)) || b.uploadedAt.localeCompare(a.uploadedAt))
  }, [files, query, statusFilter, projects])

  const counts = {
    all: files.length,
    open: files.filter(isOpen).length,
    late: files.filter(isLate).length,
  }

  const projectOf = (f: CaseFile) => projects.find((p) => p.id === f.projectId) ?? null
  const card = (f: CaseFile) => (
    <DocCard
      key={f.id}
      f={f}
      project={projectOf(f)}
      older={history(f)}
      uploader={uploader(f.uploadedBy)}
      caseId={c.id}
      canEdit={canEdit(f)}
      canDelete={isOwner}
      canBreakdown={canBreakdownIn(projectOf(f))}
      extracting={extracting === f.id}
      onStatus={(s) => void run(() => onUpdateFile(c.id, f.id, { status: s }))}
      onEdit={() => setEditing(f)}
      onVersion={() => { setReplacing(f); fileInput.current?.click() }}
      onDelete={() => { if (window.confirm(`Delete "${f.title}" (${f.filename})?`)) void run(() => onDeleteFile(c.id, f.id)) }}
      onBreakdown={() => onBreakdown(c, f)}
      onExtract={() => {
        setExtracting(f.id)
        setNote(null)
        void run(async () => setNote(await onExtract(c, f))).finally(() => setExtracting(null))
      }}
    />
  )

  // คอลัมน์ของกระดาน — โชว์เฉพาะกลุ่มที่มีเอกสาร (6 ประเภทว่าง ๆ เรียงกันรกเปล่า ๆ)
  type Group = { key: string; label: string; hint?: string; files: CaseFile[] }
  const groups: Group[] = groupBy === "category"
    ? FILE_CATEGORIES.map((k) => ({ key: k.id, label: k.label, files: shown.filter((f) => f.category === k.id) }))
    : [
        ...projects.map((p) => ({ key: p.id, label: p.name, hint: p.githubRepo ?? undefined, files: shown.filter((f) => f.projectId === p.id) })),
        { key: "none", label: "No project", files: shown.filter((f) => !f.projectId || !projects.some((p) => p.id === f.projectId)) },
      ]
  const columns = groups.filter((g) => g.files.length > 0)
  const hasRequests = c.requestsIn.some((r) => r.status === "pending") || c.requestsOut.length > 0

  const requestColumn = (
    <RequestColumn
      c={c}
      files={files}
      members={members}
      directory={directory}
      currentMemberId={currentMemberId}
      canManage={canManage}
      onNew={() => setRequesting(true)}
      onFulfill={(rid, fid) => void run(() => onFulfill(c.id, rid, fid))}
      onUpload={(r) => setUploadFor(r)}
      onDecline={(rid, reply) => void run(() => onDecline(c.id, rid, reply))}
      onCancel={(rid) => void run(() => onCancelRequest(c.id, rid))}
    />
  )

  /** ฉบับใหม่ของใบเดิม — ไม่ต้องกรอกอะไร API สืบทอดเรื่อง/โปรเจคให้ */
  const pickVersion = (f: File | null) => {
    const target = replacing
    setReplacing(null)
    if (!f || !target) return
    if (f.size > MAX_BYTES) { setError(`${f.name} is ${formatBytes(f.size)} — the limit is 5 MB`); return }
    void run(() => onAddFile(c.id, { file: f, category: target.category, replacesId: target.id }))
  }

  return (
    <div className="docs">
      <div className="docs-head">
        <div className="ws-head-main">
          {renaming ? (
            <input
              autoFocus
              className="field-input case-rename"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && title.trim()) { void run(() => onUpdate(c.id, { title: title.trim() })); setRenaming(false) }
                if (e.key === "Escape") { setTitle(c.title); setRenaming(false) }
              }}
              onBlur={() => { setTitle(c.title); setRenaming(false) }}
            />
          ) : (
            <h2
              className={"docs-title" + (canManage ? " is-editable" : "")}
              title={canManage ? "Click to rename" : undefined}
              onClick={() => canManage && startRename()}
            >
              <IconFolder size={18} /> {c.title}
            </h2>
          )}
          <p className="docs-sub">
            {counts.all} document{counts.all === 1 ? "" : "s"} · {counts.open} open
            {counts.late > 0 && <span className="case-late-tag">{counts.late} overdue</span>}
          </p>
        </div>

        <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
          <IconPlus size={14} /> Add document
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => { pickVersion(e.target.files?.[0] ?? null); e.target.value = "" }}
        />
      </div>

      {(files.length > 0 || hasRequests) && (
        <div className="ws-filters">
          <div className="ws-seg" role="group" aria-label="Layout">
            <button type="button" className={"ws-seg-btn" + (layout === "board" ? " is-on" : "")} onClick={() => setLayout("board")}>Board</button>
            <button type="button" className={"ws-seg-btn" + (layout === "list" ? " is-on" : "")} onClick={() => setLayout("list")}>List</button>
          </div>
          {layout === "board" && (
            <div className="ws-seg" role="group" aria-label="Group by">
              <button type="button" className={"ws-seg-btn" + (groupBy === "category" ? " is-on" : "")} onClick={() => setGroupBy("category")}>By type</button>
              <button type="button" className={"ws-seg-btn" + (groupBy === "project" ? " is-on" : "")} onClick={() => setGroupBy("project")}>By project</button>
            </div>
          )}
          <div className="ws-chips">
            {([["all", "All"], ["open", "Open"], ...CASE_STATUSES.map((s) => [s.id, s.label])] as [StatusFilter, string][]).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={"ws-chip" + (statusFilter === id ? " is-on" : "")}
                onClick={() => setStatusFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            className="field-input ws-search"
            placeholder="Search subject, number, agency…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {error && <p className="modal-error">{error}</p>}
      {note && <p className="ws-note">{note}</p>}

      {files.length === 0 && !hasRequests ? (
        <div className="docs-empty">
          <IconFile size={36} />
          <h3>Nothing here yet</h3>
          <p>Send the first document in — a TOR, a letter, a contract, minutes. Each one keeps its own subject, number, deadline and status. Or ask another team for one.</p>
          <div className="ws-add">
            <button type="button" className="btn" onClick={() => setRequesting(true)}>Request document</button>
            <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
              <IconPlus size={14} /> Add document
            </button>
          </div>
        </div>
      ) : layout === "board" ? (
        <div className="doc-board">
          {requestColumn}
          {columns.map((g) => (
            <section key={g.key} className="doc-col">
              <header className="doc-col-head">
                <span className="doc-col-name">{g.label}</span>
                {g.hint && <span className="doc-col-hint">{g.hint}</span>}
                <span className="doc-col-count">{g.files.length}</span>
              </header>
              {g.files.map(card)}
            </section>
          ))}
          {columns.length === 0 && files.length > 0 && <p className="ws-nomatch doc-col-none">No documents match this filter.</p>}
        </div>
      ) : (
        <>
          {hasRequests && <div className="doc-board is-strip">{requestColumn}</div>}
          {shown.length === 0 ? (
            <p className="ws-nomatch">No documents match this filter.</p>
          ) : (
            <div className="docs-grid">{shown.map(card)}</div>
          )}
        </>
      )}

      {adding && (
        <DocumentFileModal
          linkable={linkable}
          onClose={() => setAdding(false)}
          onSubmit={(input) => onAddFile(c.id, input)}
          onSave={async () => {}}
        />
      )}
      {requesting && (
        <RequestDocumentModal
          fromCaseId={c.id}
          directory={directory}
          members={members}
          onClose={() => setRequesting(false)}
          onSubmit={(input) => onRequest(c.id, input)}
        />
      )}
      {uploadFor && (
        <DocumentFileModal
          linkable={linkable}
          defaultTitle={uploadFor.title}
          submitLabel="Upload & send"
          onClose={() => setUploadFor(null)}
          onSubmit={(input) => onFulfillUpload(c.id, uploadFor.id, input)}
          onSave={async () => {}}
        />
      )}
      {editing && (
        <DocumentFileModal
          editing={editing}
          linkable={linkable}
          onClose={() => setEditing(null)}
          onSubmit={async () => {}}
          onSave={(patch) => onUpdateFile(c.id, editing.id, patch)}
        />
      )}
    </div>
  )
}

// ---------- การ์ดเอกสาร 1 ใบ ----------

type DocCardProps = {
  f: CaseFile
  project: Project | null
  older: CaseFile[]
  uploader: string
  caseId: string
  canEdit: boolean
  canDelete: boolean
  canBreakdown: boolean
  extracting: boolean
  onStatus: (s: CaseStatus) => void
  onEdit: () => void
  onVersion: () => void
  onDelete: () => void
  onBreakdown: () => void
  onExtract: () => void
}

function DocCard({
  f, project, older, uploader, caseId, canEdit, canDelete, canBreakdown, extracting,
  onStatus, onEdit, onVersion, onDelete, onBreakdown, onExtract,
}: DocCardProps) {
  const status = CASE_STATUSES.find((s) => s.id === f.status)
  const late = isLate(f)
  const readable = aiReadable(f)
  const done = project ? project.tasks.filter((t) => t.parentId === null && t.status === "complete").length : 0
  const total = project ? project.tasks.filter((t) => t.parentId === null).length : 0
  const breakdownHint = !readable
    ? "AI can read PDF, images and text — export this to PDF first"
    : project === null ? "Link this document to a project first (Edit)"
    : !canBreakdown ? "Only the owner or an admin of the linked project can create tasks"
    : "Let AI read this file and propose task cards"

  return (
    <article className={"file-card" + (late ? " is-late" : "")}>
      <div className="file-card-top">
        <span className="case-file-cat">{categoryLabel(f.category)}</span>
        {f.version > 1 && <span className="file-ver">v{f.version}</span>}
        {/* select ธรรมดาแทนเมนูป๊อปอัป — การ์ดแคบ เมนู 215px ล้น */}
        {canEdit ? (
          <label className="ws-status" style={{ color: status?.color }} title="Status of this document">
            <span className="dot" style={{ background: status?.color }} />
            <select value={f.status} onChange={(e) => onStatus(e.target.value as CaseStatus)}>
              {CASE_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
        ) : (
          <span className="case-status" style={{ color: status?.color }}>
            <span className="dot" style={{ background: status?.color }} />{status?.label}
          </span>
        )}
      </div>

      <h3 className="case-title">{f.title}</h3>
      {(f.docNumber || f.agency) && (
        <p className="case-meta">
          {f.docNumber && <span>{f.docNumber}</span>}
          {f.docNumber && f.agency && <span className="case-dot">·</span>}
          {f.agency && <span>{f.agency}</span>}
        </p>
      )}

      <a className="file-card-name" href={caseFileUrl(caseId, f.id)} target="_blank" rel="noreferrer" title="Open">
        <IconFile size={14} /> {f.filename}
      </a>
      <p className="file-card-meta">
        {formatBytes(f.size)} · {uploader} · {fmtDate(f.uploadedAt)}
        {f.deadline && (
          <span className={"case-deadline" + (late ? " is-late" : "")}> · {late ? "Overdue" : "Due"} {fmtDate(f.deadline)}</span>
        )}
      </p>
      {older.length > 0 && (
        <p className="file-card-history">replaces {older.map((h) => `${h.filename} (v${h.version})`).join(" ← ")}</p>
      )}

      <div className="case-foot">
        {project ? (
          <>
            <span className="case-link"><IconLink size={12} /> {project.name}</span>
            {total > 0 ? (
              <span className="case-progress">
                <span className="case-bar"><span style={{ width: `${(done / total) * 100}%` }} /></span>
                {done}/{total} done
              </span>
            ) : <span className="case-progress is-dim">no tasks yet</span>}
          </>
        ) : <span className="case-link is-dim">Not related to a project</span>}
      </div>

      <div className="file-card-actions">
        <button
          type="button"
          className="member-action is-ai"
          title={breakdownHint}
          disabled={!canBreakdown || !readable}
          onClick={onBreakdown}
        >
          <IconSparkle size={13} /> Create task cards
        </button>
        {canEdit && (
          <>
            <button
              type="button"
              className="member-action"
              title={readable ? "AI reads subject, doc number, agency and deadline from this file (fills only empty fields · 1 Gemini request)" : "AI can read PDF, images and text only"}
              disabled={!readable || extracting}
              onClick={onExtract}
            >
              {extracting ? "Reading..." : "Fill details"}
            </button>
            <button type="button" className="member-action" onClick={onEdit}>Edit</button>
          </>
        )}
        <a className="member-action" href={caseFileUrl(caseId, f.id)} download={f.filename} title="Download">
          <IconDownload size={14} />
        </a>
        <button type="button" className="member-action" title="Upload a new version of this file" onClick={onVersion}>
          New version
        </button>
        {canDelete && (
          <button type="button" className="member-action is-danger" title="Delete" onClick={onDelete}>
            <IconTrash size={14} />
          </button>
        )}
      </div>
    </article>
  )
}

// ---------- แผงขวาของที่เก็บ (เหมือน Project team) ----------

type PanelProps = {
  c: Case
  members: Member[]
  currentMemberId: string | null
  onDelete: (id: string) => Promise<void>
  onManageMembers: (id: string) => void
  onClose: () => void
}

export function DocumentPanel({ c, members, currentMemberId, onDelete, onManageMembers, onClose }: PanelProps) {
  const isOwner = currentMemberId !== null && c.ownerId === currentMemberId
  const canManage = isOwner || (currentMemberId !== null && c.adminIds.includes(currentMemberId))
  const people = members.filter((m) => c.memberIds.includes(m.id))
  const files = currentFiles(c)
  const [error, setError] = useState<string | null>(null)
  const byStatus = CASE_STATUSES.map((s) => ({ ...s, n: files.filter((f) => f.status === s.id).length }))
  const pendingIn = c.requestsIn.filter((r) => r.status === "pending").length

  return (
    <aside className="rs">
      <section className="rs-panel">
        <header className="rs-head">
          <span className="rs-title">Overview</span>
          <span className="rs-count">{files.length}</span>
        </header>
        <ul className="ws-overview">
          {byStatus.map((s) => (
            <li key={s.id}>
              <span className="case-status" style={{ color: s.color }}><span className="dot" style={{ background: s.color }} />{s.label}</span>
              <span className="ws-overview-n">{s.n}</span>
            </li>
          ))}
          <li>
            <span className="case-status" style={{ color: "var(--accent-text)" }}><span className="dot" style={{ background: "var(--accent)" }} />Requests to answer</span>
            <span className="ws-overview-n">{pendingIn}</span>
          </li>
        </ul>
      </section>

      <section className="rs-panel">
        <header className="rs-head">
          <span className="rs-title">Members</span>
          <span className="rs-count">{people.length}</span>
        </header>
        <ul className="rs-team">
          {people.map((m) => (
            <li key={m.id} className="ws-member">
              <Avatar member={m} size={22} />
              <span className="rs-team-name">{m.name}</span>
              {m.id === c.ownerId ? <span className="owner-tag">Owner</span>
                : c.adminIds.includes(m.id) ? <span className="owner-tag is-admin">Admin</span>
                : <span className="rs-team-role">{m.role}</span>}
            </li>
          ))}
        </ul>
        {canManage && (
          <button type="button" className="btn ws-add-member" onClick={() => onManageMembers(c.id)}>
            <IconPlus size={14} /> Add member
          </button>
        )}
        <p className="rs-fair">Everyone here can send documents in and see all of them. Admins can edit any document.</p>
      </section>

      {error && <p className="modal-error">{error}</p>}

      {isOwner && (
        <button
          type="button"
          className="btn case-delete ws-delete"
          onClick={() => {
            if (window.confirm(`Delete "${c.title}" and all ${c.files.length} file(s) including older versions? Tasks created from them are kept.`)) {
              setError(null)
              onDelete(c.id).then(onClose).catch((e) => setError(e instanceof Error ? e.message : "Something went wrong"))
            }
          }}
        >
          <IconTrash size={14} /> Delete document
        </button>
      )}
    </aside>
  )
}

// ---------- คอลัมน์ Requests (คอลัมน์แรกของกระดาน) ----------

const fmtWhen = (iso: string) =>
  new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" })

type RequestColumnProps = {
  c: Case
  files: CaseFile[]
  members: Member[]
  directory: CaseDirectoryEntry[]
  currentMemberId: string | null
  canManage: boolean
  onNew: () => void
  onFulfill: (requestId: string, fileId: string) => void
  onUpload: (r: DocumentRequest) => void
  onDecline: (requestId: string, reply: string) => void
  onCancel: (requestId: string) => void
}

/** คำขอเข้า (ทีมอื่นขอจากเรา — owner/admin เลือกไฟล์ส่ง) และคำขอออก (เราขอทีมอื่น — รอ/ได้แล้ว/ถูกปฏิเสธ)
 *  อยู่เป็นคอลัมน์แรกของกระดานเสมอ — ปุ่มขอเอกสารอยู่ท้ายคอลัมน์ */
function RequestColumn({
  c, files, members, directory, currentMemberId, canManage, onNew, onFulfill, onUpload, onDecline, onCancel,
}: RequestColumnProps) {
  const [pick, setPick] = useState<Record<string, string>>({})
  const spaceName = (id: string) => id === c.id ? "this team" : directory.find((d) => d.id === id)?.title ?? "another team"
  const who = (id: string | null) => members.find((m) => m.id === id)?.name ?? "—"
  const incoming = c.requestsIn.filter((r) => r.status === "pending")
  const outgoing = c.requestsOut

  const statusChip = (r: DocumentRequest) => (
    <span className={"req-status is-" + r.status}>
      {r.status === "pending" ? "Waiting" : r.status === "fulfilled" ? "Received" : "Declined"}
    </span>
  )

  return (
    <section className="doc-col is-req">
      <header className="doc-col-head">
        <span className="doc-col-name">Requests</span>
        {incoming.length > 0 && <span className="rs-badge">{incoming.length} to answer</span>}
        <span className="doc-col-count">{incoming.length + outgoing.length}</span>
      </header>

      {incoming.length === 0 && outgoing.length === 0 && (
        <p className="doc-col-empty">No requests yet — ask another team for a document you need.</p>
      )}

      {incoming.length > 0 && (
        <ul className="req-list">
          {incoming.map((r) => (
            <li key={r.id} className="req-item is-in">
              <div className="req-title">{r.title}</div>
              <div className="req-meta">{spaceName(r.fromCaseId)} · {who(r.requestedBy)} · {fmtWhen(r.createdAt)}</div>
              {r.note && <p className="req-note">{r.note}</p>}
              {canManage ? (
                <div className="req-answer">
                  {/* ไม่มีไฟล์ในที่เก็บ = ไม่มีอะไรให้เลือก ชี้ไปอัปโหลดเลยแทนที่จะโชว์ dropdown ว่าง */}
                  {files.length === 0 ? (
                    <p className="rs-fair">Nothing in this space yet — upload the file and it goes straight to them.</p>
                  ) : (
                    <select
                      className="case-project-pick"
                      value={pick[r.id] ?? ""}
                      onChange={(e) => setPick({ ...pick, [r.id]: e.target.value })}
                    >
                      <option value="">Pick a file to send…</option>
                      {files.map((f) => <option key={f.id} value={f.id}>{f.title}{f.version > 1 ? ` (v${f.version})` : ""}</option>)}
                    </select>
                  )}
                  <div className="req-btns">
                    {files.length > 0 && (
                      <button type="button" className="btn btn-primary" disabled={!pick[r.id]} onClick={() => onFulfill(r.id, pick[r.id])}>
                        Send
                      </button>
                    )}
                    <button type="button" className={"btn" + (files.length === 0 ? " btn-primary" : "")} onClick={() => onUpload(r)}>
                      Upload & send
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        const reply = window.prompt(`Decline "${r.title}" — tell them why (optional):`)
                        if (reply !== null) onDecline(r.id, reply)
                      }}
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ) : (
                <p className="rs-fair">Waiting for the owner or an admin to answer.</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {outgoing.length > 0 && (
        <>
          <span className="req-sub">Sent by this team</span>
          <ul className="req-list">
            {outgoing.map((r) => (
              <li key={r.id} className="req-item">
                <div className="req-row">
                  <span className="req-title">{r.title}</span>
                  {statusChip(r)}
                </div>
                <div className="req-meta">
                  to {spaceName(r.toCaseId)} · {fmtWhen(r.createdAt)}
                  {r.status === "fulfilled" && r.fileId && !files.some((f) => f.id === r.fileId) && " · copy deleted"}
                </div>
                {r.status === "declined" && r.reply && <p className="req-note">"{r.reply}"</p>}
                {r.status === "pending" && (canManage || r.requestedBy === currentMemberId) && (
                  <button type="button" className="member-action req-cancel" onClick={() => onCancel(r.id)}>Cancel</button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <button type="button" className="btn doc-col-btn" onClick={onNew}>
        <IconPlus size={14} /> Request document
      </button>
    </section>
  )
}
