import { useEffect, useState } from "react"
import type { NewCase } from "../api"
import type { Project } from "../types"
import { IconClose, IconFolder } from "./Icons"
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

/** สร้าง Document (พื้นที่ทำงาน) ด้วยชื่อ — เหมือน New Project ไฟล์ค่อยเพิ่มข้างใน */
export function NewDocumentModal({ linkable, onClose, onCreate }: Props) {
  const [title, setTitle] = useState("")
  const [docNumber, setDocNumber] = useState("")
  const [agency, setAgency] = useState("")
  const [deadline, setDeadline] = useState("")
  const [projectId, setProjectId] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  const submit = async () => {
    if (!title.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      await onCreate({
        title: title.trim(),
        docNumber: docNumber.trim() || undefined,
        agency: agency.trim() || undefined,
        deadline: deadline || undefined,
        projectId: projectId || undefined,
      })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the document")
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
        aria-label="New document"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <h2 className="modal-title"><IconFolder size={16} /> New document</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} title="Close">
            <IconClose size={16} />
          </button>
        </header>

        <div className="modal-body">
          <label className="field">
            <span className="field-label">Name</span>
            <input
              autoFocus
              className="field-input"
              placeholder="e.g. TOR ระบบจองห้องประชุม"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void submit()}
            />
          </label>

          <div className="field-grid">
            <label className="field">
              <span className="field-label">Doc number (optional)</span>
              <input className="field-input" placeholder="01/1234" value={docNumber} onChange={(e) => setDocNumber(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Deadline (optional)</span>
              <input className="field-input" type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </label>
          </div>

          <label className="field">
            <span className="field-label">Agency (optional)</span>
            <input className="field-input" placeholder="Who sent it" value={agency} onChange={(e) => setAgency(e.target.value)} />
          </label>

          <label className="field">
            <span className="field-label">Project (optional — link later from the panel)</span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">— No project yet —</option>
              {linkable.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.githubRepo ? ` · ${p.githubRepo}` : ""}</option>
              ))}
            </select>
          </label>

          {error && <p className="modal-error">{error}</p>}
        </div>

        <footer className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!title.trim() || busy} onClick={() => void submit()}>
            {busy ? "Creating..." : "Create"}
          </button>
        </footer>
      </div>
    </div>
  )
}
