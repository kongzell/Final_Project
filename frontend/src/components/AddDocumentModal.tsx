import { useEffect, useState } from "react"
import type { NewCase } from "../api"
import { IconClose, IconFolder } from "./Icons"
import "./Modal.css"
import "./Documents.css"

/** ตรงกับ ALLOWED_TYPES ฝั่ง API — เช็คก่อนส่งจะได้ไม่ต้องรออัปโหลดเสร็จแล้วค่อยรู้ว่าไม่รับ */
export const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.txt"
export const MAX_BYTES = 5 * 1024 * 1024

type Props = {
  onClose: () => void
  onCreate: (input: NewCase) => Promise<void>
}

/** สร้าง Document (ที่เก็บเอกสารกลางของทีม) ด้วยชื่อ — เหมือน New Project เอกสารค่อยส่งเข้าข้างใน */
export function NewDocumentModal({ onClose, onCreate }: Props) {
  const [title, setTitle] = useState("")
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
      await onCreate({ title: title.trim() })
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
            <p className="modal-sub">One shared space for a team — every document they receive goes in here</p>
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
              placeholder="e.g. เอกสารเข้า ฝ่ายไอที"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void submit()}
            />
          </label>
          <p className="field-hint">Subject, doc number, deadline and project are set on each document you add, not here.</p>

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
