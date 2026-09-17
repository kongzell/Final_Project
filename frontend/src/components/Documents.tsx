import { useEffect, useRef, useState } from "react"
import type { CasePatch } from "../api"
import { caseFileUrl } from "../api"
import type { Case, CaseFile, CaseStatus, FileCategory, Member, Project } from "../types"
import { CASE_STATUSES, currentFiles, FILE_CATEGORIES, formatBytes, todayIso } from "../types"
import { ACCEPT, MAX_BYTES } from "./AddDocumentModal"
import { Avatar } from "./Avatar"
import {
  IconCheck, IconClose, IconDownload, IconFile, IconFolder, IconLink, IconPlus, IconTrash,
  IconUsers,
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

/** เลยกำหนดส่งแล้วแต่ยังไม่ปิดเรื่อง — กติกาเดียวกับงาน */
const isLate = (c: Case) =>
  c.deadline !== null && c.status !== "closed" && c.status !== "delivered" && c.deadline < todayIso()

// ---------- หน้า Documents ----------

type ViewProps = {
  cases: Case[]
  projects: Project[]
  members: Member[]
  currentMemberId: string | null
  selectedId: string | null
  onSelect: (id: string | null) => void
  onAdd: () => void
  onOpenProject: (projectId: string) => void
  detail: DetailActions
}

export function DocumentsView({
  cases, projects, members, currentMemberId, selectedId, onSelect, onAdd, onOpenProject, detail,
}: ViewProps) {
  const selected = cases.find((c) => c.id === selectedId) ?? null
  const projectOf = (c: Case) => projects.find((p) => p.id === c.projectId) ?? null

  return (
    <div className="docs">
      <div className="docs-head">
        <div>
          <h2 className="docs-title"><IconFolder size={18} /> Documents</h2>
          <p className="docs-sub">One card per matter — TOR, contract, minutes and their revisions live together</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={onAdd}>
          <IconPlus size={14} /> Add document
        </button>
      </div>

      {cases.length === 0 ? (
        <div className="docs-empty">
          <IconFolder size={36} />
          <h3>No documents yet</h3>
          <p>Upload a TOR, contract or any official file to start a document. Related files can be added to it afterwards.</p>
          <button type="button" className="btn btn-primary" onClick={onAdd}>
            <IconPlus size={14} /> Add document
          </button>
        </div>
      ) : (
        <div className="docs-grid">
          {cases.map((c) => (
            <CaseCard
              key={c.id}
              c={c}
              project={projectOf(c)}
              members={members}
              onOpen={() => onSelect(c.id)}
            />
          ))}
        </div>
      )}

      {selected && (
        <CaseDetail
          c={selected}
          project={projectOf(selected)}
          projects={projects}
          members={members}
          currentMemberId={currentMemberId}
          onClose={() => onSelect(null)}
          onOpenProject={onOpenProject}
          {...detail}
        />
      )}
    </div>
  )
}

// ---------- การ์ดเรื่อง ----------

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
        <span className="case-files">
          <IconFile size={13} />
          <span>{fileCount} file{fileCount === 1 ? "" : "s"}</span>
        </span>
        {c.deadline && (
          <span className={"case-deadline" + (late ? " is-late" : "")}>
            {late ? "Overdue · " : "Due "}{fmtDate(c.deadline)}
          </span>
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
            ) : (
              <span className="case-progress is-dim">no tasks yet</span>
            )}
          </>
        ) : (
          <span className="case-link is-dim">No project linked</span>
        )}
      </div>
    </button>
  )
}

// ---------- แผงรายละเอียดเรื่อง ----------

export type DetailActions = {
  onUpdate: (id: string, patch: CasePatch) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onAddFile: (id: string, file: File, category: FileCategory, replacesId?: string) => Promise<void>
  onDeleteFile: (id: string, fileId: string) => Promise<void>
  onManageMembers: (id: string) => void
}

type DetailProps = DetailActions & {
  c: Case
  project: Project | null
  projects: Project[]
  members: Member[]
  currentMemberId: string | null
  onClose: () => void
  onOpenProject: (projectId: string) => void
}

