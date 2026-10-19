import type { Member, Project } from "../types"
import { useEscape } from "../hooks"
import { IconClose, IconTaskList, IconUsers } from "./Icons"
import { MemberPanel } from "./MemberDashboard"
import { ProjectPanel } from "./ProjectDashboard"
import "./Dashboard.css"

export type DashboardTab = "project" | "member"

type Props = {
  project: Project
  members: Member[]
  tab: DashboardTab
  /** คนที่กำลังดูอยู่ในแท็บ People — null เมื่อเปิดจากแผงสรุปโปรเจค */
  memberId: string | null
  onChangeTab: (tab: DashboardTab) => void
  onSelectMember: (id: string) => void
  onOpenTask: (id: string) => void
  onClose: () => void
}

/** กรอบเดียวของแดชบอร์ดทั้งหมด — สลับระหว่างภาพรวมโปรเจคกับผลงานรายคน
 *
 * รวมเป็นหน้าต่างเดียวเพราะสองมุมนี้ต้องอ่านคู่กัน เห็นว่าโปรเจคช้า
 * แล้วอยากรู้ต่อทันทีว่าใครติดอยู่ ถ้าแยกหน้าต่างต้องปิดแล้วเปิดใหม่ทุกครั้ง
 */
export function Dashboard({
  project, members, tab, memberId, onChangeTab, onSelectMember, onOpenTask, onClose,
}: Props) {
  useEscape(onClose)

  // เปิดแท็บ People โดยยังไม่ได้เลือกใคร ให้เริ่มที่คนแรกไปก่อน
  const activeMember = memberId ?? members[0]?.id ?? null

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal dash"
        role="dialog"
        aria-modal="true"
        aria-label={`Dashboard for ${project.name}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <h2 className="modal-title">{project.name}</h2>
            <p className="modal-sub">
              {project.githubRepo ? (
                <a
                  href={`https://github.com/${project.githubRepo}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {project.githubRepo}
                </a>
              ) : (
                "not linked to a repository"
              )}
            </p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} title="Close">
            <IconClose size={16} />
          </button>
        </header>

        <nav className="dash-tabs">
          <button
            type="button"
            className={`dash-tab${tab === "project" ? " is-active" : ""}`}
            onClick={() => onChangeTab("project")}
          >
            <IconTaskList size={14} /> Project overview
          </button>
          <button
            type="button"
            className={`dash-tab${tab === "member" ? " is-active" : ""}`}
            onClick={() => onChangeTab("member")}
          >
            <IconUsers size={14} /> People
          </button>
        </nav>

        <div className="modal-body dash-body">
          {tab === "project" ? (
            <ProjectPanel
              project={project}
              members={members}
              onOpenMember={(id) => {
                onSelectMember(id)
                onChangeTab("member")
              }}
              onOpenTask={onOpenTask}
            />
          ) : activeMember === null ? (
            <p className="modal-empty">Nobody in this project yet</p>
          ) : (
            <MemberPanel
              project={project}
              members={members}
              memberId={activeMember}
              onSelectMember={onSelectMember}
              onOpenTask={onOpenTask}
            />
          )}
        </div>
      </div>
    </div>
  )
}
