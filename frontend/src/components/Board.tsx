import { useMemo, useState } from "react"
import type { Filters } from "../App"
import type { Complexity, Member, PriorityId, Project, StatusId, Task } from "../types"
import { CATEGORIES, categoryColor, COMPLEXITIES, STATUSES, taskKey } from "../types"
import type { Blocker } from "./TaskCard"
import { TaskCard } from "./TaskCard"
import { IconPlus } from "./Icons"
import "./Board.css"

/** งานที่ใบนี้รออยู่ พร้อมบอกว่าเสร็จหรือยัง
 *
 * คิดที่นี่เพราะ Board เห็นงานทั้งโปรเจค ส่วน TaskCard เห็นแค่การ์ดของตัวเอง
 * งานที่ถูกลบไปแล้วจะหาไม่เจอ ถือว่าไม่ต้องรอ — ดีกว่าค้างเป็น "รอ" ตลอดไป
 */
const blockersOf = (task: Task, project: Project): Blocker[] =>
  task.dependsOn
    .map((id) => project.tasks.find((t) => t.id === id))
    .filter((t) => t !== undefined)
    .map((t) => ({ key: taskKey(project.taskPrefix, t.number), done: t.status === "complete" }))

type Props = {
  project: Project
  members: Member[]
  /** คำค้นจากช่องค้นหาบนแถบหัว */
  query: string
  filters: Filters
  /** จัดคอลัมน์ตามสถานะ หรือตามหมวดหมู่ที่ AI ให้มา */
  groupBy: "status" | "category"
  selectedTaskId: string | null
  /** id ของคนที่ล็อกอินอยู่ — null = ยังไม่ได้ล็อกอิน */
  currentMemberId: string | null
  onClaimTask: (taskId: string) => void
  onOpenTask: (id: string) => void
  onSetSubtaskStatus: (id: string, status: StatusId) => void
  onAddTask: (status: StatusId, draft: TaskDraft) => void
  onChangeStatus: (taskId: string, status: StatusId) => void
  onToggleAssignee: (taskId: string, memberId: string) => void
  onSetPriority: (taskId: string, priority: PriorityId) => void
  onSetDue: (taskId: string, date: string | null) => void
  onSetCategory: (taskId: string, category: string | null) => void
  onSetDescription: (taskId: string, description: string | null) => void
  onDeleteTask: (taskId: string) => void
  onAddMember: () => void
  /** เจ้าของโปรเจคเท่านั้นที่เพิ่มงานและจัดการสมาชิกได้ */
  canManage: boolean
  onClearFilters: () => void
}

