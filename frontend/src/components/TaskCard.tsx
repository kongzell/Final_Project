import { useState } from "react"
import type { Member, PriorityId, StatusId, Task } from "../types"
import {
  CATEGORIES, categoryColor, codeLink, COMPLEXITIES, formatDuration, isOverdue, PRIORITIES,
  STATUSES, taskKey,
} from "../types"
import { Avatar } from "./Avatar"
import { TaskComments } from "./TaskComments"
import { Menu, MenuItem, MenuLabel } from "./Menu"
import {
  IconCalendar, IconCheck, IconDots, IconFile, IconFlag, IconGithub, IconHand, IconPencil,
  IconPlus, IconTrash, IconUser,
} from "./Icons"

/** งานที่การ์ดใบนี้รออยู่ — Board คำนวณมาให้เพราะมันเห็นงานทั้งโปรเจค */
export type Blocker = { key: string; done: boolean }

type Props = {
  task: Task
  /** พนักงานทั้งหมดในโปรเจคนี้ */
  members: Member[]
  /** งานย่อยของการ์ดใบนี้ (ถ้ามี) */
  subtasks: Task[]
  /** งานที่ต้องเสร็จก่อนใบนี้จะเริ่มได้ — ว่าง = ไม่ต้องรอใคร */
  blockers: Blocker[]
  /** ไฟล์ในหน้า Documents ที่งานนี้แตกมาจาก — null ถ้าสร้างเอง */
  sourceFile: { name: string; url: string } | null
  /** รหัสย่อของโปรเจค ใช้ประกอบเป็นรหัสงาน */
  taskPrefix: string
  /** repo ของโปรเจค ใช้ประกอบลิงก์ compare ตอนมีแค่ชื่อ branch */
  githubRepo: string | null
  /** เจ้าของโปรเจค — วางแผนงานได้ (ความสำคัญ หมวดหมู่ กำหนดส่ง ลบ มอบหมายคนอื่น) */
  canManage: boolean
  /** id ของคนที่ล็อกอินอยู่ ใช้ตัดสินว่ารับงานเองได้ไหม */
  currentMemberId: string | null
  /** กางรายละเอียดอยู่หรือไม่ */
  expanded: boolean
  /** ล็อกอินอยู่และยังไม่มีใครรับงานนี้ */
  canClaim: boolean
  onClaim: () => void
  onOpen: () => void
  onToggleSubtaskAssignee: (subtaskId: string, memberId: string) => void
  onSetSubtaskStatus: (subtaskId: string, status: StatusId) => void
  onChangeStatus: (status: StatusId) => void
  onToggleAssignee: (memberId: string) => void
  onSetPriority: (priority: PriorityId) => void
  onSetDue: (date: string | null) => void
  onSetCategory: (category: string | null) => void
  onSetDescription: (description: string | null) => void
  onDelete: () => void
  onAddMember: () => void
}

const fmtDue = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString("th-TH", { day: "numeric", month: "short" })

