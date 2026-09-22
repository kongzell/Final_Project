import { useMemo, useState } from "react"
import type { Member, Project, Task } from "../types"
import {
  categoryColor, STATUSES, taskKey, taskPoints, WORKLOAD_CAPACITY, workloadLevel,
} from "../types"
import { Avatar } from "./Avatar"
import { IconChevronDown, IconChevronRight } from "./Icons"
import { Timeline } from "./Timeline"
import "./ProjectDashboard.css"

const DAY = 86_400_000

/** จำนวนสัปดาห์ที่โชว์ในกราฟความเร็ว — 6 สัปดาห์พอเห็นแนวโน้มโดยไม่ต้องเลื่อนจอ */
const WEEKS_SHOWN = 6

const UNCATEGORIZED = "Uncategorized"

/** เที่ยงคืนวันจันทร์ของสัปดาห์ที่วันนั้นอยู่ */
const weekStart = (d: Date): Date => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const shortDate = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`

/** ส่งช้ากี่วัน — บวกคือช้า, null คือไม่ได้กำหนดวันส่ง */
const lateDays = (task: Task): number | null => {
  if (!task.dueDate) return null
  const [y, m, d] = task.dueDate.split("-").map(Number)
  const end = task.completedAt ? dayOf(new Date(task.completedAt)) : dayOf(new Date())
  return Math.round((end.getTime() - new Date(y, m - 1, d).getTime()) / DAY)
}

/* ---------- ความเร็วในการปิดงาน ---------- */

function buildPace(tasks: Task[]) {
  const thisWeek = weekStart(new Date())
  const buckets = Array.from({ length: WEEKS_SHOWN }, (_, i) => {
    const start = new Date(thisWeek)
    start.setDate(start.getDate() - (WEEKS_SHOWN - 1 - i) * 7)
    return { start, points: 0, count: 0 }
  })

  for (const t of tasks) {
    if (t.status !== "complete" || !t.completedAt) continue
    const ws = weekStart(new Date(t.completedAt)).getTime()
    const b = buckets.find((x) => x.start.getTime() === ws)
    if (b) {
      b.points += taskPoints(t)
      b.count += 1
    }
  }

  return { buckets }
}

/* ---------- ใครปิดงานอะไรไปบ้าง ---------- */

function buildClosed(tasks: Task[], members: Member[]) {
  // นับทุกงานที่ปิดแล้วตั้งแต่เปิดโปรเจค — ไม่มีตัวเลือกช่วงเวลาให้สับสน
  const closed = tasks.filter((t) => t.status === "complete" && t.completedAt !== null)

  const rows = members
    .map((member) => {
      const mine = closed.filter((t) => t.assigneeIds.includes(member.id))
      const byCat = new Map<string, { points: number; count: number }>()
      for (const t of mine) {
        const key = t.category ?? UNCATEGORIZED
        const cur = byCat.get(key) ?? { points: 0, count: 0 }
        byCat.set(key, { points: cur.points + taskPoints(t), count: cur.count + 1 })
      }
      return {
        member,
        count: mine.length,
        points: mine.reduce((sum, t) => sum + taskPoints(t), 0),
        cats: [...byCat.entries()]
          .map(([name, v]) => ({ name, ...v }))
          .sort((a, b) => b.points - a.points),
      }
    })
    .sort((a, b) => b.points - a.points)

  return {
    rows,
    tasks: closed.length,
    legend: [...new Set(closed.map((t) => t.category ?? UNCATEGORIZED))],
  }
}

/** งานที่ยังค้าง แยกตามสาย เรียงจากที่หนักที่สุด */
function groupByCategory(open: Task[]) {
  const map = new Map<string, { count: number; points: number }>()
  for (const t of open) {
    const key = t.category ?? UNCATEGORIZED
    const cur = map.get(key) ?? { count: 0, points: 0 }
    map.set(key, { count: cur.count + 1, points: cur.points + taskPoints(t) })
  }
  return [...map.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.points - a.points)
}

type Props = {
  project: Project
  members: Member[]
  onOpenMember: (id: string) => void
  onOpenTask: (id: string) => void
}

/** เนื้อของแท็บ "Project overview" — กรอบ modal อยู่ที่ Dashboard.tsx */
export function ProjectPanel({ project, members, onOpenMember, onOpenTask }: Props) {
  const tasks = project.tasks
  const [timelineOpen, setTimelineOpen] = useState(true)
  // งานที่วาดบน Timeline จริง — การ์ดหลักที่มีงานย่อยเป็นแค่หัวข้อ ไม่นับซ้ำ (ตรรกะเดียวกับใน Timeline.tsx)
  const timelineRows = useMemo(() => {
    const hasChildren = new Set(tasks.filter((t) => t.parentId).map((t) => t.parentId as string))
    return tasks.filter((t) => !hasChildren.has(t.id)).length
  }, [tasks])
  const pace = useMemo(() => buildPace(tasks), [tasks])
  const closed = useMemo(() => buildClosed(tasks, members), [tasks, members])

  const open = tasks.filter((t) => t.status !== "complete")
  const done = tasks.length - open.length
  const openPoints = open.reduce((sum, t) => sum + taskPoints(t), 0)
  const percent = tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100)
  const hours = tasks.reduce((sum, t) => sum + (t.estimateHours ?? 0), 0)

  const counts = STATUSES.map((s) => ({ ...s, n: tasks.filter((t) => t.status === s.id).length }))
  const busiestColumn = Math.max(1, ...counts.map((c) => c.n))
  const inProgress = counts.find((c) => c.id === "in-progress")?.n ?? 0
  const inReview = counts.find((c) => c.id === "review")?.n ?? 0
  const inRework = open.filter((t) => t.needsRework).length

  const linked = tasks.filter((t) => t.branch !== null || t.reviewUrl !== null).length
  // ---- งานที่ยังค้าง แยกตามสาย ----
  // ไม่ต้อง memo — โปรเจคหนึ่งมีการ์ดหลักสิบใบ วนครั้งเดียวถูกกว่าการจำผลไว้
  const byCategory = groupByCategory(open)
  const heaviestCategory = Math.max(1, ...byCategory.map((c) => c.points))

  // ---- ต้องจัดการ ----
  const rework = open.filter((t) => t.needsRework)
  const overdue = open.filter((t) => (lateDays(t) ?? 0) > 0)
  const noDue = open.filter((t) => t.dueDate === null).length

  const alerts: { key: string; text: string; tone: "bad" | "warn" | "info" }[] = []
  if (members.length > 0 && inProgress > members.length * 2)
    alerts.push({
      key: "wip",
      tone: "warn",
      text: `${inProgress} cards In Progress with only ${members.length} people — work is being started faster than it finishes`,
    })
  for (const t of rework)
    alerts.push({
      key: `rework-${t.id}`,
      tone: "bad",
      text: `${taskKey(project.taskPrefix, t.number)} was sent back for rework and is still open`,
    })
  for (const t of overdue)
    alerts.push({
      key: `late-${t.id}`,
      tone: "bad",
      text: `${taskKey(project.taskPrefix, t.number)} is ${lateDays(t)} days overdue`,
    })
  if (inReview > 0)
    alerts.push({ key: "review", tone: "info", text: `${inReview} card(s) waiting for review` })
  if (inRework > 0)
    alerts.push({ key: "rework", tone: "warn", text: `${inRework} card(s) sent back for rework` })
  if (noDue > 0)
    alerts.push({
      key: "nodue",
      tone: "warn",
      text: `${noDue} open card(s) have no due date — on-time numbers stay meaningless until they do`,
    })

  const tallestWeek = Math.max(1, ...pace.buckets.map((b) => b.points))
  const topCloser = Math.max(1, ...closed.rows.map((r) => r.points))

  return (
    <div className="pd-cards">
      {/* ---------- ภาพรวม ---------- */}
      <section className="pd-card is-wide">
        <div className="pd-top">
          <span className="pd-percent">{percent}%</span>
          <span className="pd-top-note">
            {done} of {tasks.length} done · {openPoints} points still open ·{" "}
            {hours ? `${hours.toFixed(1)} h estimated` : "no estimates"}
          </span>
        </div>
        <span className="pd-progress">
          <span style={{ width: `${percent}%` }} />
        </span>
      </section>

      {/* ---------- ความเร็ว ---------- */}
      {/* ---------- ไทม์ไลน์ — พับเก็บได้ เพราะยิ่งงานเยอะยิ่งแถวยาว ไม่อยากให้ดันแผงอื่นลงไปไกล ----------- */}
      <section className="pd-card is-wide">
        <button type="button" className="pd-collapse-head" onClick={() => setTimelineOpen((v) => !v)}>
          {timelineOpen ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          <h3 className="modal-h3">Timeline</h3>
          <span className="pd-collapse-count">{timelineRows} tasks</span>
        </button>
        {timelineOpen && <Timeline project={project} onOpenTask={onOpenTask} />}
      </section>

      <section className="pd-card">
        <h3 className="modal-h3">Delivery pace · last {WEEKS_SHOWN} weeks</h3>
        <div className="pd-weeks">
          {pace.buckets.map((b, i) => (
            <div className="pd-week" key={b.start.toISOString()}>
              <span className="pd-week-val">{b.points || ""}</span>
              <span className="pd-week-bar">
                <span
                  className={i === pace.buckets.length - 1 ? "is-now" : ""}
                  style={{ height: `${(b.points / tallestWeek) * 100}%` }}
                />
              </span>
              <span className="pd-week-label">{shortDate(b.start)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- งานไปกองตรงไหน ---------- */}
      <section className="pd-card">
        <h3 className="modal-h3">Where work piles up</h3>
        <ul className="pd-cols">
          {counts.map((c) => (
            <li key={c.id}>
              <span className="pd-col-name">{c.label}</span>
              <span className="pd-col-bar">
                {/* ศูนย์ต้องไม่มีแท่ง ไม่งั้น min-width จะวาดขีดเล็ก ๆ ให้ดูเหมือนมีงาน */}
                {c.n > 0 && (
                  <span
                    style={{ width: `${(c.n / busiestColumn) * 100}%`, background: c.color }}
                  />
                )}
              </span>
              <span className="pd-col-num">{c.n}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* ---------- ใครปิดอะไรไปบ้าง ---------- */}
      <section className="pd-card is-wide">
        <h3 className="modal-h3">Closed by person</h3>

        {closed.tasks === 0 ? (
          <p className="modal-empty">No tasks closed yet</p>
        ) : (
          <>
            <ul className="pd-people">
              {closed.rows.map((r) => (
                <li key={r.member.id}>
                  <button
                    type="button"
                    className="pd-person"
                    onClick={() => onOpenMember(r.member.id)}
                  >
                    <Avatar member={r.member} size={20} />
                    <span className="pd-person-name">{r.member.name}</span>
                    <span className="pd-person-bar">
                      {r.cats.map((c) => (
                        <span
                          key={c.name}
                          title={`${c.name} · ${c.points} pts`}
                          style={{
                            width: `${(c.points / topCloser) * 100}%`,
                            background: categoryColor(
                              c.name === UNCATEGORIZED ? null : c.name,
                            ),
                          }}
                        />
                      ))}
                    </span>
                    <span className="pd-person-num">
                      {r.points ? `${r.points} pts` : "—"}
                    </span>
                  </button>
                  <span className="pd-person-sub">
                    {r.count === 0
                      ? "nothing closed"
                      : r.cats.map((c) => `${c.name} ${c.count}`).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>

            <div className="pd-legend">
              {closed.legend.map((name) => (
                <span key={name}>
                  <i
                    style={{
                      background: categoryColor(name === UNCATEGORIZED ? null : name),
                    }}
                  />
                  {name}
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      {/* ---------- ต้องจัดการ ---------- */}
      {alerts.length > 0 && (
        <section className="pd-card is-wide">
          <h3 className="modal-h3">Needs attention</h3>
          <ul className="pd-alerts">
            {alerts.slice(0, 6).map((a) => (
              <li key={a.key} className={`is-${a.tone}`}>
                {a.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------- ภาระของทีม ---------- */}
      <section className="pd-card">
        <h3 className="modal-h3">Current team load</h3>
        {members.length === 0 ? (
          <p className="modal-empty">Nobody in this project yet</p>
        ) : (
          <ul className="pd-people">
            {members.map((m) => {
              const mine = open.filter((t) => t.assigneeIds.includes(m.id))
              const pts = mine.reduce((sum, t) => sum + taskPoints(t), 0)
              const level = workloadLevel(pts)
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    className="pd-person"
                    onClick={() => onOpenMember(m.id)}
                  >
                    <Avatar member={m} size={20} />
                    <span className="pd-person-name">{m.name}</span>
                    <span className="pd-person-bar is-plain">
                      <span
                        className={`is-${level}`}
                        style={{
                          width: `${Math.min(100, (pts / WORKLOAD_CAPACITY) * 100)}%`,
                        }}
                      />
                    </span>
                    <span className={`pd-person-num is-${level}`}>
                      {pts}/{WORKLOAD_CAPACITY}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {/* ---------- งานค้างแยกตามสาย ---------- */}
      {byCategory.length > 0 && (
        <section className="pd-card">
          <h3 className="modal-h3">Open work by type</h3>
          <ul className="pd-cols">
            {byCategory.map((c) => (
              <li key={c.name}>
                <span className="pd-col-name">{c.name}</span>
                <span className="pd-col-bar">
                  <span
                    style={{
                      width: `${(c.points / heaviestCategory) * 100}%`,
                      background: categoryColor(c.name === UNCATEGORIZED ? null : c.name),
                    }}
                  />
                </span>
                <span className="pd-col-num">
                  {c.count} · {c.points} pts
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ---------- ระบบถูกใช้จริงไหม ---------- */}
      <section className="pd-card is-wide">
        <h3 className="modal-h3">GitHub linkage</h3>
        <p className="pd-note">
          <b>
            {linked} of {tasks.length} cards
          </b>{" "}
          have a commit or pull request linked (
          {tasks.length === 0 ? 0 : Math.round((linked / tasks.length) * 100)}%). A low number
          means the team is not putting task codes in commit messages yet.
        </p>
        {rework.length > 0 && (
          <ul className="pd-quick">
            {rework.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => onOpenTask(t.id)}>
                  <span className="pd-key">{taskKey(project.taskPrefix, t.number)}</span>
                  <span className="pd-quick-title">{t.title}</span>
                  <span className="pd-tag">Needs rework</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
</div>
  )
}
