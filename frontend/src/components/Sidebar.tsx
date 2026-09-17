import type { Filters } from "../App"
import type { Case, Member, Project } from "../types"
import { currentFiles, PRIORITIES } from "../types"
import { Avatar } from "./Avatar"
import { Menu, MenuItem, MenuLabel } from "./Menu"
import {
  IconCheck, IconChevronLeft, IconFilter, IconFolder, IconPlus, IconStar, IconTaskList, IconUsers,
} from "./Icons"
import "./Sidebar.css"

type Props = {
  projects: Project[]
  activeProjectId: string | null
  starredIds: string[]
  /** คนที่ล็อกอินอยู่ — ใช้แยกว่าโปรเจคไหนเราเป็นเจ้าของ */
  currentMemberId: string | null
  members: Member[]
  filters: Filters
  onChangeFilters: (f: Filters) => void
  onSelectProject: (id: string) => void
  onOpenAddProject: () => void
  onCollapse: () => void
  /** หน้า Documents — เรื่องที่ฉันเป็นสมาชิก */
  cases: Case[]
  /** เรื่องที่เปิดอยู่ (null = ไม่ได้อยู่หน้า Documents หรือยังไม่เลือก) */
  activeCaseId: string | null
  /** true เมื่ออยู่หน้า Documents — ใช้ไฮไลต์หัวข้อ แม้ยังไม่ได้เลือกเรื่อง */
  documentsOpen: boolean
  onOpenDocuments: () => void
  onSelectCase: (id: string) => void
  onOpenAddDocument: () => void
}

