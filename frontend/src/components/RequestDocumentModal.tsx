import { useEffect, useState } from "react"
import type { NewDocumentRequest } from "../api"
import type { Case, CaseDirectoryEntry, Member, Project } from "../types"
import { IconClose, IconFolder } from "./Icons"
import "./Modal.css"
import "./Documents.css"

type Props = {
  /** ที่เก็บที่ยื่นคำขอ — ขึ้นบนสุดในชื่อ "This team" ขอจากทีมตัวเองก็ได้ */
  fromCaseId?: string
  directory: CaseDirectoryEntry[]
  /** ไว้แปลง ownerId → ชื่อเจ้าของ จะได้รู้ว่าพื้นที่นั้นเป็นทีมของใคร */
  members: Member[]
  /** ยื่นจากบอร์ดโปรเจค: เลือกว่าจะยื่นในนามที่เก็บไหน (ที่ฉันเป็นสมาชิก) — เอกสารที่ได้จะไปอยู่ที่นั่น */
  spaces?: Case[]
  defaultSpaceId?: string
  /** ยื่นจากบอร์ด: เอกสารที่ได้รับผูกโปรเจคนี้ให้เลย */
  lockedProject?: Project
  onClose: () => void
  onSubmit: (input: NewDocumentRequest, fromCaseId: string) => Promise<void>
}

/** ขอเอกสารจากที่เก็บของทีมอื่น (หรือทีมตัวเอง) — เห็นแค่ชื่อทีมกับเจ้าของ ไม่เห็นไฟล์ข้างใน ผู้ดูแลฝั่งนั้นเป็นคนเลือกส่ง */
export function RequestDocumentModal({
  fromCaseId: fixedFrom, directory, members, spaces, defaultSpaceId, lockedProject, onClose, onSubmit,
}: Props) {
  const [spaceId, setSpaceId] = useState(fixedFrom ?? defaultSpaceId ?? spaces?.[0]?.id ?? "")
  const fromCaseId = fixedFrom ?? spaceId
  const targets = [...directory].sort((a, b) =>
    Number(b.id === fromCaseId) - Number(a.id === fromCaseId) || a.title.localeCompare(b.title, "th"),
  )
  const ownerName = (id: string | null) => members.find((m) => m.id === id)?.name ?? null
  const [toCaseId, setToCaseId] = useState("")
  const [query, setQuery] = useState("")
  const q = query.trim().toLowerCase()
  const shown = targets.filter((d) => !q || d.title.toLowerCase().includes(q) || (ownerName(d.ownerId) ?? "").toLowerCase().includes(q))
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

  const canSubmit = toCaseId !== "" && title.trim().length > 0 && fromCaseId !== ""

  const submit = async () => {
    if (!canSubmit || busy) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit({ toCaseId, title: title.trim(), note: note.trim() || undefined, projectId: lockedProject?.id }, fromCaseId)
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
            <p className="modal-sub">Ask a team for a document — another team, or your own to have a teammate upload it. Their owner or admin picks the file and it lands here.</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} title="Close">
            <IconClose size={16} />
          </button>
        </header>

        <div className="modal-body">
          {spaces && (
            <label className="field">
              <span className="field-label">Ask on behalf of</span>
              {spaces.length === 0 ? (
                <span className="field-hint">You are not in any document space yet — create one on the Documents page first.</span>
              ) : (
                <select value={spaceId} onChange={(e) => setSpaceId(e.target.value)}>
                  {spaces.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              )}
              {lockedProject && (
                <span className="field-hint">The document you receive lands there and is linked to <strong>{lockedProject.name}</strong>.</span>
              )}
            </label>
          )}
          <div className="field">
            <span className="field-label">From which team</span>
            {targets.length === 0 ? (
              <span className="field-hint">There is no other document space in the system yet.</span>
            ) : (
              <>
                <input
                  autoFocus
                  className="field-input"
                  placeholder="Search by team or owner name…"
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
                        <span className="team-pick-main">
                          <span className="team-pick-name">
                            {d.title}
                            {d.id === fromCaseId && <span className="team-pick-tag">This team</span>}
                          </span>
                          <span className="team-pick-owner">
                            {ownerName(d.ownerId) ? `Owner: ${ownerName(d.ownerId)}` : "No owner"}
                          </span>
                        </span>
                        <span className="team-pick-meta">
                          {d.memberCount} member{d.memberCount === 1 ? "" : "s"}{d.isMember && d.id !== fromCaseId ? " · you are in it" : ""}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
                <span className="field-hint">
                  {chosen
                    ? chosen.id === fromCaseId
                      ? <>Asking <strong>your own team</strong> — the owner or an admin will upload or pick the file</>
                      : <>Sending to <strong>{chosen.title}</strong>{ownerName(chosen.ownerId) ? ` (${ownerName(chosen.ownerId)})` : ""}</>
                    : ""}
                </span>
              </>
            )}
          </div>

          <label className="field">
            <span className="field-label">Which document</span>
            <input
              className="field-input"
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
