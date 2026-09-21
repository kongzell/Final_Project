import { useEffect, useMemo, useRef } from "react"
import type { Project, Task } from "../types"
import { taskKey } from "../types"
import "./Timeline.css"

const DAY = 86_400_000
const DAY_W = 26
const ROW_H = 30
const LABEL_W = 0
const HEAD_H = 34

const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY)
const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / DAY)
const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]

/** ความยาวแถบเป็นวัน — est ไม่มีถือว่า 1 วันแล้วบอกว่าเดา */
const estDays = (t: Task): { days: number; guessed: boolean } =>
  t.estimateHours && t.estimateHours > 0
    ? { days: Math.max(1, Math.ceil(t.estimateHours / 24)), guessed: false }
    : { days: 1, guessed: true }

type Bar = {
  task: Task
  start: Date
  end: Date
  guessed: boolean
  /** สัดส่วนเวลาที่ใช้ไปเทียบกับแถบ (เฉพาะงานที่กำลังทำ) */
  progress: number
  critical: boolean
  deps: string[]
}

/** วางงานลงบนแกนเวลา — เสร็จแล้วใช้เวลาจริง กำลังทำใช้ started_at ยังไม่เริ่มต่อท้ายงานที่รอ
 *  แล้วหาเส้นทางวิกฤต: สายที่จบช้าที่สุด ไล่ย้อนตามงานที่ทำให้แต่ละใบต้องรอ */
function schedule(tasks: Task[], today: Date): Bar[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const bars = new Map<string, Bar>()
  const blocker = new Map<string, string | null>()

  const place = (t: Task, stack = new Set<string>()): Bar => {
    const done = bars.get(t.id)
    if (done) return done
    if (stack.has(t.id)) {
      const fallback = { task: t, start: today, end: addDays(today, 1), guessed: true, progress: 0, critical: false, deps: [] }
      bars.set(t.id, fallback)
      return fallback
    }
    stack.add(t.id)
    const { days, guessed } = estDays(t)
    const deps = t.dependsOn.filter((id) => byId.has(id))
    let start: Date
    let end: Date
    let progress = 0
    let via: string | null = null

    if (t.status === "complete" && t.completedAt) {
      end = dayOf(new Date(t.completedAt))
      start = t.startedAt ? dayOf(new Date(t.startedAt)) : addDays(end, -days)
      if (daysBetween(start, end) < 1) end = addDays(start, 1)
      progress = 1
    } else if (t.startedAt) {
      start = dayOf(new Date(t.startedAt))
      const planned = addDays(start, days)
      end = planned > today ? planned : addDays(today, 1)
      const elapsed = Math.max(0, daysBetween(start, today))
      progress = Math.min(1, elapsed / Math.max(1, daysBetween(start, end)))
    } else {
      start = today
      for (const id of deps) {
        const d = place(byId.get(id)!, stack)
        if (d.end > start) {
          start = d.end
          via = id
        }
      }
      end = addDays(start, days)
    }
    stack.delete(t.id)
    blocker.set(t.id, via)
    const bar: Bar = { task: t, start, end, guessed, progress, critical: false, deps }
    bars.set(t.id, bar)
    return bar
  }
  tasks.forEach((t) => place(t))

  // เส้นทางวิกฤต — เริ่มจากงานเปิดที่จบช้าสุด ไล่ย้อนตาม via (งานที่ทำให้ต้องรอ)
  const openBars = [...bars.values()].filter((b) => b.task.status !== "complete")
  if (openBars.length > 0) {
    let cur: Bar | undefined = openBars.reduce((a, b) => (b.end > a.end ? b : a))
    while (cur) {
      cur.critical = true
      const nextId = blocker.get(cur.task.id)
      cur = nextId ? bars.get(nextId) : undefined
    }
  }
  return [...bars.values()]
}

type Props = { project: Project; onOpenTask: (id: string) => void }

/** Gantt ของโปรเจค — ใช้ est / dependsOn / startedAt ที่ AI และระบบเก็บไว้ ไม่ต้องกรอกอะไรเพิ่ม
 *  แสดงเฉพาะงานที่ทำจริง (การ์ดหลักที่มีงานย่อยเป็นแค่หัวข้อ) */