export function Sidebar({
  projects, activeProjectId, starredIds, currentMemberId, members, filters, onChangeFilters,
  onSelectProject, onOpenAddProject, onCollapse,
  cases, activeCaseId, documentsOpen, onOpenDocuments, onSelectCase, onOpenAddDocument,
}: Props) {
  const filterOn = filters.assigneeId !== null || filters.priority !== null

  // แยกโปรเจคที่เราสร้างเอง ออกจากที่ถูกเชิญเข้าไป — สิทธิ์ต่างกันคนละแบบ
  const owned = projects.filter((p) => p.ownerId === currentMemberId)
  const shared = projects.filter((p) => p.ownerId !== currentMemberId)
  const ownedCases = cases.filter((c) => c.ownerId === currentMemberId)
  const sharedCases = cases.filter((c) => c.ownerId !== currentMemberId)

  const renderCase = (c: Case) => (
    <button
      key={c.id}
      type="button"
      className={`sb-row sb-child${c.id === activeCaseId ? " is-active" : ""}`}
      onClick={() => onSelectCase(c.id)}
    >
      <IconFolder size={14} className="sb-glyph-list" />
      <span className="sb-child-name">{c.title}</span>
      <span className="sb-count">{currentFiles(c).length}</span>
    </button>
  )

  const renderRow = (p: Project) => (
    <button
      key={p.id}
      type="button"
      className={`sb-row sb-child${p.id === activeProjectId ? " is-active" : ""}`}
      onClick={() => onSelectProject(p.id)}
    >
      <IconTaskList size={14} className="sb-glyph-list" />
      <span className="sb-child-name">{p.name}</span>
      {starredIds.includes(p.id) && <IconStar size={12} className="sb-star" />}
      <span className="sb-count">{p.tasks.length}</span>
    </button>
  )

  return (
    <aside className="sidebar">
      <div className="sb-top">  
        <div className="sb-top-actions">
          <Menu
            align="right"
            title="Filter tasks"
            trigger={() => (
              <span className={`sb-icon-btn${filterOn ? " is-on" : ""}`}>
                <IconFilter size={15} />
              </span>
            )}
          >
            {(close) => (
              <>
                <MenuLabel>Assignee</MenuLabel>
                <MenuItem
                  active={filters.assigneeId === null}
                  onClick={() => onChangeFilters({ ...filters, assigneeId: null })}
                >
                  <span className="menu-grow">Everyone</span>
                  {filters.assigneeId === null && <IconCheck size={14} />}
                </MenuItem>
                {members.map((m) => (
                  <MenuItem
                    key={m.id}
                    active={filters.assigneeId === m.id}
                    onClick={() => onChangeFilters({ ...filters, assigneeId: m.id })}
                  >
                    <Avatar member={m} size={18} />
                    <span className="menu-grow">{m.name}</span>
                    {filters.assigneeId === m.id && <IconCheck size={14} />}
                  </MenuItem>
                ))}

                <MenuLabel>Priority</MenuLabel>
                <MenuItem
                  active={filters.priority === null}
                  onClick={() => onChangeFilters({ ...filters, priority: null })}
                >
                  <span className="menu-grow">All levels</span>
                  {filters.priority === null && <IconCheck size={14} />}
                </MenuItem>
                {PRIORITIES.filter((p) => p.id !== "none").map((p) => (
                  <MenuItem
                    key={p.id}
                    active={filters.priority === p.id}
                    onClick={() => onChangeFilters({ ...filters, priority: p.id })}
                  >
                    <span className="dot" style={{ background: p.color }} />
                    <span className="menu-grow">{p.label}</span>
                    {filters.priority === p.id && <IconCheck size={14} />}
                  </MenuItem>
                ))}

                {filterOn && (
                  <MenuItem
                    onClick={() => {
                      onChangeFilters({ assigneeId: null, priority: null })
                      close()
                    }}
                  >
                    Clear filters
                  </MenuItem>
                )}
              </>
            )}
          </Menu>

          <button type="button" className="sb-icon-btn" title="Collapse sidebar" onClick={onCollapse}>
            <IconChevronLeft size={15} />
          </button>
        </div>
      </div>

      <section className="sb-section">
        <div className="sb-space">
          <div className="sb-row sb-space-head">
            <span className="sb-space-badge"><IconUsers size={12} /></span>
            Team Projects
            <button
              type="button"
              className="sb-icon-btn sb-row-end"
              title="Add project"
              onClick={onOpenAddProject}
            >
              <IconPlus size={14} />
            </button>
          </div>

          <div className="sb-children">
            {/* ซ่อนหัวข้อกลุ่มที่ว่าง — ไม่งั้นคนที่ยังไม่ถูกเชิญที่ไหนจะเห็น "Shared with me" เปล่า ๆ */}
            {owned.length > 0 && (
              <>
                <span className="sb-group">Owned by me</span>
                {owned.map(renderRow)}
              </>
            )}
            {shared.length > 0 && (
              <>
                <span className="sb-group">Shared with me</span>
                {shared.map(renderRow)}
              </>
            )}
          </div>
        </div>

        <button type="button" className="sb-row sb-add" onClick={onOpenAddProject}>
          <IconPlus size={14} /> New Project
        </button>
      </section>

      <section className="sb-section">
        <div className="sb-space">
          <button
            type="button"
            className={`sb-row sb-space-head sb-space-btn${documentsOpen && activeCaseId === null ? " is-active" : ""}`}
            onClick={onOpenDocuments}
          >
            <span className="sb-space-badge"><IconFolder size={12} /></span>
            Documents
            <span
              role="button"
              tabIndex={0}
              className="sb-icon-btn sb-row-end"
              title="Add document"
              onClick={(e) => { e.stopPropagation(); onOpenAddDocument() }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onOpenAddDocument() } }}
            >
              <IconPlus size={14} />
            </span>
          </button>

          <div className="sb-children">
            {ownedCases.length > 0 && (
              <>
                <span className="sb-group">Owned by me</span>
                {ownedCases.map(renderCase)}
              </>
            )}
            {sharedCases.length > 0 && (
              <>
                <span className="sb-group">Shared with me</span>
                {sharedCases.map(renderCase)}
              </>
            )}
          </div>
        </div>
      </section>
    </aside>
  )
}

