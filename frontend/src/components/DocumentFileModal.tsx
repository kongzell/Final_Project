import { useEffect, useRef, useState } from "react"
import type { CaseFilePatch, NewCaseFile } from "../api"
import type { Case, CaseFile, CaseStatus, FileCategory, Project } from "../types"
import { CASE_STATUSES, FILE_CATEGORIES, formatBytes } from "../types"
import { ACCEPT, MAX_BYTES } from "./AddDocumentModal"
import { IconClose, IconFile } from "./Icons"
import "./Modal.css"
import "./Documents.css"

type Props = {
  /** ใบที่กำลังแก้ — ไม่ส่งมา = ส่งเอกสารใหม่ (มีช่องเลือกไฟล์) */
  editing?: CaseFile
  /** โปรเจคที่ผูกได้ — ฉันเป็นเจ้าของ/admin */
  linkable: Project[]
  /** ส่งจากบอร์ดโปรเจค: ให้เลือกว่าจะเก็บไว้ที่เก็บไหน (ที่ฉันเป็นสมาชิก) — ไม่ส่งมา = อยู่ในที่เก็บอยู่แล้ว */
  spaces?: Case[]
  /** ที่เก็บที่เลือกไว้ให้ก่อน (ที่มีเอกสารของโปรเจคนี้อยู่แล้ว) */
  defaultSpaceId?: string
  /** ส่งจากบอร์ด: โปรเจคผูกตายตัว เลือกอันอื่นไม่ได้ */
  lockedProject?: Project
  /** เรื่องที่กรอกไว้ให้ก่อน — ตอนอัปโหลดตอบคำขอ ใช้ชื่อเอกสารที่เขาขอ */
  defaultTitle?: string
  submitLabel?: string
  onClose: () => void
  onSubmit: (input: NewCaseFile, spaceId: string) => Promise<void>
  onSave: (patch: CaseFilePatch) => Promise<void>
}

/** ฟอร์มข้อมูลเอกสาร 1 ใบ — ใช้ทั้งตอนส่งใหม่ (มีไฟล์) และตอนแก้ (ไม่มีไฟล์)
 *  เรื่อง/เลขที่/หน่วยงาน/กำหนดส่ง/โปรเจค เป็นของใบนี้ ไม่ใช่ของ Document */