export function TaskCard({
  task, members, subtasks, blockers, sourceFile, taskPrefix, githubRepo, canManage, currentMemberId,
  expanded,
  canClaim, onClaim, onOpen,
  onToggleSubtaskAssignee, onSetSubtaskStatus, onChangeStatus, onToggleAssignee,
  onSetPriority, onSetDue, onSetCategory, onSetDescription, onDelete, onAddMember,
}: Props) {
  const [editingDesc, setEditingDesc] = useState(false)
  const [descDraft, setDescDraft] = useState("")

  /** เริ่มแก้รายละเอียด — คัดลอกค่าปัจจุบันลงช่องตอนนี้ทีเดียว
   *  ไม่ต้องเก็บ draft ให้ตรงกับ prop ตลอดเวลา เพราะใช้แค่ตอนกำลังแก้
   */
  const startEditDesc = () => {
    setDescDraft(task.description ?? "")
    setEditingDesc(true)
  }
  const assignees = members.filter((m) => task.assigneeIds.includes(m.id))
  const priority = PRIORITIES.find((p) => p.id === task.priority)!
  const hasPriority = task.priority !== "none"
  const isBare = assignees.length === 0 && !task.dueDate && !hasPriority && !canClaim
  const complexity = COMPLEXITIES.find((c) => c.id === task.complexity)
  const subDone = subtasks.filter((s) => s.status === "complete").length

  /** คนที่ถนัดตรงกับหมวดหมู่ของงานนี้ (Fullstack ถือว่าตรงกับ Frontend/Backend) */
  const matches = (m: Member) =>
    task.category !== null &&
    (m.role === task.category ||
      (m.role === "Fullstack" && (task.category === "Frontend" || task.category === "Backend")))

  // เอาคนที่ถนัดตรงงานขึ้นก่อน จะได้เลือกง่าย
  const sortedMembers = [...members].sort((a, b) => Number(matches(b)) - Number(matches(a)))

  const code = codeLink(task, githubRepo)
  const overdue = isOverdue(task)

  // งานที่ยังไม่เสร็จและใบนี้รออยู่ — ปิดงานแล้วไม่ต้องบอกอะไรอีก
  const waitingFor = task.status === "complete" ? [] : blockers.filter((b) => !b.done)
  // เคยรอแต่ตัวขวางเสร็จหมดแล้ว = เพิ่งปลดล็อก เป็นจังหวะที่ควรหยิบไปทำต่อ
  const justUnblocked =
    task.status === "todo" && blockers.length > 0 && waitingFor.length === 0

  //: สมาชิกส่งงานได้ถึงแค่ "รอตรวจ" — คนตรวจรับคือเจ้าของโปรเจค
  const movable = canManage ? STATUSES : STATUSES.filter((s) => s.id !== "complete")

  return (
    <article
      className={
        `card p-${task.priority}` +
        (task.status === "complete" ? " is-done" : "") +
        (task.needsRework ? " is-rework" : "") +
        (overdue ? " is-overdue" : "") +
        (expanded ? " is-open" : "")
      }
    >
      {waitingFor.length > 0 && (
        <span
          className="card-waiting"
          title={`Waiting for ${waitingFor.map((b) => b.key).join(", ")} to be finished first`}
        >
          รอ {waitingFor[0].key}
          {waitingFor.length > 1 && ` +${waitingFor.length - 1}`}
        </span>
      )}
      {justUnblocked && (
        <span className="card-ready" title="Everything this task was waiting for is done">
          พร้อมเริ่ม
        </span>
      )}
      {overdue && (
        <span className="card-overdue" title="Past its due date and not marked complete yet">
          Overdue
        </span>
      )}
      {task.needsRework && (
        <span className="card-rework" title="Sent back from review — fix it before resubmitting">
          Needs rework
        </span>
      )}

      <div className="card-head">
        <button
          type="button"
          className="card-open"
          aria-expanded={expanded}
          onClick={onOpen}
        >
          <span className="card-key" title="Put this code in a commit message to link it to this card">
            {taskKey(taskPrefix, task.number)}
          </span>
          <h3 className="card-title">{task.title}</h3>
        </button>
        <div className="card-more">
          <Menu align="right" title="Options" trigger={() => <IconDots size={15} />}>
            {(close) => (
              <>
                <MenuLabel>Move to</MenuLabel>
                {movable.map((s) => (
                  <MenuItem
                    key={s.id}
                    active={s.id === task.status}
                    onClick={() => { onChangeStatus(s.id); close() }}
                  >
                    <span className="dot" style={{ background: s.color }} />
                    <span className="menu-grow">{s.label}</span>
                    {s.id === task.status && <IconCheck size={14} />}
                  </MenuItem>
                ))}
                {canManage && <MenuLabel>Category</MenuLabel>}
                {canManage && CATEGORIES.map((c) => (
                  <MenuItem
                    key={c.id}
                    active={c.id === task.category}
                    onClick={() => { onSetCategory(c.id === task.category ? null : c.id); close() }}
                  >
                    <span className="dot" style={{ background: c.color }} />
                    <span className="menu-grow">{c.id}</span>
                    {c.id === task.category && <IconCheck size={14} />}
                  </MenuItem>
                ))}

                {canManage && (
                  <MenuItem danger onClick={() => { onDelete(); close() }}>
                    <IconTrash size={14} /> Delete task
                  </MenuItem>
                )}
              </>
            )}
          </Menu>
        </div>
      </div>

      {subtasks.length > 0 && (
        <button type="button" className="card-sub" onClick={onOpen}>
          Subtasks {subDone}/{subtasks.length}
          <span className="card-sub-bar">
            <span style={{ width: `${(subDone / subtasks.length) * 100}%` }} />
          </span>
        </button>
      )}

      {(task.category || task.tags.length > 0 || task.estimateHours !== null
        || task.actualHours !== null || complexity) && (
        <div className="card-ai">
          {task.category && (
            <span className="card-cat" style={{ color: categoryColor(task.category) }}>
              {task.category}
            </span>
          )}
          {task.tags.map((t) => (
            <span key={t} className="card-tag">{t}</span>
          ))}
          {task.estimateHours !== null && (
            <span className="card-est" title="เวลาที่ AI ประเมินไว้ล่วงหน้า">
              est {formatDuration(task.estimateHours)}
            </span>
          )}
          {task.actualHours !== null && (
            <span className="card-actual" title="เวลาที่ใช้จริงตั้งแต่เริ่มจนปิดงาน">
              จริง {formatDuration(task.actualHours)}
            </span>
          )}
          {complexity && (
            <span className="card-cx" style={{ color: complexity.color }}>{complexity.label}</span>
          )}
        </div>
      )}

      {sourceFile && (
        <a
          className="card-source"
          href={sourceFile.url}
          target="_blank"
          rel="noreferrer"
          title="Open the document this task was created from"
          onClick={(e) => e.stopPropagation()}
        >
          <IconFile size={12} /> from {sourceFile.name}
        </a>
      )}

      {code && (
        <a
          className="card-code"
          href={code.url}
          target="_blank"
          rel="noreferrer"
          title="Open the code on GitHub"
        >
          <IconGithub size={12} />
          <span className="card-code-label">{code.label}</span>
        </a>
      )}

      <div className="card-foot">
        <div className="card-meta">
          {assignees.map((m) => <Avatar key={m.id} member={m} size={20} />)}
          {canClaim && (
            <button
              type="button"
              className="card-claim"
              title="Take this task"
              onClick={onClaim}
            >
              <IconHand size={12} /> Take it
            </button>
          )}
          {task.dueDate && <span className="card-date">{fmtDue(task.dueDate)}</span>}
          {hasPriority && (
            <span className="card-prio" style={{ color: priority.color }}>{priority.label}</span>
          )}
          {isBare && <span className="card-empty">Not set</span>}
        </div>

        <div className="card-tools">
          <Menu title="Assignee" trigger={() => <IconUser size={15} />}>
            {(close) => (
              <>
                <MenuLabel>Assignee</MenuLabel>
                {members.length === 0 && <div className="menu-empty">No members in this project</div>}

                {canManage ? (
                  <>
                    {sortedMembers.map((m) => (
                      <MenuItem
                        key={m.id}
                        active={task.assigneeIds.includes(m.id)}
                        onClick={() => onToggleAssignee(m.id)}
                      >
                        <Avatar member={m} size={18} />
                        <span className="menu-grow">{m.name}</span>
                        <span className={`menu-role${matches(m) ? " is-match" : ""}`}>{m.role}</span>
                        {task.assigneeIds.includes(m.id) && <IconCheck size={14} />}
                      </MenuItem>
                    ))}
                    <MenuItem onClick={onAddMember}>
                      <IconPlus size={14} /> Add member
                    </MenuItem>
                  </>
                ) : (
                  <>
                    {/* สมาชิกดูได้ว่าใครทำอยู่ แต่กดสลับได้เฉพาะตัวเอง */}
                    {assignees.map((m) => (
                      <div key={m.id} className="menu-static">
                        <Avatar member={m} size={18} />
                        <span className="menu-grow">{m.name}</span>
                        <span className="menu-role">{m.role}</span>
                      </div>
                    ))}
                    {currentMemberId !== null && (
                      <MenuItem
                        active={task.assigneeIds.includes(currentMemberId)}
                        onClick={() => { onToggleAssignee(currentMemberId); close() }}
                      >
                        <IconHand size={14} />
                        <span className="menu-grow">
                          {task.assigneeIds.includes(currentMemberId) ? "Drop this task" : "Take this task"}
                        </span>
                      </MenuItem>
                    )}
                  </>
                )}
              </>
            )}
          </Menu>

          {canManage && (
          <Menu title="Due date" trigger={() => <IconCalendar size={15} />}>
            {(close) => (
              <>
                <MenuLabel>Due date</MenuLabel>
                <input
                  type="date"
                  className="menu-date"
                  value={task.dueDate ?? ""}
                  onChange={(e) => onSetDue(e.target.value || null)}
                />
                <MenuItem onClick={() => { onSetDue(null); close() }}>Clear date</MenuItem>
              </>
            )}
          </Menu>
          )}

          {canManage && (
          <Menu title="Priority" trigger={() => <IconFlag size={15} />}>
            {(close) => (
              <>
                <MenuLabel>Priority</MenuLabel>
                {PRIORITIES.map((p) => (
                  <MenuItem key={p.id} active={p.id === task.priority} onClick={() => { onSetPriority(p.id); close() }}>
                    <span className="dot" style={{ background: p.color }} />
                    <span className="menu-grow">{p.label}</span>
                    {p.id === task.priority && <IconCheck size={14} />}
                  </MenuItem>
                ))}
              </>
            )}
          </Menu>
          )}
        </div>
      </div>

      {/* ปุ่มตรวจงาน — โผล่เฉพาะการ์ดที่รอตรวจ และเฉพาะเจ้าของโปรเจค
          เป็นทางลัดของสองทางที่ต้องตัดสินหลังรีวิว: ให้ผ่าน หรือส่งกลับไปแก้ */}
      {canManage && task.status === "review" && (
        <div className="card-review">
          <button
            type="button"
            className="cr-back"
            title="Send back for rework — the card moves to In Progress"
            onClick={() => onChangeStatus("in-progress")}
          >
            <IconPencil size={12} /> Rework
          </button>
          <button
            type="button"
            className="cr-done"
            title="Approve — close the task"
            onClick={() => onChangeStatus("complete")}
          >
            <IconCheck size={12} /> Done
          </button>
        </div>
      )}

      {expanded && (
        <div className="card-detail">
          {/* หมวดหมู่ ทักษะ เวลา ความยาก โชว์เป็นป้ายอยู่บนหน้าการ์ดแล้ว
              ตรงนี้จึงเอาไว้ลงรายละเอียดงานกับบันทึกของคนที่ลงมือทำแทน */}
          <div className="cd-block">
            <span className="cd-label">Details</span>
            {editingDesc ? (
              <>
                <textarea
                  className="cd-desc-edit"
                  rows={4}
                  autoFocus
                  value={descDraft}
                  placeholder="What has to be built, and what counts as done?"
                  onChange={(e) => setDescDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setDescDraft(task.description ?? "")
                      setEditingDesc(false)
                    }
                  }}
                />
                <div className="cd-desc-actions">
                  <button
                    type="button"
                    className="tc-send"
                    onClick={() => {
                      const next = descDraft.trim()
                      if (next !== (task.description ?? "")) onSetDescription(next || null)
                      setEditingDesc(false)
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="cd-desc-cancel"
                    onClick={() => {
                      setDescDraft(task.description ?? "")
                      setEditingDesc(false)
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : canManage ? (
              <button
                type="button"
                className="cd-desc-btn"
                title="Click to edit"
                onClick={startEditDesc}
              >
                <p className={`cd-desc${task.description ? "" : " is-empty"}`}>
                  {task.description || "No details yet — click to write them"}
                </p>
              </button>
            ) : (
              <p className={`cd-desc${task.description ? "" : " is-empty"}`}>
                {task.description || "No details yet"}
              </p>
            )}
          </div>

          <TaskComments
            taskId={task.id}
            currentMemberId={currentMemberId}
            canWrite={canManage || (currentMemberId !== null && task.assigneeIds.includes(currentMemberId))}
            canManage={canManage}
          />

          {subtasks.length > 0 && (
          <div className="cd-block">
            <span className="cd-label">
              Subtasks {subDone}/{subtasks.length}
            </span>

            {(
              <ul className="cd-subs">
                {subtasks.map((s) => {
                  const owners = members.filter((m) => s.assigneeIds.includes(m.id))
                  const cx = COMPLEXITIES.find((c) => c.id === s.complexity)
                  return (
                    <li key={s.id} className={s.status === "complete" ? "is-done" : ""}>
                      <Menu
                        align="left"
                        title="Subtask status"
                        trigger={() => {
                          const st = STATUSES.find((x) => x.id === s.status)
                          return (
                            <span className="cd-status" style={{ color: st?.color }}>
                              <span className="dot" style={{ background: st?.color }} />
                              {st?.label}
                            </span>
                          )
                        }}
                      >
                        {(close) => (
                          <>
                            <MenuLabel>Move to</MenuLabel>
                            {movable.map((st) => (
                              <MenuItem
                                key={st.id}
                                active={st.id === s.status}
                                onClick={() => {
                                  onSetSubtaskStatus(s.id, st.id)
                                  close()
                                }}
                              >
                                <span className="dot" style={{ background: st.color }} />
                                <span className="menu-grow">{st.label}</span>
                                {st.id === s.status && <IconCheck size={14} />}
                              </MenuItem>
                            ))}
                          </>
                        )}
                      </Menu>

                      <div className="cd-sub-body">
                        <span className="cd-sub-title">{s.title}</span>
                        <div className="cd-sub-meta">
                          {s.category && (
                            <span style={{ color: categoryColor(s.category) }}>{s.category}</span>
                          )}
                          {cx && <span style={{ color: cx.color }}>{cx.label}</span>}
                          {s.estimateHours !== null && (
                            <span className="cd-sub-hrs">{formatDuration(s.estimateHours)}</span>
                          )}

                          <Menu
                            align="right"
                            title="Who has this"
                            trigger={() =>
                              owners.length > 0 ? (
                                <span className="cd-owners">
                                  {owners.map((m) => (
                                    <Avatar key={m.id} member={m} size={17} />
                                  ))}
                                </span>
                              ) : (
                                <span className="cd-unassigned">Unassigned</span>
                              )
                            }
                          >
                            {() => (
                              <>
                                <MenuLabel>Assignee</MenuLabel>
                                {members.length === 0 && (
                                  <div className="menu-empty">No members in this project</div>
                                )}
                                {members.map((m) => (
                                  <MenuItem
                                    key={m.id}
                                    active={s.assigneeIds.includes(m.id)}
                                    onClick={() => onToggleSubtaskAssignee(s.id, m.id)}
                                  >
                                    <Avatar member={m} size={18} />
                                    <span className="menu-grow">{m.name}</span>
                                    {s.assigneeIds.includes(m.id) && <IconCheck size={14} />}
                                  </MenuItem>
                                ))}
                              </>
                            )}
                          </Menu>
                        </div>
                      </div>

                    </li>
                  )
                })}
              </ul>
            )}
          </div>
          )}
        </div>
      )}
    </article>
  )
}
