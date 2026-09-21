import { useEffect, useState } from "react"
import { importRepoCollaborators } from "../api"
import type { Member } from "../types"
import { Avatar } from "./Avatar"
import { IconClose, IconPlus, IconTrash } from "./Icons"
import "./Modal.css"

type Props = {
  projectName: string
  /** repo ที่โปรเจคนี้ผูกอยู่ เช่น "kongzell/...3" — null เมื่อสร้างโปรเจคเปล่า */
  githubRepo: string | null
  /** พนักงานที่อยู่ในโปรเจคนี้แล้ว */
  members: Member[]
  /** เจ้าของโปรเจค — ถอดออกไม่ได้ */
  ownerId: string | null
  /** สมาชิกที่เป็น admin ของโปรเจคนี้ */
  adminIds: string[]
  /** คนที่เปิด modal เป็นเจ้าของจริงไหม — ปุ่มตั้ง/ถอด admin โชว์เฉพาะเจ้าของ */
  isOwner: boolean
  /** พนักงานใน workspace ที่ยังไม่ได้อยู่ในโปรเจคนี้ */
  available: Member[]
  onClose: () => void
  onAddExisting: (memberId: string) => void
  onRemove: (memberId: string) => void
  onSetRole: (memberId: string, role: "member" | "admin") => void
  /** เรียกหลังดึงรายชื่อจาก GitHub เสร็จ เพื่อให้ App โหลดพนักงานใหม่ */
  onImported: () => void
  /** คำเรียกสิ่งที่กำลังจัดการสมาชิก — "project" (ค่าเริ่มต้น) หรือ "document" */
  noun?: string
  /** ที่เก็บเอกสารที่ผูกโปรเจคนี้และฉันจัดการได้ — เพิ่มคนเข้าโปรเจคแล้วให้เข้าที่เก็บด้วยในคลิกเดียว */
  linkedSpaces?: { id: string; title: string; memberIds: string[] }[]
  onAddToSpace?: (spaceId: string, memberId: string) => void
}

export function AddMemberModal({
  projectName, githubRepo, members, ownerId, adminIds, isOwner, available, onClose,
  onAddExisting, onRemove, onSetRole, onImported, noun = "project", linkedSpaces = [], onAddToSpace,
}: Props) {
  const [alsoSpaces, setAlsoSpaces] = useState<Set<string>>(() => new Set(linkedSpaces.map((s) => s.id)))
  const toggleSpace = (id: string) =>
    setAlsoSpaces((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const add = (memberId: string) => {
    onAddExisting(memberId)
    for (const s of linkedSpaces) {
      if (alsoSpaces.has(s.id) && !s.memberIds.includes(memberId)) onAddToSpace?.(s.id, memberId)
    }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  const [query, setQuery] = useState("")
  const q = query.trim().toLowerCase()
  const found = available.filter((m) =>
    !q || [m.name, m.username, m.githubLogin, m.role].some((s) => s?.toLowerCase().includes(q)),
  )

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Add members to ${projectName}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <h2 className="modal-title">Add members to {noun}</h2>
            <p className="modal-sub">{projectName}</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} title="Close">
            <IconClose size={16} />
          </button>
        </header>

        <div className="modal-body">
          <section className="modal-section">
            <h3 className="modal-h3">In this {noun} ({members.length})</h3>
            {members.length === 0 && <p className="modal-empty">Nobody in this project yet</p>}
            <ul className="member-list">
              {members.map((m) => {
                const isAdmin = adminIds.includes(m.id)
                return (
                  <li key={m.id} className="member-row">
                    <Avatar member={m} size={30} />
                    <span className="member-info">
                      <span className="member-name">
                        {m.name}
                        {m.id === ownerId && <span className="owner-tag">Owner</span>}
                        {isAdmin && <span className="owner-tag is-admin">Admin</span>}
                      </span>
                      <span className="member-role">{m.role}</span>
                    </span>
                    {/* admin เป็นสิทธิ์ในเว็บนี้อย่างเดียว ไม่แตะสิทธิ์บน GitHub
                        เจ้าของเท่านั้นที่ตั้ง/ถอดได้ — admin ตั้ง admin ต่อไม่ได้ */}
                    {isOwner && m.id !== ownerId && (
                      <button
                        type="button"
                        className="member-action"
                        title={isAdmin ? "Back to a regular member" : "Same permissions as the owner on this board"}
                        onClick={() => onSetRole(m.id, isAdmin ? "member" : "admin")}
                      >
                        {isAdmin ? "Remove admin" : "Make admin"}
                      </button>
                    )}
                    {m.id !== ownerId && (
                      <button
                        type="button"
                        className="member-action is-danger"
                        title={`Remove from ${noun}`}
                        onClick={() => onRemove(m.id)}
                      >
                        <IconTrash size={14} />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>

          <section className="modal-section">
            <h3 className="modal-h3">Everyone else in the system ({available.length})</h3>
            {available.length === 0 ? (
              <p className="modal-empty">Everyone with an account is already in this {noun}</p>
            ) : (
              <>
                <input
                  className="field-input"
                  placeholder="Search by name, username or role…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {linkedSpaces.length > 0 && (
                  <div className="also-spaces">
                    <span className="also-spaces-label">Also add to document space</span>
                    {linkedSpaces.map((s) => (
                      <label key={s.id} className="also-space">
                        <input type="checkbox" checked={alsoSpaces.has(s.id)} onChange={() => toggleSpace(s.id)} />
                        {s.title}
                      </label>
                    ))}
                  </div>
                )}
                {found.length === 0 && <p className="modal-empty">Nobody matches "{query}"</p>}
                <ul className="member-list member-list-scroll">
                  {found.map((m) => (
                    <li key={m.id} className="member-row">
                      <Avatar member={m} size={30} />
                      <span className="member-info">
                        <span className="member-name">{m.name}</span>
                        <span className="member-role">
                          {m.role}{m.username ? ` · @${m.username}` : m.githubLogin ? ` · ${m.githubLogin}` : ""}
                        </span>
                      </span>
                      <button type="button" className="member-action" onClick={() => add(m.id)}>
                        <IconPlus size={14} /> Add
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {githubRepo && <GithubImport repo={githubRepo} onImported={onImported} />}

        </div>

        <footer className="modal-foot">
          <button type="button" className="btn btn-primary" onClick={onClose}>Close</button>
        </footer>
      </div>
    </div>
  )
}

/** ซิงค์ collaborator ของ repo ที่โปรเจคนี้ผูกอยู่ — ใช้ตอนมีคนเข้า repo เพิ่มทีหลัง */
function GithubImport({ repo, onImported }: { repo: string; onImported: () => void }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sync = async () => {
    setMessage(null)
    setError(null)
    setBusy(true)
    try {
      const result = await importRepoCollaborators(repo)
      const pendingNote = result.pending > 0 ? ` (${result.pending} invite(s) still pending)` : ""
      setMessage(`Added ${result.created}, updated ${result.updated}${pendingNote}`)
      onImported()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch member list")
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="modal-section">
      <h3 className="modal-h3">Sync member from GitHub</h3>

      <button type="button" className="btn" disabled={busy} onClick={() => void sync()}>
        {busy ? "Loading..." : `Add collaborator from ${repo}`}
      </button>

      {!message && !error && (
        <p className="modal-hint">Use this when people join the repo after the project is created</p>
      )}
      {message && <p className="modal-hint">{message}</p>}
      {error && <p className="modal-error">{error}</p>}
    </section>
  )
}