export function Board({
  project, members, query, filters, groupBy, selectedTaskId, currentMemberId,
  onClaimTask, onOpenTask,
  onSetSubtaskStatus, onAddTask, onChangeStatus, onToggleAssignee,
  onSetPriority, onSetDue, onSetCategory, onSetDescription, onDeleteTask, onAddMember,
  canManage,
  onClearFilters,
}: Props) {
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    // งานย่อยขึ้นบอร์ดด้วย — จะได้เห็นว่างานไหนกำลังทำ/รอตรวจ/เสร็จแล้ว
    return project.tasks.filter((t) => {
      if (q && !t.title.toLowerCase().includes(q)) return false
      if (filters.assigneeId && !t.assigneeIds.includes(filters.assigneeId)) return false
      if (filters.priority && t.priority !== filters.priority) return false
      return true
    })
  }, [project.tasks, query, filters])

  //: งานที่มีลูก จะไม่ขึ้นเป็นการ์ด แต่กลายเป็นหัวข้อคั่นกลุ่มแทน
  const parentIds = new Set(
    project.tasks.filter((t) => t.parentId).map((t) => t.parentId as string),
  )
  const cardsOf = (rows: Task[]) => rows.filter((t) => !parentIds.has(t.id))

  /** ความคืบหน้าของกลุ่ม นับจากงานย่อยทั้งหมดไม่ว่าอยู่คอลัมน์ไหน */
  const groupProgress = (parentId: string) => {
    const all = project.tasks.filter((t) => t.parentId === parentId)
    return { done: all.filter((t) => t.status === "complete").length, total: all.length }
  }

  const narrowed = cardsOf(visible).length < cardsOf(project.tasks).length

  /** คอลัมน์ที่จะแสดง — ตามสถานะ หรือตามหมวดหมู่ที่มีงานอยู่จริง */
  const columns =
    groupBy === "status"
      ? STATUSES.map((s) => ({
          key: s.id,
          label: s.label,
          color: s.color,
          tasks: visible.filter((t) => t.status === s.id),
          addStatus: s.id as StatusId,
        }))
      : [
          ...CATEGORIES.filter((c) => visible.some((t) => t.category === c.id)).map((c) => ({
            key: c.id,
            label: c.id,
            color: c.color,
            tasks: visible.filter((t) => t.category === c.id),
            addStatus: "todo" as StatusId,
          })),
          {
            key: "__none",
            label: "Uncategorized",
            color: categoryColor(null),
            tasks: visible.filter((t) => !t.category),
            addStatus: "todo" as StatusId,
          },
        ].filter((c) => c.tasks.length > 0 || c.key === "__none")

  return (
    <div className="board-wrap">
      {narrowed && (
        <div className="board-note">
          Showing {cardsOf(visible).length} of {cardsOf(project.tasks).length} tasks
          <button type="button" className="board-note-clear" onClick={onClearFilters}>
            Clear filters
          </button>
        </div>
      )}

      <div className={`board${groupBy === "category" ? " by-category" : ""}`}>
        {columns.map((col) => {
          const tasks = cardsOf(col.tasks)
          //: งานที่ไม่ได้อยู่ใต้ใคร แสดงก่อน แล้วค่อยไล่เป็นกลุ่ม
          const loose = tasks.filter((t) => !t.parentId)
          const groupIds = [
            ...new Set(tasks.filter((t) => t.parentId).map((t) => t.parentId as string)),
          ]

          const renderCard = (t: Task) => (
            <TaskCard
              key={t.id}
              task={t}
              members={members}
              subtasks={project.tasks.filter((s) => s.parentId === t.id)}
              blockers={blockersOf(t, project)}
              taskPrefix={project.taskPrefix}
              githubRepo={project.githubRepo}
              canManage={canManage}
              currentMemberId={currentMemberId}
              expanded={t.id === selectedTaskId}
              canClaim={currentMemberId !== null && t.assigneeIds.length === 0}
              onClaim={() => onClaimTask(t.id)}
              onOpen={() => onOpenTask(t.id === selectedTaskId ? "" : t.id)}
              onSetSubtaskStatus={onSetSubtaskStatus}
              onToggleSubtaskAssignee={onToggleAssignee}
              onChangeStatus={(status) => onChangeStatus(t.id, status)}
              onToggleAssignee={(memberId) => onToggleAssignee(t.id, memberId)}
              onSetPriority={(p) => onSetPriority(t.id, p)}
              onSetDue={(d) => onSetDue(t.id, d)}
              onSetCategory={(c) => onSetCategory(t.id, c)}
              onSetDescription={(d) => onSetDescription(t.id, d)}
              onDelete={() => onDeleteTask(t.id)}
              onAddMember={onAddMember}
            />
          )

          return (
            <section key={col.key} className="column">
              <header className="col-head" style={{ borderBottomColor: col.color }}>
                <span className="col-name">{col.label}</span>
                <span className="col-count">{tasks.length}</span>
              </header>

              {loose.map(renderCard)}

              {groupIds.map((pid) => {
                const parent = project.tasks.find((p) => p.id === pid)
                if (!parent) return null
                const { done, total } = groupProgress(pid)
                return (
                  <div className="col-group" key={pid}>
                    <div className="cg-head" title={parent.title}>
                      <span className="cg-title">{parent.title}</span>
                      <span className="cg-line" />
                      <span className="cg-count">{done}/{total}</span>
                    </div>
                    {tasks.filter((t) => t.parentId === pid).map(renderCard)}
                  </div>
                )
              })}

              {/* งานใหม่เริ่มที่ "รอเริ่ม" เสมอ ไม่ควรสร้างงานเข้ากลางกระบวนการโดยตรง
                  โหมดจัดกลุ่มตามหมวดหมู่ไม่มีคอลัมน์รอเริ่ม จึงไม่มีปุ่มเลย —
                  สลับกลับไปดูตามสถานะก่อนถึงจะเพิ่มงานได้ */}
              {canManage && groupBy === "status" && col.addStatus === "todo" && (
                <NewTask onSubmit={(draft) => onAddTask(col.addStatus, draft)} />
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

/** ร่างงานที่กรอกจากฟอร์ม — ฟิลด์ที่ไม่ได้กรอกส่งเป็น null ให้เหมือนงานที่ยังไม่ประเมิน */
export type TaskDraft = {
  title: string
  category: string | null
  tags: string[]
  estimateHours: number | null
  complexity: Complexity | null
}

function NewTask({ onSubmit }: { onSubmit: (draft: TaskDraft) => void }) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState<string | null>(null)
  const [complexity, setComplexity] = useState<Complexity | null>(null)
  const [hours, setHours] = useState("")
  const [tagText, setTagText] = useState("")

  const reset = () => {
    setTitle("")
    setCategory(null)
    setComplexity(null)
    setHours("")
    setTagText("")
    setEditing(false)
  }

  const commit = () => {
    const t = title.trim()
    if (!t) {
      reset()
      return
    }
    onSubmit({
      title: t,
      category,
      // คั่นด้วยจุลภาคหรือช่องว่างก็ได้ ไม่ต้องจำว่าต้องใช้อันไหน
      tags: tagText.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean),
      estimateHours: hours.trim() ? Number(hours) : null,
      complexity,
    })
    reset()
  }

  if (!editing) {
    return (
      <button type="button" className="add-task" onClick={() => setEditing(true)}>
        <IconPlus size={14} /> Add task
      </button>
    )
  }

  return (
    <div className="nt-form">
      <input
        autoFocus
        className="nt-title"
        placeholder="Task name"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit()
          if (e.key === "Escape") reset()
        }}
      />

      <div className="nt-row">
        <select
          className="nt-select"
          value={category ?? ""}
          onChange={(e) => setCategory(e.target.value || null)}
        >
          <option value="">Category</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>{c.id}</option>
          ))}
        </select>

        <select
          className="nt-select"
          value={complexity ?? ""}
          onChange={(e) => setComplexity((e.target.value || null) as Complexity | null)}
        >
          <option value="">Complexity</option>
          {COMPLEXITIES.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>

        <input
          className="nt-hours"
          type="number"
          min="0"
          step="0.5"
          placeholder="hrs"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
        />
      </div>

      <input
        className="nt-tags"
        placeholder="Skills needed, e.g. React, PostgreSQL"
        value={tagText}
        onChange={(e) => setTagText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit()
          if (e.key === "Escape") reset()
        }}
      />

      <div className="nt-actions">
        <button type="button" className="nt-cancel" onClick={reset}>Cancel</button>
        <button type="button" className="nt-save" disabled={!title.trim()} onClick={commit}>
          Add task
        </button>
      </div>
    </div>
  )
}
