import { useState } from "react"
import type { RefObject } from "react"
import type { AuthStatus } from "../api"
import type { Project } from "../types"
import { ROLES } from "../types"
import type { ThemeId } from "../themes"
import { Menu, MenuItem, MenuLabel } from "./Menu"
import { ThemePicker } from "./ThemePicker"
import {
  IconCheck, IconChevronDown, IconChevronRight, IconFolder, IconGithub, IconLayers, IconPencil, IconSearch, IconStar, IconTaskList, IconTrash, IconUsers,
} from "./Icons"
import "./Topbar.css"

type Props = {
  /** อยู่หน้า Documents — breadcrumb เปลี่ยน และซ่อนของที่เป็นของโปรเจค */
  documents?: boolean
  project: Project | null
  projects: Project[]
  taskCount: number
  query: string
  searchRef: RefObject<HTMLInputElement | null>
  starred: boolean
  collapsed: boolean
  theme: ThemeId
  canDelete: boolean
  groupBy: "status" | "category"
  auth: AuthStatus | null
  onChangeGroupBy: (g: "status" | "category") => void
  onLogout: () => void
  onChangeRole: (role: string) => void
  onChangeEmail: (email: string) => void
  onQueryChange: (q: string) => void
  onSelectProject: (id: string) => void
  onRenameProject: (name: string) => void
  onDeleteProject: () => void
  onToggleStar: () => void
  onExpand: () => void
  onChangeTheme: (id: ThemeId) => void
}

export function Topbar({
  documents = false,
  project, projects, taskCount, query, searchRef, starred, collapsed, theme,
  canDelete, groupBy, auth, onChangeGroupBy, onLogout, onChangeRole, onChangeEmail,
  onQueryChange,
  onSelectProject, onRenameProject, onDeleteProject, onToggleStar, onExpand,
  onChangeTheme,
}: Props) {
  const [renaming, setRenaming] = useState(false)

  return (
    <header className="topbar">
      <div className="tb-row">
        {collapsed && (
          <button type="button" className="tb-icon-btn" title="Expand sidebar" onClick={onExpand}>
            <IconChevronRight size={16} />
          </button>
        )}

        <nav className="tb-crumbs">
          {documents ? (
            <span className="tb-crumb tb-crumb-current">
              <span className="tb-crumb-badge"><IconFolder size={11} /></span> Documents
            </span>
          ) : (
          <>
          <span className="tb-crumb">
            <span className="tb-crumb-badge"><IconUsers size={11} /></span> Team Projects
          </span>
          {project === null ? (
            <span className="tb-crumb-dim">No project selected</span>
          ) : (
            <>
          <span className="tb-sep">/</span>

          {renaming ? (
            <RenameInput
              value={project?.name ?? ""}
              onSubmit={(name) => {
                onRenameProject(name)
                setRenaming(false)
              }}
              onCancel={() => setRenaming(false)}
            />
          ) : (
            <Menu
              align="left"
              title="Project menu"
              trigger={() => (
                <span className="tb-crumb tb-crumb-current">
                  <IconTaskList size={14} className="tb-crumb-list" /> {project?.name}
                  <IconChevronDown size={13} />
                </span>
              )}
            >
              {(close) => (
                <>
                  <MenuLabel>Switch project</MenuLabel>
                  {projects.map((p) => (
                    <MenuItem
                      key={p.id}
                      active={p.id === project?.id}
                      onClick={() => { onSelectProject(p.id); close() }}
                    >
                      <IconTaskList size={14} />
                      <span className="menu-grow">{p.name}</span>
                      {p.id === project?.id && <IconCheck size={14} />}
                    </MenuItem>
                  ))}

                  <MenuLabel>Manage</MenuLabel>
                  <MenuItem onClick={() => { setRenaming(true); close() }}>
                    <IconPencil size={14} /> Rename project
                  </MenuItem>
                  {canDelete && (
                    <MenuItem danger onClick={() => { onDeleteProject(); close() }}>
                      <IconTrash size={14} /> Delete project
                    </MenuItem>
                  )}
                </>
              )}
            </Menu>
          )}

          <span className="tb-count">{taskCount} tasks</span>

          <button
            type="button"
            className={`tb-icon-btn tb-star${starred ? " is-on" : ""}`}
            title={starred ? "Remove star" : "Star this project"}
            aria-pressed={starred}
            onClick={onToggleStar}
          >
            <IconStar size={15} />
          </button>
            </>
          )}
          </>
          )}
        </nav>

        <div className="tb-actions">
          {project !== null && !documents && (
            <>
          <Menu
            align="right"
            title="Group columns"
            trigger={() => (
              <span className="tb-group">
                <IconLayers size={14} />
                {groupBy === "status" ? "Status" : "Category"}
                <IconChevronDown size={12} />
              </span>
            )}
          >
            {(close) => (
              <>
                <MenuLabel>Group columns by</MenuLabel>
                <MenuItem
                  active={groupBy === "status"}
                  onClick={() => { onChangeGroupBy("status"); close() }}
                >
                  <span className="menu-grow">Status</span>
                  {groupBy === "status" && <IconCheck size={14} />}
                </MenuItem>
                <MenuItem
                  active={groupBy === "category"}
                  onClick={() => { onChangeGroupBy("category"); close() }}
                >
                  <span className="menu-grow">Category (Frontend / Backend / ...)</span>
                  {groupBy === "category" && <IconCheck size={14} />}
                </MenuItem>
              </>
            )}
          </Menu>

          <label className="tb-search">
            <IconSearch size={14} />
            <input
              ref={searchRef}
              type="search"
              placeholder="Search tasks"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
            />
          </label>
          <span className="tb-divider" />
            </>
          )}
          <AuthChip
            auth={auth}
            onLogout={onLogout}
            onChangeRole={onChangeRole}
            onChangeEmail={onChangeEmail}
          />
          <ThemePicker value={theme} onChange={onChangeTheme} />
        </div>
      </div>
    </header>
  )
}

