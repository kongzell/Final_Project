import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { Case, Member, PriorityId, Project, StatusId } from "./types"
import type { ThemeId } from "./themes"
import { loadTheme, saveTheme } from "./themes"
import type { AuthStatus, NewCase, SubtaskSuggestion } from "./api"
import * as api from "./api"
import {
  getAuthStatus, getMembers, logout, updateMyEmail, updateMyRole,
} from "./api"
import { AddDocumentModal } from "./components/AddDocumentModal"
import { AddMemberModal } from "./components/AddMemberModal"
import { AddProjectModal } from "./components/AddProjectModal"
import { AiBreakdownModal } from "./components/AiBreakdownModal"
import type { TaskDraft } from "./components/Board"
import { Board } from "./components/Board"
import type { DashboardTab } from "./components/Dashboard"
import { Dashboard } from "./components/Dashboard"
import { DocumentsView } from "./components/Documents"
import { RightSidebar } from "./components/RightSidebar"
import { Sidebar } from "./components/Sidebar"
import { Topbar } from "./components/Topbar"
import { IconGithub, IconSparkle } from "./components/Icons"
import "./App.css"

export type Filters = { assigneeId: string | null; priority: PriorityId | null }

export default function App() {
  const [projects, setProjects] = useState<Project[]>([])
  const [syncError, setSyncError] = useState<string | null>(null)
  const [allMembers, setAllMembers] = useState<Member[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [memberModalOpen, setMemberModalOpen] = useState(false)
  const [projectModalOpen, setProjectModalOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [filters, setFilters] = useState<Filters>({ assigneeId: null, priority: null })
  const [collapsed, setCollapsed] = useState(false)
  const [groupBy, setGroupBy] = useState<"status" | "category">("status")
  const [aiOpen, setAiOpen] = useState(false)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [dashTab, setDashTab] = useState<DashboardTab | null>(null)
  const [starredIds, setStarredIds] = useState<string[]>([])
  const [theme, setTheme] = useState<ThemeId>(loadTheme)
  const [auth, setAuth] = useState<AuthStatus | null>(null)

  // ---- หน้า Documents ----
  /** "board" = บอร์ดโปรเจค (เดิม) · "documents" = หน้าเรื่อง/เอกสาร */
  const [view, setView] = useState<"board" | "documents">("board")
  const [cases, setCases] = useState<Case[]>([])
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null)
  const [docModalOpen, setDocModalOpen] = useState(false)
  /** id ของเรื่องที่กำลังจัดการสมาชิกอยู่ — null = ปิด */
  const [caseMemberModalId, setCaseMemberModalId] = useState<string | null>(null)

  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    saveTheme(theme)
  }, [theme])

  /** โหลดโปรเจคทั้งหมดจาก database */
  const refreshProjects = useCallback(async () => {
    try {
      const rows = await api.getProjects()
      setProjects(rows)
      setSyncError(null)
      return rows
    } catch (e) {
      // ยังไม่ล็อกอินไม่ใช่ความผิดพลาด — หน้า NeedLogin บอกอยู่แล้ว
      setProjects([])
      setSyncError(api.isUnauthorized(e) ? null : e instanceof Error ? e.message : "Cannot reach the API")
      return null
    }
  }, [])

  /**
   * ยิง API แล้วโหลดข้อมูลใหม่ — ถ้าพลาดจะดึงของจริงจาก server กลับมา
   * เพื่อไม่ให้หน้าจอค้างอยู่ที่สถานะที่ไม่ได้บันทึกจริง
   */
  const sync = useCallback(
    async (action: () => Promise<unknown>) => {
      try {
        await action()
        setSyncError(null)
      } catch (e) {
        setSyncError(
          api.isUnauthorized(e) ? null : e instanceof Error ? e.message : "Save failed",
        )
      }
      await refreshProjects()
    },
    [refreshProjects],
  )

  /** รายชื่อพนักงานมาจาก database — ถ้าต่อ API ไม่ได้ค่อยใช้ข้อมูลตัวอย่างในเครื่อง */
  const refreshMembers = useCallback(async () => {
    try {
      const rows = await getMembers()
      setAllMembers(
        rows.map(({ id, name, role, color, avatarUrl }) => ({
          id, name, role, color, avatarUrl,
        })),
      )
    } catch {
      // ยังไม่ได้ล็อกอินหรือ backend ยังไม่ขึ้น — ไม่มีรายชื่อให้แสดง
      setAllMembers([])
    }
  }, [])

  const refreshCases = useCallback(async () => {
    try {
      setCases(await api.getCases())
    } catch {
      // ยังไม่ล็อกอิน — หน้า NeedLogin บอกอยู่แล้ว
      setCases([])
    }
  }, [])

  const refreshAuth = useCallback(async () => {
    try {
      setAuth(await getAuthStatus())
    } catch {
      // backend ยังไม่ขึ้น — ถือว่ายังไม่ได้ล็อกอิน
      setAuth({ configured: false, member: null })
    }
  }, [])

  useEffect(() => {
    // ถามสถานะล็อกอิน + รายชื่อพนักงานตอนเปิดหน้า — sync กับ backend ไม่ใช่ derived state
    // oxlint-disable-next-line react/set-state-in-effect
    void refreshAuth()
    // oxlint-disable-next-line react/set-state-in-effect
    void refreshMembers()
    // oxlint-disable-next-line react/set-state-in-effect
    void refreshProjects()
    // oxlint-disable-next-line react/set-state-in-effect
    void refreshCases()
  }, [refreshAuth, refreshMembers, refreshProjects, refreshCases])

  // null เมื่อยังไม่มีโปรเจคสักใบ — หน้าจอจะแสดง empty state แทน
  const project = projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null
  const me = auth?.member?.id ?? null
  /** เจ้าของโปรเจคที่เปิดอยู่ — ลบโปรเจคกับตั้ง admin ได้คนเดียว */
  const isOwner = project !== null && me !== null && project.ownerId === me
  /** เจ้าของหรือ admin — เพิ่มงาน มอบหมาย จัดการสมาชิก แตกงานด้วย AI */
  const canManage = isOwner || (project !== null && me !== null && project.adminIds.includes(me))

  const projectMembers = useMemo(
    () => (project ? allMembers.filter((m) => project.memberIds.includes(m.id)) : []),
    [allMembers, project],
  )

  const availableMembers = useMemo(
    () => (project ? allMembers.filter((m) => !project.memberIds.includes(m.id)) : allMembers),
    [allMembers, project],
  )


  const addTask = (status: StatusId, draft: TaskDraft) => {
    if (!project) return
    void sync(() => api.createTask(project.id, { ...draft, status }))
  }

  /**
   * เพิ่มผลลัพธ์จาก AI — สร้างการ์ดแม่จากหัวข้อที่พิมพ์ไว้ 1 ใบ
   * แล้วเก็บงานย่อยไว้ข้างใน (ไม่ขึ้นบนบอร์ด ดูได้จากแผงรายละเอียดฝั่งขวา)
   */
  const addSuggestions = (parentTitle: string, picked: SubtaskSuggestion[]) => {
    if (!project) return
    const totalHours = picked.reduce((sum, s) => sum + s.estimateHours, 0)

    void sync(async () => {
      const parent = await api.createTask(project.id, {
        title: parentTitle,
        estimateHours: totalHours || null,
      })
      // AI อ้างถึงงานที่ต้องเสร็จก่อนด้วย "ตำแหน่งในลิสต์" เพราะตอนนั้นยังไม่มี id
      // สร้างไล่ตามลำดับแล้วเก็บ id ไว้ ตัวที่อ้างถึงจึงถูกสร้างไปแล้วเสมอ (อ้างถอยหลังอย่างเดียว)
      const created: string[] = []
      for (const s of picked) {
        const task = await api.createTask(project.id, {
          title: s.title,
          description: s.description || null,
          parentId: parent.id,
          category: s.category,
          tags: s.tags,
          estimateHours: s.estimateHours,
          complexity: s.complexity,
          dependsOn: s.dependsOn.map((i) => created[i]).filter(Boolean),
        })
        created.push(task.id)
      }
      setSelectedTaskId(parent.id)
    })
  }

  /** ลบงานแม่ — งานย่อยถูกลบตามด้วย cascade ที่ฝั่ง database */
  const deleteTask = (taskId: string) => void sync(() => api.deleteTask(taskId))

  /**
   * มอบหมายงาน — ถ้าเป็นการเพิ่มคนให้งานที่ยัง "รอเริ่ม" จะย้ายไป "กำลังทำ" ให้เลย
   * งานที่อยู่รอตรวจ/เสร็จแล้วไม่ถูกย้าย เพราะการเพิ่มคนตรงนั้นคือการหาคนมาตรวจ ไม่ใช่เริ่มทำใหม่
   */
  const toggleAssignee = (taskId: string, memberId: string) => {
    const task = project?.tasks.find((t) => t.id === taskId)
    if (!task) return
    const adding = !task.assigneeIds.includes(memberId)
    void sync(async () => {
      await api.setAssignee(taskId, memberId, adding)
      if (adding && task.status === "todo") {
        await api.updateTask(taskId, { status: "in-progress" })
      }
    })
  }

  /** รับงานเอง — ถ้ายังไม่ได้อยู่ในโปรเจคจะถูกเพิ่มเข้าให้ด้วย */
  const claimTask = (taskId: string) => {
    const me = auth?.member
    const task = project?.tasks.find((t) => t.id === taskId)
    if (!me || !project || !task) return

    void sync(async () => {
      await api.setAssignee(taskId, me.id, true)
      if (task.status === "todo") {
        await api.updateTask(taskId, { status: "in-progress" })
      }
    })
  }

  const addExistingMember = (memberId: string) => {
    if (!project) return
    void sync(() => api.addProjectMember(project.id, memberId))
  }

  /** เอาออกจากโปรเจค — backend ถอด assign ในโปรเจคนี้ให้ด้วย */
  const removeMember = (memberId: string) => {
    if (!project) return
    void sync(() => api.removeProjectMember(project.id, memberId))
  }

  // ---------- โปรเจค ----------

  const addProject = (name: string, githubRepo: string | null = null, memberIds: string[] = []) => {
    void sync(async () => {
      const created = await api.createProject(name, githubRepo)
      for (const memberId of memberIds) {
        await api.addProjectMember(created.id, memberId)
      }
      setActiveProjectId(created.id)
    })
  }

  const renameProject = (name: string) => {
    if (!project) return
    void sync(() => api.updateProject(project.id, { name }))
  }

  const deleteProject = () => {
    if (!project) return
    const rest = projects.filter((p) => p.id !== project.id)
    setStarredIds((prev) => prev.filter((id) => id !== project.id))
    setActiveProjectId(rest[0]?.id ?? null)
    setSelectedTaskId(null)
    void sync(() => api.deleteProject(project.id))
  }

  // ---- Documents ----
  // ต่างจาก sync() ของบอร์ด: โยน error ต่อให้ modal โชว์เอง เพราะการอัปโหลดมีสาเหตุพลาดหลายแบบ
  // (ไฟล์ใหญ่ ชนิดไม่รับ โปรเจคถูกผูกแล้ว) ที่ผู้ใช้ต้องเห็นตรงจุดที่กด
  const createCase = async (input: NewCase) => {
    const created = await api.createCase(input)
    await refreshCases()
    setActiveCaseId(created.id)
  }

  const caseActions = {
    onUpdate: async (id: string, patch: api.CasePatch) => {
      await api.updateCase(id, patch)
      await refreshCases()
    },
    onDelete: async (id: string) => {
      await api.deleteCase(id)
      setActiveCaseId(null)
      await refreshCases()
    },
    onAddFile: async (id: string, file: File, category: Case["files"][number]["category"], replacesId?: string) => {
      await api.addCaseFile(id, file, category, replacesId)
      await refreshCases()
    },
    onDeleteFile: async (id: string, fileId: string) => {
      await api.deleteCaseFile(id, fileId)
      await refreshCases()
    },
    onManageMembers: (id: string) => setCaseMemberModalId(id),
  }

  const activeCase = cases.find((c) => c.id === caseMemberModalId) ?? null
  const caseMembers = activeCase ? allMembers.filter((m) => activeCase.memberIds.includes(m.id)) : []
  const caseAvailable = activeCase ? allMembers.filter((m) => !activeCase.memberIds.includes(m.id)) : []
  const caseIsOwner = activeCase !== null && me !== null && activeCase.ownerId === me

  /** โปรเจคที่ผูกเรื่องได้ตอนสร้าง — ฉันเป็นเจ้าของ/admin และยังไม่ถูกเรื่องไหนผูก */
  const linkableProjects = projects.filter(
    (p) => me !== null && (p.ownerId === me || p.adminIds.includes(me)) && !cases.some((c) => c.projectId === p.id),
  )

  const toggleStar = () => {
    if (!project) return
    setStarredIds((prev) =>
      prev.includes(project.id) ? prev.filter((id) => id !== project.id) : [...prev, project.id],
    )
  }

  return (
    <div className="app">
      {syncError && (
        <div className="sync-error" role="alert">
          Could not save to the database: {syncError}
        </div>
      )}
      {!collapsed && (
        <Sidebar
          projects={projects}
          activeProjectId={project?.id ?? null}
          starredIds={starredIds}
          currentMemberId={auth?.member?.id ?? null}
          members={projectMembers}
          filters={filters}
          onChangeFilters={setFilters}
          onSelectProject={(id) => { setActiveProjectId(id); setView("board") }}
          onOpenAddProject={() => setProjectModalOpen(true)}
          onCollapse={() => setCollapsed(true)}
          cases={cases}
          activeCaseId={view === "documents" ? activeCaseId : null}
          documentsOpen={view === "documents"}
          onOpenDocuments={() => { setView("documents"); setActiveCaseId(null) }}
          onSelectCase={(id) => { setView("documents"); setActiveCaseId(id) }}
          onOpenAddDocument={() => { setView("documents"); setDocModalOpen(true) }}
        />
      )}

      <main className="main">
        <Topbar
          documents={view === "documents"}
          project={project}
          projects={projects}
          taskCount={project ? project.tasks.length : 0}
          query={query}
          searchRef={searchRef}
          starred={project ? starredIds.includes(project.id) : false}
          collapsed={collapsed}
          theme={theme}
          canDelete={isOwner}
          groupBy={groupBy}
          auth={auth}
          onChangeGroupBy={setGroupBy}
          onQueryChange={setQuery}
          onSelectProject={setActiveProjectId}
          onRenameProject={renameProject}
          onDeleteProject={deleteProject}
          onToggleStar={toggleStar}
          onExpand={() => setCollapsed(false)}
          onChangeTheme={setTheme}
          onLogout={async () => {
            await logout()
            await refreshAuth()
          }}
          onChangeRole={async (role) => {
            await updateMyRole(role)
            await refreshAuth()
          }}
          onChangeEmail={async (email) => {
            await updateMyEmail(email)
            await refreshAuth()
          }}
        />

        {auth !== null && auth.member === null ? (
          <NeedLogin configured={auth.configured} />
        ) : view === "documents" ? (
          <DocumentsView
            cases={cases}
            projects={projects}
            members={allMembers}
            currentMemberId={me}
            selectedId={activeCaseId}
            onSelect={setActiveCaseId}
            onAdd={() => setDocModalOpen(true)}
            onOpenProject={(id) => { setActiveProjectId(id); setView("board") }}
            detail={caseActions}
          />
        ) : project === null ? (
          <EmptyProjects onOpen={() => setProjectModalOpen(true)} />
        ) : (
          <Board
            project={project}
            members={projectMembers}
            query={query}
            filters={filters}
            groupBy={groupBy}
            selectedTaskId={selectedTaskId}
            currentMemberId={auth?.member?.id ?? null}
            onClaimTask={claimTask}
            onOpenTask={(id) => setSelectedTaskId(id || null)}
            onSetSubtaskStatus={(id, status) => void sync(() => api.updateTask(id, { status }))}
            onAddTask={addTask}
            onChangeStatus={(taskId, status) => void sync(() => api.updateTask(taskId, { status }))}
            onToggleAssignee={toggleAssignee}
            onSetPriority={(taskId, priority: PriorityId) => void sync(() => api.updateTask(taskId, { priority }))}
            onSetDue={(taskId, dueDate) => void sync(() => api.updateTask(taskId, { dueDate }))}
            onSetCategory={(taskId, category) => void sync(() => api.updateTask(taskId, { category }))}
            onSetDescription={(taskId, description) =>
              void sync(() => api.updateTask(taskId, { description }))
            }
            onDeleteTask={(id) => {
              deleteTask(id)
              if (id === selectedTaskId) setSelectedTaskId(null)
            }}
            onAddMember={() => setMemberModalOpen(true)}
            onClearFilters={() => {
              setFilters({ assigneeId: null, priority: null })
              setQuery("")
            }}
            canManage={canManage}
          />
        )}
      </main>

      {view === "board" && (
      <div className="rs-wrap">
        <RightSidebar
          project={project}
          members={projectMembers}
          onOpenTaskRef={(ref) => setQuery(ref)}
          onAddMember={() => setMemberModalOpen(true)}
          onOpenProject={() => setDashTab("project")}
          onOpenMember={(id) => {
            setSelectedMemberId(id)
            setSelectedTaskId(null)
            setDashTab("member")
          }}
          canManage={canManage}
        />
      </div>
      )}

      {canManage && view === "board" && (
        <button
          type="button"
          className="ai-fab"
          title="Break down work with AI"
          aria-label="Break down work with AI"
          onClick={() => setAiOpen(true)}
        >
          <IconSparkle size={22} />
        </button>
      )}

      {aiOpen && project && (
        <AiBreakdownModal
          projectName={project.name}
          onClose={() => setAiOpen(false)}
          onAdd={addSuggestions}
        />
      )}

      {projectModalOpen && (
        <AddProjectModal
          usedRepos={projects.map((p) => p.githubRepo).filter((r): r is string => r !== null)}
          onClose={() => setProjectModalOpen(false)}
          onAdd={addProject}
          onMembersChanged={refreshMembers}
        />
      )}

      {dashTab !== null && project && (
        <Dashboard
          project={project}
          members={projectMembers}
          tab={dashTab}
          memberId={selectedMemberId}
          onChangeTab={setDashTab}
          onSelectMember={setSelectedMemberId}
          onClose={() => setDashTab(null)}
          onOpenTask={(id) => {
            setDashTab(null)
            setSelectedTaskId(id)
          }}
        />
      )}

      {memberModalOpen && project && (
        <AddMemberModal
          projectName={project.name}
          githubRepo={project.githubRepo}
          members={projectMembers}
          ownerId={project.ownerId}
          adminIds={project.adminIds}
          isOwner={isOwner}
          available={availableMembers}
          onClose={() => setMemberModalOpen(false)}
          onAddExisting={addExistingMember}
          onRemove={removeMember}
          onSetRole={(id, role) => void sync(() => api.setProjectMemberRole(project.id, id, role))}
          onImported={refreshMembers}
        />
      )}

      {docModalOpen && (
        <AddDocumentModal
          linkable={linkableProjects}
          onClose={() => setDocModalOpen(false)}
          onCreate={createCase}
        />
      )}

      {activeCase && (
        <AddMemberModal
          noun="document"
          projectName={activeCase.title}
          githubRepo={null}
          members={caseMembers}
          ownerId={activeCase.ownerId}
          adminIds={activeCase.adminIds}
          isOwner={caseIsOwner}
          available={caseAvailable}
          onClose={() => setCaseMemberModalId(null)}
          onAddExisting={(id) => void api.addCaseMember(activeCase.id, id).then(refreshCases)}
          onRemove={(id) => void api.removeCaseMember(activeCase.id, id).then(refreshCases)}
          onSetRole={(id, role) => void api.setCaseMemberRole(activeCase.id, id, role).then(refreshCases)}
          onImported={refreshMembers}
        />
      )}
    </div>
  )
}

/** หน้าจอตอนยังไม่มีโปรเจคสักใบ */
function NeedLogin({ configured }: { configured: boolean }) {
  return (
    <div className="empty-projects">
      <h2>Sign in to continue</h2>
      <p>
        {configured
          ? "Everyone sees their own board — sign in with GitHub to see the projects you belong to"
          : "GitHub OAuth is not configured — see README.md for setup"}
      </p>
      {configured && (
        <a className="btn btn-primary" href="/api/auth/github">
          <IconGithub size={14} /> Sign in with GitHub
        </a>
      )}
    </div>
  )
}

function EmptyProjects({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="empty-projects">
      <h2>No projects yet</h2>
      <p>Add a GitHub repository as a board, or start from an empty project</p>
      <button type="button" className="btn btn-primary" onClick={onOpen}>
        <IconGithub size={14} /> Add project
      </button>
    </div>
  )
}
