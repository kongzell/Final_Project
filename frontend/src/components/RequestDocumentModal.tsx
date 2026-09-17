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
  const [toCaseId, setToCaseId] = useState("")
  const [query, setQuery] = useState("")
  // ทีมในองค์กรมีได้หลายสิบ dropdown ธรรมดาเลื่อนหายาก — พิมพ์ค้นแล้วเลือกจากรายการที่กรองแทน
  const q = query.trim().toLowerCase()
  const shown = targets.filter((d) => !q || d.title.toLowerCase().includes(q))
  const chosen = targets.find((d) => d.id === toCaseId) ?? null
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
          <div className="field">
            <span className="field-label">From which team</span>
            {targets.length === 0 ? (
              <span className="field-hint">There is no other document space in the system yet.</span>
            ) : (
              <>
                <input
                  autoFocus
                  className="field-input"
                  placeholder="Type to search teams…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <ul className="team-pick" role="listbox" aria-label="Teams">
                  {shown.length === 0 && <li className="team-pick-none">No team matches "{query}"</li>}
                  {shown.map((d) => (
                    <li key={d.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={d.id === toCaseId}
                        className={"team-pick-row" + (d.id === toCaseId ? " is-on" : "")}
                        onClick={() => setToCaseId(d.id)}
                      >
                        <span className="team-pick-name">{d.title}</span>
                        <span className="team-pick-meta">
                          {d.memberCount} member{d.memberCount === 1 ? "" : "s"}{d.isMember ? " · you are in it" : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <span className="field-hint">{chosen ? <>Sending to <strong>{chosen.title}</strong></> : "Pick a team from the list"}</span>
              </>
            )}
          </div>

          <label className="field">
            <span className="field-label">Which document</span>
            <input
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