export function DocumentFileModal({
  editing, linkable, spaces, defaultSpaceId, lockedProject, defaultTitle, submitLabel, onClose, onSubmit, onSave,
}: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState(editing?.title ?? defaultTitle ?? "")
  const [category, setCategory] = useState<FileCategory>(editing?.category ?? "tor")
  const [status, setStatus] = useState<CaseStatus>(editing?.status ?? "received")
  const [docNumber, setDocNumber] = useState(editing?.docNumber ?? "")
  const [agency, setAgency] = useState(editing?.agency ?? "")
  const [deadline, setDeadline] = useState(editing?.deadline ?? "")
  const [projectId, setProjectId] = useState(lockedProject?.id ?? editing?.projectId ?? "")
  const [spaceId, setSpaceId] = useState(defaultSpaceId ?? spaces?.[0]?.id ?? "")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const titleHint = file ? file.name.replace(/\.[^.]+$/, "") : ""

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  const pick = (f: File | null) => {
    setError(null)
    if (f && f.size > MAX_BYTES) { setError(`${f.name} is ${formatBytes(f.size)} — the limit is 5 MB`); return }
    setFile(f)
  }

  const stuckProject = editing?.projectId && !linkable.some((p) => p.id === editing.projectId)

  const canSubmit = editing ? title.trim().length > 0 : file !== null && (!spaces || spaceId !== "")

  const submit = async () => {
    if (!canSubmit || busy) return
    setBusy(true)
    setError(null)
    try {
      if (editing) {
        const patch: CaseFilePatch = {}
        if (title.trim() !== editing.title) patch.title = title.trim()
        if (category !== editing.category) patch.category = category
        if (status !== editing.status) patch.status = status
        if ((docNumber.trim() || null) !== editing.docNumber) patch.docNumber = docNumber.trim() || null
        if ((agency.trim() || null) !== editing.agency) patch.agency = agency.trim() || null
        if ((deadline || null) !== editing.deadline) patch.deadline = deadline || null
        if ((projectId || null) !== editing.projectId) patch.projectId = projectId || null
        if (Object.keys(patch).length > 0) await onSave(patch)
      } else {
        await onSubmit({
          file: file!,
          category,
          title: title.trim() || undefined,
          docNumber: docNumber.trim() || undefined,
          agency: agency.trim() || undefined,
          deadline: deadline || undefined,
          projectId: projectId || undefined,
        }, spaceId)
      }
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={editing ? "Edit document" : "Add document"}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <h2 className="modal-title"><IconFile size={16} /> {editing ? "Edit document" : "Add document"}</h2>
            {editing && <p className="modal-sub">{editing.filename}{editing.version > 1 ? ` · v${editing.version}` : ""}</p>}
          </div>
          <button type="button" className="modal-close" onClick={onClose} title="Close">
            <IconClose size={16} />
          </button>
        </header>

        <div className="modal-body">
          {spaces && (
            <label className="field">
              <span className="field-label">Keep it in</span>
              {spaces.length === 0 ? (
                <span className="field-hint">You are not in any document space yet — create one on the Documents page first.</span>
              ) : (
                <select value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
                  {spaces.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              )}
            </label>
          )}
          {!editing && (
            <div
              className={"dropzone" + (file ? " has-file" : "")}
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0] ?? null) }}
            >
              <input ref={fileInput} type="file" accept={ACCEPT} hidden onChange={(e) => pick(e.target.files?.[0] ?? null)} />
              {file ? (
                <>
                  <IconFile size={18} />
                  <span className="dropzone-name">{file.name}</span>
                  <span className="dropzone-size">{formatBytes(file.size)}</span>
                </>
              ) : (
                <>
                  <IconFile size={22} />
                  <span>Drop a file here or click to choose</span>
                  <span className="dropzone-hint">PDF, Word, Excel, images, text · up to 5 MB</span>
                </>
              )}
            </div>
          )}

          <label className="field">
            <span className="field-label">Subject (เรื่อง)</span>
            <input
              autoFocus={!!editing}
              className="field-input"
              placeholder={titleHint || "e.g. จ้างพัฒนาระบบจองห้องประชุม"}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void submit()}
            />
          </label>

          <div className="field-grid">
            <label className="field">
              <span className="field-label">Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value as FileCategory)}>
                {FILE_CATEGORIES.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
              </select>
            </label>
            {editing ? (
              <label className="field">
                <span className="field-label">Status</span>
                <select value={status} onChange={(e) => setStatus(e.target.value as CaseStatus)}>
                  {CASE_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </label>
            ) : (
              <label className="field">
                <span className="field-label">Deadline (optional)</span>
                <input className="field-input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              </label>
            )}
          </div>

          <div className="field-grid">
            <label className="field">
              <span className="field-label">Doc number (optional)</span>
              <input className="field-input" placeholder="01/1234" value={docNumber} onChange={(e) => setDocNumber(e.target.value)} />
            </label>
            {editing ? (
              <label className="field">
                <span className="field-label">Deadline (optional)</span>
                <input className="field-input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              </label>
            ) : (
              <label className="field">
                <span className="field-label">Agency (optional)</span>
                <input className="field-input" placeholder="Who sent it" value={agency} onChange={(e) => setAgency(e.target.value)} />
              </label>
            )}
          </div>

          {editing && (
            <label className="field">
              <span className="field-label">Agency (optional)</span>
              <input className="field-input" placeholder="Who sent it" value={agency} onChange={(e) => setAgency(e.target.value)} />
            </label>
          )}

          {lockedProject ? (
            <p className="field-hint">Linked to <strong>{lockedProject.name}</strong> — it will show up on that project's document list and in the space above.</p>
          ) : (
            <label className="field">
              <span className="field-label">Project (optional)</span>
              <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">— Not related to a project —</option>
                {stuckProject && <option value={editing!.projectId!}>(linked by someone else)</option>}
                {linkable.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}{p.githubRepo ? ` · ${p.githubRepo}` : ""}</option>
                ))}
              </select>
            </label>
          )}

          {error && <p className="modal-error">{error}</p>}
        </div>

        <footer className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!canSubmit || busy} onClick={() => void submit()}>
            {busy ? (editing ? "Saving..." : "Uploading...") : editing ? "Save" : submitLabel ?? "Add"}
          </button>
        </footer>
      </div>
    </div>
  )
}