function RenameInput({
  value,
  onSubmit,
  onCancel,
}: {
  value: string
  onSubmit: (name: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(value)

  const commit = () => {
    const next = name.trim()
    if (next) onSubmit(next)
    else onCancel()
  }

  return (
    <input
      autoFocus
      className="tb-rename"
      value={name}
      onChange={(e) => setName(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit()
        if (e.key === "Escape") onCancel()
      }}
    />
  )
}

/** ปุ่มเข้าสู่ระบบ / ชิปแสดงคนที่ล็อกอินอยู่ */
function AuthChip({
  auth,
  onLogout,
  onChangeRole,
  onChangeEmail,
}: {
  auth: AuthStatus | null
  onLogout: () => void
  onChangeRole: (role: string) => void
  onChangeEmail: (email: string) => void
}) {
  // เก็บค่าที่พิมพ์ไว้เอง ไม่ผูกกับ prop ตลอดเวลา
  // ไม่งั้นพิมพ์ไปครึ่งทางแล้วมีอะไรมา re-render ค่าจะเด้งกลับ
  const [emailDraft, setEmailDraft] = useState<string | null>(null)

  if (auth === null) return null

  if (auth.member) {
    return (
      <Menu
        align="right"
        title="My account"
        trigger={() => (
          <span className="tb-user">
            {auth.member?.avatarUrl ? (
              <img className="tb-user-img" src={auth.member.avatarUrl} alt="" />
            ) : (
              <span className="tb-user-dot" style={{ background: auth.member?.color }} />
            )}
            {auth.member?.name}
          </span>
        )}
      >
        {(close) => (
          <>
            {auth.member?.githubLogin && <MenuLabel>@{auth.member.githubLogin}</MenuLabel>}

            <MenuLabel>My role</MenuLabel>
            {ROLES.map((r) => (
              <MenuItem
                key={r}
                active={r === auth.member?.role}
                onClick={() => { onChangeRole(r); close() }}
              >
                <span className="menu-grow">{r}</span>
                {r === auth.member?.role && <IconCheck size={14} />}
              </MenuItem>
            ))}

            <MenuLabel>Email notifications</MenuLabel>
            <div className="tb-mail" onClick={(e) => e.stopPropagation()}>
              <input
                type="email"
                className="tb-mail-input"
                placeholder="you@example.com"
                value={emailDraft ?? auth.member?.email ?? ""}
                onChange={(e) => setEmailDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter") return
                  onChangeEmail((emailDraft ?? "").trim())
                  setEmailDraft(null)
                  close()
                }}
              />
              <button
                type="button"
                className="tb-mail-save"
                onClick={() => {
                  onChangeEmail((emailDraft ?? auth.member?.email ?? "").trim())
                  setEmailDraft(null)
                  close()
                }}
              >
                Save
              </button>
            </div>
            <p className="tb-mail-hint">
              Leave it empty to stop receiving mail
            </p>

            <MenuItem onClick={() => { onLogout(); close() }}>Sign out</MenuItem>
          </>
        )}
      </Menu>
    )
  }

  if (auth.configured) {
    return (
      <a className="tb-login" href="/api/auth/github">
        <IconGithub size={14} /> Sign in with GitHub
      </a>
    )
  }

  return <span className="tb-login is-off" title="Set GITHUB_CLIENT_ID in .env first">Login disabled</span>
}
