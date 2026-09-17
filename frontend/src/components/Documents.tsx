import { useRef, useState } from "react"
import type { CasePatch } from "../api"
import { caseFileUrl } from "../api"
import type { Case, CaseFile, CaseStatus, FileCategory, Member, Project } from "../types"
import { CASE_STATUSES, currentFiles, FILE_CATEGORIES, formatBytes, todayIso } from "../types"
import { ACCEPT, MAX_BYTES } from "./AddDocumentModal"
import { Avatar } from "./Avatar"
import {
  IconCheck, IconDownload, IconFile, IconFolder, IconLink, IconPlus, IconSparkle, IconTrash,
} from "./Icons"
import { Menu, MenuItem, MenuLabel } from "./Menu"
import "./Documents.css"

const fmtDate = (iso: string) =>
  new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
  })

const categoryLabel = (id: FileCategory) => FILE_CATEGORIES.find((c) => c.id === id)?.label ?? id

/** เลยกำหนดส่งแล้วแต่ยังไม่ปิด — กติกาเดียวกับงาน */
const isLate = (c: Case) =>
  c.deadline !== null && c.status !== "closed" && c.status !== "delivered" && c.deadline < todayIso()

/** AI อ่านได้เฉพาะ PDF/รูป/ข้อความ — Word/Excel ต้องแปลงก่อน */
const aiReadable = (f: Pick<CaseFile, "contentType">) =>
  ["application/pdf", "image/png", "image/jpeg", "text/plain"].includes(f.contentType)

export type DocumentActions = {
  onUpdate: (id: string, patch: CasePatch) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onAddFile: (id: string, file: File, category: FileCategory, replacesId?: string) => Promise<void>
  onDeleteFile: (id: string, fileId: string) => Promise<void>
  onManageMembers: (id: string) => void
  onBreakdown: (c: Case, file: CaseFile) => void
  /** ให้ AI อ่านไฟล์แล้วเติมเลขที่/หน่วยงาน/กำหนดส่งที่ยังว่างในแผงขวา — คืนข้อความบอกว่าเติมอะไร */
  onExtract: (c: Case, file: CaseFile) => Promise<string>
}

// ---------- หน้า Documents: รายการ workspace หรือ workspace ที่เปิดอยู่ ----------

type ViewProps = DocumentActions & {
  cases: Case[]
  projects: Project[]
  members: Member[]
  currentMemberId: string | null
  selected: Case | null
  onSelect: (id: string | null) => void
  onNew: () => void
  onOpenProject: (projectId: string) => void
}

