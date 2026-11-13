import { useMemo } from "react"
import type { Member, Project, Task } from "../types"
import {
  STATUSES, taskKey, taskPoints, WORKLOAD_CAPACITY, workloadLevel,
} from "../types"
import { Avatar } from "./Avatar"
import "./MemberDashboard.css"

/** จำนวนงานที่ปิดขั้นต่ำก่อนจะเชื่อเปอร์เซ็นต์ในหน้านี้ได้
 *
 * ปิด 2 งานแล้วตรงเวลา 100% ไม่ได้แปลว่าทำงานดีกว่าคนที่ปิด 20 งานแล้วตรง 90%
 */
const MIN_SAMPLE = 5

/** ปัดเป็นเที่ยงคืนของวันนั้น — เทียบวันครบกำหนดต้องเทียบเป็นวัน ไม่ใช่เป็นวินาที
 *  ไม่งั้นงานที่ครบกำหนด "วันนี้" จะกลายเป็นเลยกำหนดตั้งแต่บ่าย
 */
const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/** "2026-09-09" -> Date เที่ยงคืนตามเวลาเครื่อง
 *  ใช้ new Date(iso) ตรง ๆ ไม่ได้ เพราะจะถูกอ่านเป็น UTC แล้วเพี้ยนไปหนึ่งวัน
 */
const parseDay = (iso: string): Date => {
  const [y, m, d] = iso.split("-").map(Number)
  return new Date(y, m - 1, d)
}

const daysBetween = (from: Date, to: Date) =>
  Math.round((to.getTime() - from.getTime()) / 86_400_000)

/** ส่งช้ากี่วัน — บวกคือช้า, 0 หรือติดลบคือทัน, null คือไม่ได้กำหนดวันส่ง */
const lateDays = (task: Task): number | null => {
  if (!task.dueDate) return null
  const end = task.completedAt ? dayOf(new Date(task.completedAt)) : dayOf(new Date())
  return daysBetween(parseDay(task.dueDate), end)
}

type Talk = { key: string; taskId: string | null; text: string; tone: "bad" | "warn" }

function buildStats(tasks: Task[], memberId: string) {
  // งานที่รับร่วมกันหลายคนจะถูกนับเต็มให้ทุกคนที่ถือ
  // หารแต้มแล้วตัวเลขจะอ่านยากกว่าเดิม และงานร่วมในโปรเจคนี้มีไม่กี่ใบ
  const mine = tasks.filter((t) => t.assigneeIds.includes(memberId))
  const open = mine.filter((t) => t.status !== "complete")

  // นับทุกงานที่ปิดแล้ว — ไม่มีตัวเลือกช่วงเวลาให้สับสน
  const done = mine.filter((t) => t.status === "complete")

  const openPoints = open.reduce((sum, t) => sum + taskPoints(t), 0)
  const donePoints = done.reduce((sum, t) => sum + taskPoints(t), 0)

  const rated = done.map(lateDays).filter((d): d is number => d !== null)
  const onTime = rated.filter((d) => d <= 0).length

  const scope = [...done, ...open]
  const reworks = scope.reduce((sum, t) => sum + t.reworkCount, 0)

  // ---- จุดที่ควรคุย: เรียงจากเรื่องที่ยังค้างอยู่ ไปหาเรื่องที่ผ่านไปแล้ว ----
  const talk: Talk[] = []
  const seen = new Set<string>()
  const push = (t: Task, text: string, tone: "bad" | "warn") => {
    if (seen.has(t.id)) return
    seen.add(t.id)
    talk.push({ key: t.id, taskId: t.id, text, tone })
  }

  // งานที่ถูกตีกลับก่อนระบบเริ่มนับจะมีธงแต่ยอดเป็น 0 อย่าเขียนว่า "ตีกลับ 0 ครั้ง"
  for (const t of open.filter((t) => t.needsRework))
    push(
      t,
      t.reworkCount > 0
        ? `Sent back ${t.reworkCount} times, still not passing`
        : "Sent back for rework, still not passing",
      "bad",
    )

  for (const t of open) {
    const d = lateDays(t)
    if (d !== null && d > 0) push(t, `${d} days overdue, not submitted`, "bad")
  }

  for (const t of done) {
    const d = lateDays(t)
    if (d !== null && d > 0) push(t, `Delivered ${d} days late`, "warn")
  }

  for (const t of done.filter((t) => t.reworkCount >= 2))
    push(t, `Took ${t.reworkCount} rounds of rework to pass`, "warn")

  if (openPoints >= WORKLOAD_CAPACITY)
    talk.push({
      key: "overload",
      taskId: null,
      text: `Holding ${openPoints} points, over the ${WORKLOAD_CAPACITY} cap — do not assign more yet`,
      tone: "bad",
    })

  // ---- ถนัดอะไร: นับ tag จากงานที่ปิดแล้ว ไม่ใช่งานที่กำลังทำ ----
  const skillCount = new Map<string, number>()
  for (const t of done)
    for (const tag of t.tags) skillCount.set(tag, (skillCount.get(tag) ?? 0) + 1)
  const skills = [...skillCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)

  return {
    mine, open, done, openPoints, donePoints,
    onTime, withDue: rated.length, late: rated.length - onTime,
    reworks, talk: talk.slice(0, 5), skills,
  }
}

