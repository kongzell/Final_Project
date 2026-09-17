import { useEffect, useState } from "react"
import type { NewDocumentRequest } from "../api"
import type { CaseDirectoryEntry } from "../types"
import { IconClose, IconFolder } from "./Icons"
import "./Modal.css"
import "./Documents.css"

type Props = {
  /** ที่เก็บที่ยื่นคำขอ — ตัดออกจากรายการปลายทาง */
  fromCaseId: string
  directory: CaseDirectoryEntry[]
  onClose: () => void
  onSubmit: (input: NewDocumentRequest) => Promise<void>
}

/** ขอเอกสารจากที่เก็บของทีมอื่น — เห็นแค่ชื่อทีม ไม่เห็นไฟล์ข้างใน ผู้ดูแลฝั่งนั้นเป็นคนเลือกส่ง */
export function RequestDocumentModal({ fromCaseId, directory, onClose, onSubmit }: Props) {
  const targets = directory.filter((d) => d.id !== fromCaseId)
  const [toCaseId, setToCaseId] = useState(targets[0]?.id ?? "")
  const [title, setTitle] = useState("")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  const canSubmit = toCaseId !== "" && title.trim().length > 0

  const submit = async () => {
    if (!canSubmit || busy) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit({ toCaseId, title: title.trim(), note: note.trim() || undefined })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the request")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Request a document" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <h2 className="modal-title"><IconFolder size={16} /> Request a document</h2>
            <p className="modal-sub">Ask another team for a document. Their owner or admin picks the file and it lands here.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} title="Close">
            <IconClose size={16} />
          </button>
        </header>

        <div className="modal-body">
          <label className="field">
            <span className="field-label">From which team</span>
            {targets.length === 0 ? (
              <span className="field-hint">There is no other document space in the system yet.</span>
            ) : (
              <select value={toCaseId} onChange={(e) => setToCaseId(e.target.value)}>
                {targets.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title} · {d.memberCount} member{d.memberCount === 1 ? "" : "s"}{d.isMember ? " · you are in it" : ""}
                  </option>
                ))}
              </select>
            )}
          </label>

          <label className="field">
            <span className="field-label">Which document</span>
            <input
              autoFocus
              className="field-input"
              placeholder="e.g. สัญญาจ้างระบบจองห้อง ฉบับลงนาม"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void submit()}
            />
          </label>

          <label className="field">
            <span className="field-label">Note (optional)</span>
            <textarea
              className="field-input"
              rows={3}
              placeholder="Why you need it, which version, by when…"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          {error && <p className="modal-error">{error}</p>}
        </div>

        <footer className="modal-foot">
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={!canSubmit || busy} onClick={() => void submit()}>
            {busy ? "Sending..." : "Send request"}
          </button>
        </footer>
      </div>
    </div>
  )
}
