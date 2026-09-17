import { useEffect, useRef, useState } from "react"
import type { NewCase } from "../api"
import type { FileCategory, Project } from "../types"
import { FILE_CATEGORIES, formatBytes } from "../types"
import { IconClose, IconUpload } from "./Icons"
import "./Modal.css"
import "./Documents.css"

/** ตรงกับ ALLOWED_TYPES ฝั่ง API — เช็คก่อนส่งจะได้ไม่ต้องรออัปโหลดเสร็จแล้วค่อยรู้ว่าไม่รับ */
export const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.txt"
export const MAX_BYTES = 5 * 1024 * 1024

type Props = {
  /** โปรเจคที่ผูกได้ — เฉพาะที่ฉันเป็นเจ้าของ/admin และยังไม่ถูกเรื่องอื่นผูก */
  linkable: Project[]
  onClose: () => void
  onCreate: (input: NewCase) => Promise<void>
}

/** อัปโหลดไฟล์แรก = สร้างเรื่องใหม่ — ชื่อเรื่องเติมจากชื่อไฟล์ให้ก่อน แก้ได้ */
export function AddDocumentModal({ linkable, onClose, onCreate }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [category, setCategory] = useState<FileCategory>("tor")
  const [title, setTitle] = useState("")
  const [docNumber, setDocNumber] = useState("")
  const [agency, setAgency] = useState("")
  const [deadline, setDeadline] = useState("")
  const [projectId, setProjectId] = useState("")
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  const pick = (f: File | null) => {
    setError(null)
    if (!f) return
    if (f.size > MAX_BYTES) {
      setError(`${f.name} is ${formatBytes(f.size)} — the limit is 5 MB`)
      return
    }
    setFile(f)
    // ชื่อเรื่องตั้งต้นจากชื่อไฟล์ตัดนามสกุล — ถ้าผู้ใช้พิมพ์เองไว้แล้วไม่ทับ
    if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ""))
  }

  const submit = async () => {
    if (!file || busy) return
    setBusy(true)
    setError(null)
    try {
      await onCreate({
        file,
        category,
        title: title.trim() || undefined,
        docNumber: docNumber.trim() || undefined,
        agency: agency.trim() || undefined,
        deadline: deadline || undefined,
        projectId: projectId || undefined,
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed")
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
        aria-label="Add document"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <h2 className="modal-title">Add document</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} title="Close">
            <IconClose size={16} />
          </button>
        </header>

        <div className="modal-body">
          <button
            type="button"
            className={"doc-drop" + (dragging ? " is-over" : "") + (file ? " has-file" : "")}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              pick(e.dataTransfer.files[0] ?? null)
            }}
          >
            <IconUpload size={22} />
            {file ? (
              <span className="doc-drop-name">
                {file.name} <span className="doc-drop-size">{formatBytes(file.size)}</span>
              </span>
            ) : (
              <span>Drop a file here or click to choose · PDF, Word, Excel, image · up to 5 MB</span>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />

          <div className="field-grid">
            <label className="field">
              <span className="field-label">Category</span>
              <select value={category} onChange={(e) => setCategory(e.target.value as FileCategory)}>
                {FILE_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Deadline (optional)</span>
              <input
                className="field-input"
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </label>
          </div>

          <label className="field">
            <span className="field-label">Title</span>
            <input
              className="field-input"
              placeholder="Filled in from the file name"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>

          <div className="field-grid">
            <label className="field">
              <span className="field-label">Doc number (optional)</span>
              <input
                className="field-input"
                placeholder="01/1234"
                value={docNumber}
                onChange={(e) => setDocNumber(e.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">Agency (optional)</span>
              <input
                className="field-input"
                placeholder="Who sent it"
                value={agency}
                onChange={(e) => setAgency(e.target.value)}
              />
            </label>
          </div>

          <label className="field">
            <span className="field-label">Project (optional — link later from the document)</span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">— No project yet —</option>
              {linkable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.githubRepo ? ` · ${p.githubRepo}` : ""}
                </option>
              ))}
            </select>
          </label>

          {error && <p className="modal-error">{error}</p>}
        </div>

        <footer className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!file || busy}
            onClick={() => void submit()}
          >
            {busy ? "Uploading..." : "Create"}
          </button>
        </footer>
      </div>
    </div>
  )
}