type Props = {
  project: Project
  members: Member[]
  memberId: string
  onSelectMember: (id: string) => void
  onOpenTask: (id: string) => void
}

/** เนื้อของแท็บ "People" — กรอบ modal อยู่ที่ Dashboard.tsx */
export function MemberPanel({ project, members, memberId, onSelectMember, onOpenTask }: Props) {
  const member = members.find((m) => m.id === memberId) ?? null
  const stats = useMemo(
    () => buildStats(project.tasks, memberId),
    [project.tasks, memberId],
  )

  if (!member) return null

  const level = workloadLevel(stats.openPoints)
  const onTimePercent =
    stats.withDue === 0 ? null : Math.round((stats.onTime / stats.withDue) * 100)
  const thin = stats.done.length < MIN_SAMPLE

  return (
    <>
    {/* สลับดูคนอื่นได้โดยไม่ต้องปิดหน้าต่าง — ประเมินคนต้องเทียบกับคนอื่น */}
    <nav className="md-switch" aria-label="Choose a member">
      {members.map((m) => (
        <button
          key={m.id}
          type="button"
          className={`md-chip${m.id === memberId ? " is-active" : ""}`}
          onClick={() => onSelectMember(m.id)}
        >
          <Avatar member={m} size={20} />
          <span className="md-chip-name">{m.name}</span>
        </button>
      ))}
    </nav>

    <div className="md-head">
        <Avatar member={member} size={40} />
        <div className="md-who">
          <span className="md-name">
            {member.name}
            {member.id === project.ownerId && <span className="owner-tag">Owner</span>}
            {project.adminIds.includes(member.id) && <span className="owner-tag is-admin">Admin</span>}
          </span>
          <span className="md-role">{member.role}</span>
        </div>
      </div>

      <section className="md-load">
        <div className="md-load-top">
          <span>Current workload</span>
          <span className={`md-load-num is-${level}`}>
            {stats.openPoints}/{WORKLOAD_CAPACITY} pts
            {level === "over" ? " · overloaded" : level === "busy" ? " · getting full" : ""}
          </span>
        </div>
        <span className="md-load-bar">
          <span
            className={`md-load-fill is-${level}`}
            style={{
              width: `${Math.min(100, (stats.openPoints / WORKLOAD_CAPACITY) * 100)}%`,
            }}
          />
        </span>
      </section>

      <dl className="md-tiles">
        <div>
          <dt>Tasks closed</dt>
          <dd>{stats.done.length}</dd>
        </div>
        <div>
          <dt>Points delivered</dt>
          <dd>{stats.donePoints}</dd>
        </div>
        <div>
          <dt>On time</dt>
          <dd className={onTimePercent !== null && onTimePercent < 70 ? "is-bad" : ""}>
            {onTimePercent === null ? "—" : `${onTimePercent}%`}
          </dd>
        </div>
        <div>
          <dt>Sent back</dt>
          <dd className={stats.reworks > 0 ? "is-bad" : ""}>{stats.reworks} times</dd>
        </div>
      </dl>
      

      {stats.talk.length > 0 && (
        <section className="md-block">
          <h3 className="modal-h3">Worth discussing</h3>
          <ul className="md-talk">
            {stats.talk.map((t) => (
              <li key={t.key} className={`md-talk-row is-${t.tone}`}>
                {t.taskId ? (
                  <button type="button" onClick={() => onOpenTask(t.taskId as string)}>
                    <span className="md-talk-key">
                      {taskKey(
                        project.taskPrefix,
                        project.tasks.find((x) => x.id === t.taskId)?.number ?? 0,
                      )}
                    </span>
                    <span className="md-talk-title">
                      {project.tasks.find((x) => x.id === t.taskId)?.title}
                    </span>
                    <span className="md-talk-note">{t.text}</span>
                  </button>
                ) : (
                  <span className="md-talk-plain">{t.text}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {stats.skills.length > 0 && (
        <section className="md-block">
          <h3 className="modal-h3">Strengths (from closed tasks)</h3>
          <ul className="md-skills">
            {stats.skills.map(([tag, n]) => (
              <li key={tag}>
                {tag} <b>{n}</b>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="md-block">
        <h3 className="modal-h3">Closed tasks ({stats.done.length})</h3>
        {stats.done.length === 0 ? (
          <p className="modal-empty">No tasks closed yet</p>
        ) : (
          <ul className="md-list">
            {stats.done.map((t) => {
              const d = lateDays(t)
              return (
                <li key={t.id}>
                  <button type="button" onClick={() => onOpenTask(t.id)}>
                    <span className="md-key">{taskKey(project.taskPrefix, t.number)}</span>
                    <span className="md-title">{t.title}</span>
                    {t.reworkCount > 0 && (
                      <span className="md-tag is-warn">{t.reworkCount} reworks</span>
                    )}
                    {d !== null && (
                      <span className={`md-tag ${d > 0 ? "is-bad" : "is-ok"}`}>
                        {d > 0 ? `${d} days late` : "On time"}
                      </span>
                    )}
                    <span className="md-pts">{taskPoints(t)}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="md-block">
        <h3 className="modal-h3">Open tasks ({stats.open.length})</h3>
        {stats.open.length === 0 ? (
          <p className="modal-empty">Nothing open</p>
        ) : (
          STATUSES.filter((s) => s.id !== "complete").map((s) => {
            const rows = stats.open.filter((t) => t.status === s.id)
            if (rows.length === 0) return null
            return (
              <div className="md-group" key={s.id}>
                <span className="md-group-title">
                  <span className="dot" style={{ background: s.color }} /> {s.label} ·{" "}
                  {rows.length}
                </span>
                <ul className="md-list">
                  {rows.map((t) => {
                    const d = lateDays(t)
                    return (
                      <li key={t.id}>
                        <button type="button" onClick={() => onOpenTask(t.id)}>
                          <span className="md-key">
                            {taskKey(project.taskPrefix, t.number)}
                          </span>
                          <span className="md-title">{t.title}</span>
                          {t.needsRework && <span className="md-tag is-bad">Needs rework</span>}
                          {d !== null && d > 0 && (
                            <span className="md-tag is-bad">{d}d overdue</span>
                          )}
                          <span className="md-pts">{taskPoints(t)}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })
        )}
    </section>
</>
  )
}