export function DocumentsView(props: ViewProps) {
  const { cases, projects, members, selected, onSelect, onNew } = props
  const projectOf = (c: Case) => projects.find((p) => p.id === c.projectId) ?? null

  if (selected) return <Workspace key={selected.id} {...props} c={selected} project={projectOf(selected)} />

  return (
    <div className="docs">
      <div className="docs-head">
        <div>
          <h2 className="docs-title"><IconFolder size={18} /> Documents</h2>
          <p className="docs-sub">One workspace per matter — keep its TOR, contract, minutes and revisions together</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={onNew}>
          <IconPlus size={14} /> New document
        </button>
      </div>

      {cases.length === 0 ? (
        <div className="docs-empty">
          <IconFolder size={36} />
          <h3>No documents yet</h3>
          <p>Create a document workspace, then add its files. Link it to a project when you want AI to turn a TOR into task cards.</p>
          <button type="button" className="btn btn-primary" onClick={onNew}>
            <IconPlus size={14} /> New document
          </button>
        </div>
      ) : (
        <div className="docs-grid">
          {cases.map((c) => (
            <CaseCard key={c.id} c={c} project={projectOf(c)} members={members} onOpen={() => onSelect(c.id)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------- การ์ด workspace (หน้ารวม) ----------

function CaseCard({
  c, project, members, onOpen,
}: { c: Case; project: Project | null; members: Member[]; onOpen: () => void }) {
  const status = CASE_STATUSES.find((s) => s.id === c.status)
  const people = members.filter((m) => c.memberIds.includes(m.id))
  const done = project ? project.tasks.filter((t) => t.parentId === null && t.status === "complete").length : 0
  const total = project ? project.tasks.filter((t) => t.parentId === null).length : 0
  const late = isLate(c)
  const fileCount = currentFiles(c).length

  return (
    <button type="button" className={"case-card" + (late ? " is-late" : "")} onClick={onOpen}>
      <div className="case-top">
        <IconFolder size={18} className="case-glyph" />
        <span className="case-status" style={{ color: status?.color }}>
          <span className="dot" style={{ background: status?.color }} />
          {status?.label}
        </span>
      </div>
      <h3 className="case-title">{c.title}</h3>
      {(c.docNumber || c.agency) && (
        <p className="case-meta">
          {c.docNumber && <span>{c.docNumber}</span>}
          {c.docNumber && c.agency && <span className="case-dot">·</span>}
          {c.agency && <span>{c.agency}</span>}
        </p>
      )}
      <div className="case-row">
        <span className="case-files"><IconFile size={13} /><span>{fileCount} file{fileCount === 1 ? "" : "s"}</span></span>
        {c.deadline && (
          <span className={"case-deadline" + (late ? " is-late" : "")}>{late ? "Overdue · " : "Due "}{fmtDate(c.deadline)}</span>
        )}
        <span className="case-people">
          {people.slice(0, 3).map((m) => <Avatar key={m.id} member={m} size={20} />)}
          {people.length > 3 && <span className="case-more">+{people.length - 3}</span>}
        </span>
      </div>
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
        ) : <span className="case-link is-dim">No project linked</span>}
      </div>
    </button>
  )
}

// ---------- workspace ที่เปิดอยู่: หัว + การ์ดไฟล์ ----------

type WorkspaceProps = ViewProps & { c: Case; project: Project | null }

function Workspace({
  c, project, members, currentMemberId, onUpdate, onAddFile, onDeleteFile, onBreakdown, onExtract,
}: WorkspaceProps) {
  const isOwner = currentMemberId !== null && c.ownerId === currentMemberId
  const canManage = isOwner || (currentMemberId !== null && c.adminIds.includes(currentMemberId))
  const canBreakdown =
    project !== null && currentMemberId !== null &&
    (project.ownerId === currentMemberId || project.adminIds.includes(currentMemberId))
  const breakdownHint = project === null
    ? "Link a project in the panel on the right first"
    : !canBreakdown ? "Only the owner or an admin of the linked project can create tasks"
    : "Let AI read this file and propose task cards"

  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [extracting, setExtracting] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  // ชื่อในช่องแก้ — คัดลอกจากของจริงตอนเริ่มแก้ทีเดียว (key ของ Workspace รีเซ็ต state ตอนสลับเรื่องอยู่แล้ว)
  const [title, setTitle] = useState("")
  const [addCat, setAddCat] = useState<FileCategory>("tor")
  const [replacing, setReplacing] = useState<CaseFile | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const startRename = () => { setTitle(c.title); setRenaming(true) }

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong") }
  }

  const uploader = (id: string | null) => members.find((m) => m.id === id)?.name ?? "—"
  const files = currentFiles(c)
  const history = (f: CaseFile): CaseFile[] => {
    const out: CaseFile[] = []
    let cur: CaseFile | undefined = f
    while (cur?.replacesId) {
      cur = c.files.find((x) => x.id === cur!.replacesId)
      if (cur) out.push(cur)
    }
    return out
  }

  const pickFile = (f: File | null) => {
    if (!f) return
    if (f.size > MAX_BYTES) { setError(`${f.name} is ${formatBytes(f.size)} — the limit is 5 MB`); return }
    const target = replacing
    setReplacing(null)
    void run(() => onAddFile(c.id, f, target ? target.category : addCat, target?.id))
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
            {files.length} file{files.length === 1 ? "" : "s"}
            {c.docNumber && <> · {c.docNumber}</>}
            {c.agency && <> · {c.agency}</>}
            {c.deadline && <> · Due {fmtDate(c.deadline)}</>}
            {isLate(c) && <span className="case-late-tag">Overdue</span>}
          </p>
        </div>

        <div className="ws-add">
          <select value={addCat} onChange={(e) => setAddCat(e.target.value as FileCategory)} title="Category of the file you are about to add">
            {FILE_CATEGORIES.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
          <button type="button" className="btn btn-primary" onClick={() => { setReplacing(null); fileInput.current?.click() }}>
            <IconPlus size={14} /> Add document
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => { pickFile(e.target.files?.[0] ?? null); e.target.value = "" }}
        />
      </div>

      {error && <p className="modal-error">{error}</p>}
      {note && <p className="ws-note">{note}</p>}

      {files.length === 0 ? (
        <div className="docs-empty">
          <IconFile size={36} />
          <h3>No files in this document yet</h3>
          <p>Add the TOR, contract, minutes or any file that belongs to this matter — related to a project or not.</p>
        </div>
      ) : (
        <div className="docs-grid">
          {files.map((f) => {
            const older = history(f)
            const readable = aiReadable(f)
            return (
              <article key={f.id} className="file-card">
                <div className="file-card-top">
                  <span className="case-file-cat">{categoryLabel(f.category)}</span>
                  {f.version > 1 && <span className="file-ver">v{f.version}</span>}
                </div>
                <a className="file-card-name" href={caseFileUrl(c.id, f.id)} target="_blank" rel="noreferrer" title="Open">
                  <IconFile size={15} /> {f.filename}
                </a>
                <p className="file-card-meta">
                  {formatBytes(f.size)} · {uploader(f.uploadedBy)} · {fmtDate(f.uploadedAt)}
                </p>
                {older.length > 0 && (
                  <p className="file-card-history">replaces {older.map((h) => `${h.filename} (v${h.version})`).join(" ← ")}</p>
                )}
                <div className="file-card-actions">
                  <button
                    type="button"
                    className="member-action is-ai"
                    title={readable ? breakdownHint : "AI can read PDF, images and text — export this to PDF first"}
                    disabled={!canBreakdown || !readable}
                    onClick={() => onBreakdown(c, f)}
                  >
                    <IconSparkle size={13} /> Create task cards
                  </button>
                  {canManage && (
                    <button
                      type="button"
                      className="member-action"
                      title={readable ? "AI reads doc number, agency and deadline from this file into the panel (fills only empty fields · 1 Gemini request)" : "AI can read PDF, images and text only"}
                      disabled={!readable || extracting === f.id}
                      onClick={() => {
                        setExtracting(f.id)
                        setNote(null)
                        void run(async () => setNote(await onExtract(c, f))).finally(() => setExtracting(null))
                      }}
                    >
                      {extracting === f.id ? "Reading..." : "Fill details"}
                    </button>
                  )}
                  <a className="member-action" href={caseFileUrl(c.id, f.id)} download={f.filename} title="Download">
                    <IconDownload size={14} />
                  </a>
                  <button type="button" className="member-action" title="Upload a new version of this file" onClick={() => { setReplacing(f); fileInput.current?.click() }}>
                    New version
                  </button>
                  {isOwner && (
                    <button
                      type="button"
                      className="member-action is-danger"
                      title="Delete file"
                      onClick={() => { if (window.confirm(`Delete ${f.filename}?`)) void run(() => onDeleteFile(c.id, f.id)) }}
                    >
                      <IconTrash size={14} />
                    </button>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ---------- แผงขวาของ workspace (เหมือน Project team) ----------

type PanelProps = {
  c: Case
  project: Project | null
  projects: Project[]
  members: Member[]
  currentMemberId: string | null
  onUpdate: (id: string, patch: CasePatch) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onManageMembers: (id: string) => void
  onOpenProject: (projectId: string) => void
  onClose: () => void
}

export function DocumentPanel({
  c, project, projects, members, currentMemberId, onUpdate, onDelete, onManageMembers, onOpenProject, onClose,
}: PanelProps) {
  const isOwner = currentMemberId !== null && c.ownerId === currentMemberId
  const canManage = isOwner || (currentMemberId !== null && c.adminIds.includes(currentMemberId))
  const status = CASE_STATUSES.find((s) => s.id === c.status)
  const people = members.filter((m) => c.memberIds.includes(m.id))
  const [error, setError] = useState<string | null>(null)
  const run = async (fn: () => Promise<void>) => {
    setError(null)
    try { await fn() } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong") }
  }
  const linkable = projects.filter(
    (p) => currentMemberId !== null && (p.ownerId === currentMemberId || p.adminIds.includes(currentMemberId)),
  )

  /** ช่องแก้ข้อความสั้น ๆ — บันทึกตอน blur/Enter เฉพาะเมื่อค่าเปลี่ยน */
  const field = (label: string, value: string | null, key: "docNumber" | "agency" | "deadline", type = "text") => (
    <label className="ws-field">
      <span className="ws-field-label">{label}</span>
      {canManage ? (
        <input
          className="field-input"
          type={type}
          defaultValue={value ?? ""}
          key={`${c.id}-${key}-${value ?? ""}`}
          onBlur={(e) => {
            const v = e.target.value.trim() || null
            if (v !== value) void run(() => onUpdate(c.id, { [key]: v }))
          }}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }}
        />
      ) : (
        <span className="ws-field-value">{value || "—"}</span>
      )}
    </label>
  )

  return (
    <aside className="rs">
      <section className="rs-panel">
        <header className="rs-head">
          <span className="rs-title">Details</span>
          <Menu
            align="right"
            title="Status"
            trigger={() => (
              <span className="case-status is-btn" style={{ color: status?.color }}>
                <span className="dot" style={{ background: status?.color }} />{status?.label}
              </span>
            )}
          >
            {(close) => (
              <>
                <MenuLabel>Status</MenuLabel>
                {CASE_STATUSES.map((s) => (
                  <MenuItem key={s.id} active={s.id === c.status} onClick={() => { if (canManage) void run(() => onUpdate(c.id, { status: s.id as CaseStatus })); close() }}>
                    <span className="dot" style={{ background: s.color }} />
                    <span className="menu-grow">{s.label}</span>
                    {s.id === c.status && <IconCheck size={14} />}
                  </MenuItem>
                ))}
              </>
            )}
          </Menu>
        </header>
        {field("Doc number", c.docNumber, "docNumber")}
        {field("Agency", c.agency, "agency")}
        {field("Deadline", c.deadline, "deadline", "date")}
      </section>

      <section className="rs-panel">
        <header className="rs-head"><span className="rs-title">Project</span></header>
        {project ? (
          <div className="ws-project">
            <span className="case-project-name"><IconLink size={13} /> {project.name}</span>
            {project.githubRepo && <span className="case-project-repo">{project.githubRepo}</span>}
            <div className="ws-project-actions">
              <button type="button" className="btn" onClick={() => onOpenProject(project.id)}>Open board</button>
              {canManage && (
                <button type="button" className="btn" onClick={() => void run(() => onUpdate(c.id, { projectId: null }))}>Unlink</button>
              )}
            </div>
          </div>
        ) : canManage ? (
          <>
            <select
              className="case-project-pick"
              defaultValue=""
              onChange={(e) => { const id = e.target.value; if (id) void run(() => onUpdate(c.id, { projectId: id })) }}
            >
              <option value="">Link a project…</option>
              {linkable.map((p) => <option key={p.id} value={p.id}>{p.name}{p.githubRepo ? ` · ${p.githubRepo}` : ""}</option>)}
            </select>
            <p className="rs-fair">Task cards created from these files land on that board. Nothing is created on GitHub.</p>
          </>
        ) : <p className="rs-empty">No project linked</p>}
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
      </section>

      {error && <p className="modal-error">{error}</p>}

      {isOwner && (
        <button
          type="button"
          className="btn case-delete ws-delete"
          onClick={() => {
            if (window.confirm(`Delete "${c.title}" and all ${c.files.length} file(s) including older versions? Tasks created from it are kept.`)) {
              void run(async () => { await onDelete(c.id); onClose() })
            }
          }}
        >
          <IconTrash size={14} /> Delete document
        </button>
      )}
    </aside>
  )
}
