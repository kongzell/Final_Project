import { useEffect, useState } from "react"
import type { Commit, SystemHealth, WebhookEvent } from "../api"
import { applySuggestion, getCommits, getSystemHealth, getWebhookEvents } from "../api"
import { caseFileUrl } from "../api"
import type { CaseFile, Member, Project, ProjectDocuments, Task } from "../types"
import { CASE_STATUSES, openTasksOf, taskPoints, WORKLOAD_CAPACITY, workloadLevel } from "../types"
import { Avatar } from "./Avatar"
import { IconFile, IconPlus } from "./Icons"
import "./RightSidebar.css"

type Props = {
  project: Project | null
  members: Member[]
  onOpenTaskRef: (ref: string) => void
  onAddMember: () => void
  onOpenProject: () => void
  onOpenMember: (id: string) => void
  /** เจ้าของโปรเจคเท่านั้นที่เพิ่มพนักงานได้ */
  canManage: boolean
  /** เอกสาร + คำขอค้างของโปรเจคนี้ — null = ยังโหลดไม่เสร็จ */
  docs: ProjectDocuments | null
  onAddDocument: () => void
  onRequestDocument: () => void
  onOpenDocument: (caseId: string) => void
}

export function RightSidebar({
  project,
  members,
  onOpenTaskRef,
  onAddMember,
  onOpenMember,
  onOpenProject,
  canManage,
  docs,
  onAddDocument,
  onRequestDocument,
  onOpenDocument,
}: Props) {
  return (
    <aside className="rs">
      {project && <ProjectStats project={project} onOpen={onOpenProject} />}
      {project && (
        <ProjectDocumentsPanel docs={docs} onAdd={onAddDocument} onRequest={onRequestDocument} onOpen={onOpenDocument} />
      )}
      {project && (
        <TeamPanel
          members={members}
          tasks={project.tasks}
          ownerId={project.ownerId}
          adminIds={project.adminIds}
          onAddMember={onAddMember}
          onOpenMember={onOpenMember}
          canManage={canManage}
        />
      )}
      {project && (
        <GithubActivity
          key={project.id}
          projectId={project.id}
          onOpenTaskRef={onOpenTaskRef}
          canManage={canManage}
        />
      )}
      <HealthBar />
    </aside>
  )
}

/* ---------- Project Context & Stats ---------- */

function ProjectStats({ project, onOpen }: { project: Project; onOpen: () => void }) {
  const cards = project.tasks.filter((t) => !t.parentId)
  const done = project.tasks.filter((t) => t.status === "complete").length
  const doing = project.tasks.filter((t) => t.status === "in-progress").length
  const review = project.tasks.filter((t) => t.status === "review").length
  const todo = project.tasks.filter((t) => t.status === "todo").length
  const total = project.tasks.length
  const percent = total === 0 ? 0 : Math.round((done / total) * 100)
  const hours = project.tasks.reduce((sum, t) => sum + (t.estimateHours ?? 0), 0)

  return (
    <section className="rs-panel rs-panel-btn" onClick={onOpen} role="button" tabIndex={0}
      title="Open project overview"
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}
    >
      <header className="rs-head">
        <span className="rs-title">{project.name}</span>
        <span className="rs-badge">{percent}%</span>
      </header>

      <div className="rs-progress" role="img" aria-label={`${percent} percent complete`}>
        <span style={{ width: `${percent}%` }} />
      </div>

      <dl className="rs-stats">
        <div><dt>All tasks</dt><dd>{total}</dd></div>
        <div><dt>Main cards</dt><dd>{cards.length}</dd></div>
        <div><dt>To Do</dt><dd className="c-todo">{todo}</dd></div>
        <div><dt>In Progress</dt><dd className="c-prog">{doing}</dd></div>
        <div><dt>In Review</dt><dd className="c-review">{review}</dd></div>
        <div><dt>Done</dt><dd className="c-done">{done}</dd></div>
        <div><dt>Estimated time</dt><dd>{hours ? `${hours.toFixed(1)} h` : "—"}</dd></div>
      </dl>
    </section>
  )
}

/* ---------- ทีมในโปรเจค ---------- */