function CaseDetail({
  c, project, projects, members, currentMemberId, onClose, onOpenProject,
  onUpdate, onDelete, onAddFile, onDeleteFile, onManageMembers,
}: DetailProps) {
  const isOwner = currentMemberId !== null && c.ownerId === currentMemberId
  const canManage = isOwner || (currentMemberId !== null && c.adminIds.includes(currentMemberId))
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(c.title)
  const [addCat, setAddCat] = useState<FileCategory>("other")
  const [replacing, setReplacing] = useState<CaseFile | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    try {
      await fn()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    }
  }

  // โปรเจคที่ผูกได้: ฉันเป็นเจ้าของ/admin และยังไม่ถูกเรื่องอื่นผูก (ฝั่ง API เช็คซ้ำอีกที)
  const linkable = projects.filter(
    (p) => currentMemberId !== null && (p.ownerId === currentMemberId || p.adminIds.includes(currentMemberId)),
  )

  const uploader = (id: string | null) => members.find((m) => m.id === id)?.name ?? "—"
  const status = CASE_STATUSES.find((s) => s.id === c.status)
  const people = members.filter((m) => c.memberIds.includes(m.id))
  // ฉบับที่ถูกแทนที่แล้วซ่อนไว้ใต้ฉบับใหม่ ดูได้จากบรรทัด "replaces …"
  const current = currentFiles(c)
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
    if (f.size > MAX_BYTES) {
      setError(`${f.name} is ${formatBytes(f.size)} — the limit is 5 MB`)
      return
    }
    const target = replacing
    setReplacing(null)
    void run(() => onAddFile(c.id, f, target ? target.category : addCat, target?.id))
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal modal-wide case-detail"
        role="dialog"
        aria-modal="true"
        aria-label={c.title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div className="case-head-main">
            {renaming ? (
              <input
                autoFocus
                className="field-input case-rename"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && title.trim()) {
                    void run(() => onUpdate(c.id, { title: title.trim() }))
                    setRenaming(false)
                  }
                  if (e.key === "Escape") { setTitle(c.title); setRenaming(false) }
                }}
                onBlur={() => { setTitle(c.title); setRenaming(false) }}
              />
            ) : (
              <h2
                className={"modal-title" + (canManage ? " is-editable" : "")}
                title={canManage ? "Click to rename" : undefined}
                onClick={() => canManage && setRenaming(true)}
              >
                <IconFolder size={16} /> {c.title}
              </h2>
            )}
            <p className="modal-sub">
              {c.docNumber && <>{c.docNumber} · </>}
              {c.agency && <>{c.agency} · </>}
              {c.deadline ? <>Due {fmtDate(c.deadline)}</> : <>No deadline</>}
              {isLate(c) && <span className="case-late-tag">Overdue</span>}
            </p>
          </div>

          <div className="case-head-actions">
            <Menu
              align="right"
              title="Status"
              trigger={() => (
                <span className="case-status is-btn" style={{ color: status?.color }}>
                  <span className="dot" style={{ background: status?.color }} />
                  {status?.label}
                </span>
              )}
            >
              {(close) => (
                <>
                  <MenuLabel>Status</MenuLabel>
                  {CASE_STATUSES.map((s) => (
                    <MenuItem
                      key={s.id}
                      active={s.id === c.status}
                      onClick={() => {
                        if (canManage) void run(() => onUpdate(c.id, { status: s.id as CaseStatus }))
                        close()
                      }}
                    >
                      <span className="dot" style={{ background: s.color }} />
                      <span className="menu-grow">{s.label}</span>
                      {s.id === c.status && <IconCheck size={14} />}
                    </MenuItem>
                  ))}
                </>
              )}
            </Menu>
            <button type="button" className="modal-close" onClick={onClose} title="Close">
              <IconClose size={16} />
            </button>
          </div>
        </header>

        <div className="modal-body">
          {/* ---------- โปรเจคที่ผูก ---------- */}
          <section className="modal-section">
            <h3 className="modal-h3">Project</h3>
            {project ? (
              <div className="case-project">
                <IconLink size={14} />
                <span className="case-project-name">{project.name}</span>
                {project.githubRepo && <span className="case-project-repo">{project.githubRepo}</span>}
                <button type="button" className="btn" onClick={() => onOpenProject(project.id)}>Open board</button>
                {canManage && (
                  <button
                    type="button"
                    className="member-action is-danger"
                    title="Unlink project"
                    onClick={() => void run(() => onUpdate(c.id, { projectId: null }))}
                  >
                    <IconClose size={14} />
                  </button>
                )}
              </div>
            ) : canManage ? (
              <div className="case-project">
                <select
                  className="case-project-pick"
                  defaultValue=""
                  onChange={(e) => {
                    const id = e.target.value
                    if (id) void run(() => onUpdate(c.id, { projectId: id }))
                  }}
                >
                  <option value="">Link a project…</option>
                  {linkable.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{p.githubRepo ? ` · ${p.githubRepo}` : ""}</option>
                  ))}
                </select>
                <span className="modal-hint">Task cards from this document will be created on that board. Nothing is created on GitHub.</span>
              </div>
            ) : (
              <p className="modal-empty">No project linked yet</p>
            )}
          </section>

          {/* ---------- ไฟล์ ---------- */}
          <section className="modal-section">
            <div className="case-section-head">
              <h3 className="modal-h3">Files ({current.length})</h3>
              <div className="case-add-file">
                <select value={addCat} onChange={(e) => setAddCat(e.target.value as FileCategory)}>
                  {FILE_CATEGORIES.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                </select>
                <button
                  type="button"
                  className="btn"
                  onClick={() => { setReplacing(null); fileInput.current?.click() }}
                >
                  <IconPlus size={14} /> Add related document
                </button>
              </div>
            </div>
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              hidden
              onChange={(e) => { pickFile(e.target.files?.[0] ?? null); e.target.value = "" }}
            />

            <ul className="case-file-list">
              {current.map((f) => (
                <li key={f.id} className="case-file">
                  <span className="case-file-cat">{categoryLabel(f.category)}</span>
                  <div className="case-file-main">
                    <a className="case-file-name" href={caseFileUrl(c.id, f.id)} target="_blank" rel="noreferrer">
                      {f.filename}
                    </a>
                    <span className="case-file-meta">
                      {formatBytes(f.size)} · v{f.version} · {uploader(f.uploadedBy)} · {fmtDate(f.uploadedAt)}
                    </span>
                    {history(f).length > 0 && (
                      <span className="case-file-history">
                        replaces {history(f).map((h) => `${h.filename} (v${h.version})`).join(" ← ")}
                      </span>
                    )}
                  </div>
                  <a className="member-action" href={caseFileUrl(c.id, f.id)} download={f.filename} title="Download">
                    <IconDownload size={14} />
                  </a>
                  <button
                    type="button"
                    className="member-action"
                    title="Upload a new version of this file"
                    onClick={() => { setReplacing(f); fileInput.current?.click() }}
                  >
                    New version
                  </button>
                  {isOwner && (
                    <button
                      type="button"
                      className="member-action is-danger"
                      title={current.length === 1 ? "A document needs at least one file" : "Delete file"}
                      disabled={current.length === 1}
                      onClick={() => void run(() => onDeleteFile(c.id, f.id))}
                    >
                      <IconTrash size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* ---------- สมาชิก ---------- */}
          <section className="modal-section">
            <div className="case-section-head">
              <h3 className="modal-h3"><IconUsers size={14} /> Members ({people.length})</h3>
              {canManage && (
                <button type="button" className="btn" onClick={() => onManageMembers(c.id)}>Manage</button>
              )}
            </div>
            <div className="case-members">
              {people.map((m) => (
                <span key={m.id} className="case-member">
                  <Avatar member={m} size={22} />
                  {m.name}
                  {m.id === c.ownerId && <span className="owner-tag">Owner</span>}
                  {c.adminIds.includes(m.id) && <span className="owner-tag is-admin">Admin</span>}
                </span>
              ))}
            </div>
          </section>

          {error && <p className="modal-error">{error}</p>}
        </div>

        <footer className="modal-foot">
          {isOwner && (
            <button
              type="button"
              className="btn case-delete"
              onClick={() => {
                if (window.confirm(`Delete "${c.title}" and all ${c.files.length} file(s) including older versions? Tasks created from it are kept.`)) {
                  void run(async () => { await onDelete(c.id); onClose() })
                }
              }}
            >
              <IconTrash size={14} /> Delete document
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={onClose}>Close</button>
        </footer>
      </div>
    </div>
  )
}