export function Timeline({ project, onOpenTask }: Props) {
  const today = useMemo(() => dayOf(new Date()), [])
  const { bars, first, days, months } = useMemo(() => {
    const hasChildren = new Set(project.tasks.filter((t) => t.parentId).map((t) => t.parentId as string))
    const leaves = project.tasks.filter((t) => !hasChildren.has(t.id))
    const scheduled = schedule(leaves, today)
    const parentOrder = new Map(project.tasks.filter((t) => !t.parentId).map((t, i) => [t.id, i]))
    // เรียงตามการ์ดหลัก แล้วตามวันเริ่ม — งานที่ต่อกันจะอยู่ใกล้กัน
    scheduled.sort((a, b) =>
      (parentOrder.get(a.task.parentId ?? a.task.id) ?? 0) - (parentOrder.get(b.task.parentId ?? b.task.id) ?? 0)
      || a.start.getTime() - b.start.getTime()
      || a.task.number - b.task.number)
    if (scheduled.length === 0) return { bars: [], first: today, days: 0, months: [] as { x: number; label: string }[] }
    let lo = scheduled.reduce((m, b) => (b.start < m ? b.start : m), today)
    let hi = scheduled.reduce((m, b) => (b.end > m ? b.end : m), today)
    for (const b of scheduled) if (b.task.dueDate) { const d = dayOf(new Date(b.task.dueDate + "T00:00:00")); if (d > hi) hi = d }
    // ย้อนหลังไม่เกิน 2 สัปดาห์ — งานที่เสร็จนานแล้วไม่ต้องลากแกนให้ยาว แถบที่เริ่มก่อนหน้านั้นถูกตัดที่ขอบซ้าย
    const floor = addDays(today, -14)
    if (lo < floor) lo = floor
    lo = addDays(lo, -1)
    hi = addDays(hi, 2)
    const n = daysBetween(lo, hi)
    const ms: { x: number; label: string }[] = []
    for (let i = 0; i < n; i++) {
      const d = addDays(lo, i)
      if (i === 0 || d.getDate() === 1) ms.push({ x: i * DAY_W, label: `${TH_MONTHS[d.getMonth()]} ${(d.getFullYear() + 543) % 100}` })
    }
    return { bars: scheduled, first: lo, days: n, months: ms }
  }, [project.tasks, today])

  const x = (d: Date) => LABEL_W + daysBetween(first, d) * DAY_W
  const w = LABEL_W + days * DAY_W
  const h = HEAD_H + bars.length * ROW_H + 8
  const rowY = new Map(bars.map((b, i) => [b.task.id, HEAD_H + i * ROW_H]))
  const todayX = x(today)

  // เลื่อนให้เห็น "วันนี้" ตั้งแต่เปิด — งานที่รอเริ่มกองอยู่ตรงนั้น
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = Math.max(0, todayX - el.clientWidth * 0.35)
  }, [todayX])

  if (bars.length === 0) return <p className="pd-note">No tasks to plot yet</p>
  const status = (b: Bar) =>
    b.task.status === "complete" ? "done" : b.task.startedAt ? "doing" : b.deps.length > 0 ? "waiting" : "todo"

  const isLate = (t: Task) =>
    !!t.dueDate && t.status !== "complete" && dayOf(new Date(t.dueDate + "T00:00:00")) < today

  return (
    <div className="tl">
      <div className="tl-body">
        <div className="tl-labels" style={{ paddingTop: HEAD_H }}>
          {bars.map((b) => (
            <button type="button" key={b.task.id} className="tl-label" style={{ height: ROW_H }} onClick={() => onOpenTask(b.task.id)} title={b.task.title}>
              <span className="tl-key">{taskKey(project.taskPrefix, b.task.number)}</span>
              <span className={"tl-title" + (isLate(b.task) ? " is-late" : "")}>{b.task.title}</span>
            </button>
          ))}
        </div>
      <div className="tl-scroll" ref={scroller}>
        <svg width={w} height={h} className="tl-svg" role="img" aria-label="Project timeline">
          <defs>
            <clipPath id="tl-clip"><rect x={0} y={0} width={w} height={h} /></clipPath>
            <marker id="tl-arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" className="tl-arr" />
            </marker>
            <marker id="tl-arr-crit" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" className="tl-arr is-crit" />
            </marker>
          </defs>

          {Array.from({ length: days }, (_, i) => {
            const d = addDays(first, i)
            const wk = d.getDay() === 0 || d.getDay() === 6
            return (
              <g key={i}>
                {wk && <rect x={i * DAY_W} y={HEAD_H} width={DAY_W} height={h - HEAD_H} className="tl-weekend" />}
                <line x1={i * DAY_W} y1={HEAD_H} x2={i * DAY_W} y2={h} className="tl-grid" />
                <text x={i * DAY_W + DAY_W / 2} y={HEAD_H - 8} className="tl-day" textAnchor="middle">{d.getDate()}</text>
              </g>
            )
          })}
          {months.map((m) => (
            <text key={m.x} x={m.x + 2} y={12} className="tl-month">{m.label}</text>
          ))}

          {bars.map((b) => (
            <rect key={"row-" + b.task.id} x={0} y={rowY.get(b.task.id)!} width={w} height={ROW_H} className="tl-rowbg" />
          ))}

          <g clipPath="url(#tl-clip)">
          {bars.map((b) => {
            const y = rowY.get(b.task.id)!
            const bx = x(b.start)
            const bw = Math.max(DAY_W, x(b.end) - bx)
            const st = status(b)
            const due = b.task.dueDate ? dayOf(new Date(b.task.dueDate + "T00:00:00")) : null
            const late = due !== null && b.task.status !== "complete" && due < today
            return (
              <g key={b.task.id} onClick={() => onOpenTask(b.task.id)} style={{ cursor: "pointer" }}>
                <rect x={bx} y={y + 6} width={bw} height={ROW_H - 12} rx={4}
                  className={`tl-bar is-${st}` + (b.guessed ? " is-guess" : "") + (b.critical ? " is-crit" : "")} />
                {st === "doing" && b.progress > 0 && (
                  <rect x={bx} y={y + 6} width={bw * b.progress} height={ROW_H - 12} rx={4} className="tl-bar-fill" />
                )}
                <text x={bx + 6} y={y + ROW_H / 2 + 4} className="tl-bar-text">
                  {st === "done" ? "เสร็จ" : st === "doing" ? `${Math.round(b.progress * 100)}%` : st === "waiting" ? `รอ ${b.deps.map((id) => { const d = bars.find((z) => z.task.id === id); return d ? d.task.number.toString().padStart(3, "0") : "" }).filter(Boolean).join(", ")}` : "รอเริ่ม"}
                  {` · ${daysBetween(b.start, b.end)} วัน${b.guessed ? "?" : ""}`}
                </text>
                {due && (
                  <g>
                    <line x1={x(due) + DAY_W} y1={y + 4} x2={x(due) + DAY_W} y2={y + ROW_H - 4} className={"tl-due" + (late ? " is-late" : "")} />
                  </g>
                )}
              </g>
            )
          })}

          {bars.flatMap((b) =>
            b.deps.map((id) => {
              const from = bars.find((z) => z.task.id === id)
              if (!from) return null
              const y1 = rowY.get(from.task.id)! + ROW_H / 2
              const y2 = rowY.get(b.task.id)! + ROW_H / 2
              const x1 = x(from.end)
              const x2 = x(b.start)
              const crit = b.critical && from.critical
              const mid = x2 >= x1 ? x1 + Math.max(6, (x2 - x1) / 2) : x1 + 8
              const d = x2 >= x1 + 12
                ? `M${x1},${y1} L${mid},${y1} L${mid},${y2} L${x2},${y2}`
                : `M${x1},${y1} L${x1 + 8},${y1} L${x1 + 8},${(y1 + y2) / 2} L${x2 - 8},${(y1 + y2) / 2} L${x2 - 8},${y2} L${x2},${y2}`
              return <path key={`${id}-${b.task.id}`} d={d} className={"tl-dep" + (crit ? " is-crit" : "")} markerEnd={crit ? "url(#tl-arr-crit)" : "url(#tl-arr)"} />
            }),
          )}
          </g>

          <line x1={todayX} y1={HEAD_H - 4} x2={todayX} y2={h} className="tl-today" />
          <rect x={todayX - 18} y={HEAD_H - 22} width={36} height={16} rx={4} className="tl-today-tag" />
          <text x={todayX} y={HEAD_H - 10} className="tl-today-text" textAnchor="middle">วันนี้</text>
        </svg>
      </div>
      </div>
      <div className="tl-legend">
        <span><i className="tl-sw is-done" /> เสร็จแล้ว</span>
        <span><i className="tl-sw is-doing" /> กำลังทำ (ทึบ = เวลาที่ใช้ไป)</span>
        <span><i className="tl-sw is-waiting" /> รองานอื่น</span>
        <span><i className="tl-sw is-todo" /> รอเริ่ม</span>
        <span><i className="tl-sw is-critline" /> เส้นทางวิกฤต</span>
        <span><i className="tl-sw is-dueline" /> กำหนดส่ง</span>
        <span className="tl-hint">? = ไม่มีประมาณการ คิดเป็น 1 วัน</span>
      </div>
    </div>
  )
}