function TeamPanel({
  members,
  tasks,
  ownerId,
  adminIds,
  onAddMember,
  onOpenMember,
  canManage,
}: {
  members: Member[]
  tasks: Task[]
  /** เจ้าของโปรเจค — คนละเรื่องกับ member.role ที่เป็นสายงาน */
  ownerId: string | null
  adminIds: string[]
  onAddMember: () => void
  onOpenMember: (id: string) => void
  canManage: boolean
}) {
  const load = members.map((m) => {
    const open = openTasksOf(tasks, m.id)
    return {
      member: m,
      count: open.length,
      points: open.reduce((sum, t) => sum + taskPoints(t), 0),
    }
  })

  const total = load.reduce((sum, l) => sum + l.points, 0)

  return (
    <section className="rs-panel">
      <header className="rs-head">
        <span className="rs-title">Project team</span>
        <span className="rs-count">{members.length}</span>
      </header>

      {members.length === 0 && <p className="rs-empty">Nobody in this project yet</p>}

      {total > 0 && (
        <p className="rs-fair">{total} points across the project · cap {WORKLOAD_CAPACITY} each</p>
      )}

      <ul className="rs-team">
        {load.map(({ member, count, points }) => {
          const level = workloadLevel(points)
          return (
            <li key={member.id}>
              <button type="button" className="rs-team-row" onClick={() => onOpenMember(member.id)}>
                <div className="rs-team-top">
                  <Avatar member={member} size={22} />
                  <span className="rs-team-name">{member.name}</span>
                  {/* แถบข้างแคบ ใส่ทั้งป้ายและสายงานพร้อมกันแล้วชื่อโดนตัด
                      เจ้าของเห็นป้าย Owner แทน ส่วนสายงานไปดูได้ในแดชบอร์ด */}
                  {member.id === ownerId ? (
                    <span className="owner-tag">Owner</span>
                  ) : adminIds.includes(member.id) ? (
                    <span className="owner-tag is-admin">Admin</span>
                  ) : (
                    <span className="rs-team-role">{member.role}</span>
                  )}
                </div>
                <div className="rs-load">
                  <span className="rs-load-bar">
                    <span
                      className={`rs-load-fill is-${level}`}
                      style={{ width: `${Math.min(100, (points / WORKLOAD_CAPACITY) * 100)}%` }}
                    />
                  </span>
                  <span className={`rs-load-num is-${level}`}>
                    {points}/{WORKLOAD_CAPACITY} · {count} tasks
                  </span>
                </div>
              </button>
            </li>
          )
        })}
      </ul>

      {canManage && (
        <button type="button" className="rs-add-member" onClick={onAddMember}>
          <IconPlus size={14} /> Add member
        </button>
      )}
    </section>
  )
}

/* ---------- เอกสารของโปรเจค (จากทุกที่เก็บที่ฉันอยู่) ---------- */

/** ทุกใบที่ผูกโปรเจคนี้จากทุกที่เก็บ — คนในโปรเจคเห็นและเปิดไฟล์ได้ทุกใบ แต่เข้าที่เก็บได้เฉพาะที่ตัวเองเป็นสมาชิก */
function ProjectDocumentsPanel({
  docs, onAdd, onRequest, onOpen,
}: { docs: ProjectDocuments | null; onAdd: () => void; onRequest: () => void; onOpen: (caseId: string) => void }) {
  const rows = docs?.files ?? []
  const waiting = docs?.requests ?? []
  const statusOf = (f: CaseFile) => CASE_STATUSES.find((s) => s.id === f.status)

  return (
    <section className="rs-panel">
      <header className="rs-head">
        <span className="rs-title">Documents</span>
        <span className="rs-count">{rows.length}</span>
      </header>

      {waiting.length > 0 && (
        <ul className="rs-docs">
          {waiting.map((r) => (
            <li key={r.id}>
              <button type="button" className="rs-doc" onClick={() => onOpen(r.fromCaseId)} title="Open the request">
                <span className="rs-doc-top">
                  <span className="dot" style={{ background: "var(--accent)" }} />
                  <span className="rs-doc-title">{r.title}</span>
                </span>
                <span className="rs-doc-meta">Waiting · {r.fromCaseTitle} asked {r.fromCaseId === r.toCaseId ? "its own team" : r.toCaseTitle}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {docs === null ? (
        <p className="rs-empty">Loading…</p>
      ) : rows.length === 0 && waiting.length === 0 ? (
        <p className="rs-empty">No document linked to this project yet</p>
      ) : rows.length === 0 ? null : (
        <ul className="rs-docs">
          {rows.map((f) => (
            <li key={f.id}>
              {f.canOpenCase ? (
                <button type="button" className="rs-doc" onClick={() => onOpen(f.caseId)} title={`Open in ${f.caseTitle}`}>
                  <span className="rs-doc-top">
                    <span className="dot" style={{ background: statusOf(f)?.color }} />
                    <span className="rs-doc-title">{f.title}</span>
                  </span>
                  <span className="rs-doc-meta">{f.category.toUpperCase()} · {f.caseTitle}</span>
                </button>
              ) : (
                <a className="rs-doc" href={caseFileUrl(f.caseId, f.id)} target="_blank" rel="noreferrer" title={`Shared from ${f.caseTitle} — open ${f.filename}`}>
                  <span className="rs-doc-top">
                    <span className="dot" style={{ background: statusOf(f)?.color }} />
                    <span className="rs-doc-title">{f.title}</span>
                  </span>
                  <span className="rs-doc-meta">{f.category.toUpperCase()} · shared from {f.caseTitle}</span>
                </a>
              )}
              <a className="rs-doc-open" href={caseFileUrl(f.caseId, f.id)} target="_blank" rel="noreferrer" title={`Open ${f.filename}`}>
                <IconFile size={13} />
              </a>
            </li>
          ))}
        </ul>
      )}

      <div className="rs-doc-btns">
        <button type="button" className="rs-add-member" onClick={onAdd}>
          <IconPlus size={14} /> Add document
        </button>
        <button type="button" className="rs-add-member is-ghost" onClick={onRequest} title="Ask a team for a document for this project">
          Request
        </button>
      </div>
    </section>
  )
}

/* ---------- GitHub Activity & Webhook Log ---------- */

type FeedRow = {
  key: string
  kind: "webhook" | "commit"
  text: string
  who: string | null
  /** ลิงก์ไป commit หรือ PR บน GitHub — แปะไว้ที่ชื่อคนในแถว */
  url: string | null
  /** เวลาที่เกิดเหตุการณ์ (ISO) */
  when: string | null
  /** ชนิด event จาก GitHub เช่น push, pull_request */
  event: string | null
  ref: string | null
  /** ข้อเสนอจาก AI — มีเฉพาะแถวที่มาจาก webhook และ commit ไม่ได้เขียนรหัสงาน */
  suggest: {
    eventId: string
    key: string
    title: string
    confidence: "high" | "medium" | "low"
    reason: string | null
  } | null
}

/** ชื่อ event ของ GitHub อ่านยาก แปลงเป็นคำสั้น ๆ ที่คนอ่านรู้เรื่อง */
const EVENT_LABEL: Record<string, string> = {
  push: "push",
  pull_request: "PR",
  ping: "ping",
  commit: "commit",
}

const eventLabel = (event: string) => EVENT_LABEL[event] ?? event

/** "5 นาทีที่แล้ว" — ของเก่ากว่าอาทิตย์หนึ่งบอกวันที่ไปเลย ใกล้กว่านั้นบอกระยะห่าง */
function ago(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short" })
}

/** โควตา GitHub แบบไม่ล็อกอินคือ 60 ครั้ง/ชม. ถามทุก 5 นาที = 12 ครั้ง/ชม. */
const POLL_MS = 5 * 60 * 1000

function GithubActivity({
  projectId,
  onOpenTaskRef,
  canManage,
}: {
  /** ฟีดเป็นของโปรเจคที่ดูอยู่ — key ตาม id ให้ remount ตอนสลับโปรเจค */
  projectId: string
  onOpenTaskRef: (ref: string) => void
  canManage: boolean
}) {
  const [commits, setCommits] = useState<Commit[]>([])
  const [events, setEvents] = useState<WebhookEvent[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  const [applying, setApplying] = useState<string | null>(null)

  /** ยืนยันข้อเสนอ แล้วโหลด feed ใหม่เพื่อให้ข้อเสนอที่ใช้ไปแล้วหายออก */
  const apply = async (eventId: string) => {
    setApplying(eventId)
    try {
      await applySuggestion(eventId)
      setTick((t) => t + 1)
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not move the card")
    } finally {
      setApplying(null)
    }
  }

  useEffect(() => {
    let alive = true
    let timer: number | undefined

    const load = async () => {
      setLoading(true)
      const [c, e] = await Promise.allSettled([getCommits(projectId, 6), getWebhookEvents(projectId, 8)])
      if (!alive) return

      setCommits(c.status === "fulfilled" ? c.value : [])
      setEvents(e.status === "fulfilled" ? e.value : [])

      if (c.status === "rejected") {
        const raw = String(c.reason?.message ?? "")
        setNote(
          raw.includes("rate limit")
            ? "GitHub limits how many calls you can make per hour — signing in with GitHub raises that limit a lot"
            : raw || "Could not load commits",
        )
        // โดนจำกัดแล้วอย่ายิงซ้ำอัตโนมัติ รอผู้ใช้กดรีเฟรชเอง
        if (raw.includes("rate limit") && timer) clearInterval(timer)
      } else {
        setNote(null)
      }
      setLoading(false)
    }

    void load()
    timer = setInterval(() => void load(), POLL_MS)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [tick, projectId])

  const rows: FeedRow[] = [
    ...events.map((e) => ({
      key: e.id,
      kind: "webhook" as const,
      text: e.summary,
      who: e.actor,
      url: e.url,
      when: e.receivedAt,
      event: e.event,
      ref: e.taskRef,
      suggest:
        e.suggestedTaskId && e.suggestedTaskKey
          ? {
              eventId: e.id,
              key: e.suggestedTaskKey,
              title: e.suggestedTaskTitle ?? "",
              confidence: e.suggestConfidence ?? "low",
              reason: e.suggestReason,
            }
          : null,
    })),
    ...commits.map((c) => ({
      key: c.sha,
      kind: "commit" as const,
      text: c.message,
      who: c.author,
      url: c.url,
      when: c.date,
      event: "commit",
      ref: c.taskRef,
      suggest: null,
    })),
  ]

  return (
    <section className="rs-panel">
      <header className="rs-head">
        <span className="rs-title">GitHub Activity</span>
        <button
          type="button"
          className="rs-refresh"
          title="Reload"
          disabled={loading}
          onClick={() => setTick((t) => t + 1)}
        >
          {loading ? "..." : "Refresh"}
        </button>
      </header>

      {rows.length === 0 && <p className="rs-empty">{note ?? "No activity yet"}</p>}

      <ul className="rs-feed">
        {rows.slice(0, 10).map((r) => (
          <li key={`${r.kind}-${r.key}`} className="rs-feed-row">
            <span className={`rs-dot ${r.kind}`} title={r.kind === "webhook" ? "webhook" : "commit"} />
            <div className="rs-feed-body">
              <span className="rs-feed-text">{r.text}</span>
              <span className="rs-feed-meta">
                {r.event && <span className="rs-kind">{eventLabel(r.event)}</span>}
                {r.url ? (
                  <a className="rs-who" href={r.url} target="_blank" rel="noreferrer"
                    title="Open on GitHub">
                    {r.who ?? "unknown"}
                  </a>
                ) : (
                  <span className="rs-who">{r.who ?? "unknown"}</span>
                )}
                {r.when && <span className="rs-when">{ago(r.when)}</span>}
                {r.ref && (
                  <button type="button" className="rs-ref" onClick={() => onOpenTaskRef(r.ref as string)}>
                    {r.ref}
                  </button>
                )}
              </span>

              {r.suggest && (
                <div className={`rs-guess is-${r.suggest.confidence}`}>
                  <span className="rs-guess-head">
                    AI thinks this is <strong>{r.suggest.key}</strong> {r.suggest.title}
                  </span>
                  {r.suggest.reason && <span className="rs-guess-why">{r.suggest.reason}</span>}
                  {canManage && (
                    <button
                      type="button"
                      className="rs-guess-apply"
                      disabled={applying === r.suggest.eventId}
                      onClick={() => void apply(r.suggest!.eventId)}
                    >
                      {applying === r.suggest.eventId ? "Moving..." : "Move to In Review"}
                    </button>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

    </section>
  )
}

/* ---------- System & Database Health ---------- */

function HealthBar() {
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [reachable, setReachable] = useState(true)

  useEffect(() => {
    let alive = true

    const load = async () => {
      try {
        const data = await getSystemHealth()
        if (!alive) return
        setHealth(data)
        setReachable(true)
      } catch {
        if (alive) setReachable(false)
      }
    }

    void load()
    const timer = setInterval(() => void load(), 20_000)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [])

  const items =
    !reachable || !health
      ? [{ label: "API", ok: false, note: "unreachable" }]
      : [
          { label: "API", ok: health.apiOk, note: undefined as string | undefined },
          { label: "Database", ok: health.databaseOk, note: health.databaseError ?? health.databaseKind },
          { label: "AI", ok: health.aiReady, note: health.aiModel },
          { label: "Login", ok: health.authReady, note: undefined },
          { label: "Webhook", ok: health.webhookReady, note: health.githubRepo ?? "no repo linked" },
          {
            label: "Secrets",
            ok: health.secretsReady,
            note: health.secretsReady ? "configured" : "still on dev values — do not deploy",
          },
        ]

  return (
    <section className="rs-panel">
      <header className="rs-head">
        <span className="rs-title">System Health</span>
      </header>
      <ul className="rs-health">
        {items.map((i) => (
          <li key={i.label}>
            <span className={`rs-led${i.ok ? " is-ok" : ""}`} />
            <span className="rs-health-label">{i.label}</span>
            {i.note && <span className="rs-health-note">{i.note}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}
