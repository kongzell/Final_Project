import { useState } from "react"
import { login, register } from "../api"
import { IconGithub } from "./Icons"
import "./Modal.css"
import "./LoginScreen.css"

type Props = {
  /** ตั้ง GitHub OAuth ไว้ไหม — ถ้าไม่ ปุ่ม GitHub จะไม่โชว์ */
  githubReady: boolean
  /** เปิดให้สมัครบัญชีแบบธรรมดาไหม (ALLOW_SIGNUP ฝั่ง API) */
  signupOpen: boolean
  /** เรียกหลังล็อกอิน/สมัครสำเร็จ ให้ App โหลดทุกอย่างใหม่ */
  onSignedIn: () => Promise<void>
}

/** หน้าล็อกอิน — บัญชีธรรมดา (username + รหัสผ่าน) หรือ GitHub อยู่หน้าเดียวกัน */
export function LoginScreen({ githubReady, signupOpen, onSignedIn }: Props) {
  const [mode, setMode] = useState<"login" | "register">("login")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (mode === "login") await login(username.trim(), password)
      else await register({ name: name.trim(), username: username.trim(), password, email: email.trim() || undefined })
      await onSignedIn()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign in")
    } finally {
      setBusy(false)
    }
  }

  const canSubmit =
    username.trim().length >= 3 && password.length >= 8 && (mode === "login" || name.trim().length > 0)

  return (
    <div className="login">
      <form
        className="login-card"
        onSubmit={(e) => { e.preventDefault(); void submit() }}
      >
        <h2 className="login-title">{mode === "login" ? "Sign in" : "Create an account"}</h2>
        <p className="login-sub">
          Everyone sees their own board — you will see the projects and documents you belong to
        </p>

        {mode === "register" && (
          <label className="field">
            <span className="field-label">Display name</span>
            <input
              className="field-input"
              autoFocus
              value={name}
              autoComplete="name"
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        )}

        <label className="field">
          <span className="field-label">Username</span>
          <input
            className="field-input"
            autoFocus={mode === "login"}
            value={username}
            autoComplete="username"
            placeholder={mode === "register" ? "3-40 letters, numbers, . _ -" : undefined}
            onChange={(e) => { setUsername(e.target.value); setError(null) }}
          />
        </label>

        <label className="field">
          <span className="field-label">Password</span>
          <input
            className="field-input"
            type="password"
            value={password}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder={mode === "register" ? "At least 8 characters" : undefined}
            onChange={(e) => { setPassword(e.target.value); setError(null) }}
          />
        </label>

        {mode === "register" && (
          <label className="field">
            <span className="field-label">Email for notifications (optional)</span>
            <input
              className="field-input"
              type="email"
              value={email}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        )}

        {error && <p className="modal-error">{error}</p>}

        <button type="submit" className="btn btn-primary login-submit" disabled={!canSubmit || busy}>
          {busy ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}
        </button>

        {signupOpen && (
          <p className="login-switch">
            {mode === "login" ? (
              <>No account yet? <button type="button" onClick={() => { setMode("register"); setError(null) }}>Create one</button></>
            ) : (
              <>Already have an account? <button type="button" onClick={() => { setMode("login"); setError(null) }}>Sign in</button></>
            )}
          </p>
        )}

        {githubReady && (
          <>
            <div className="login-or"><span>or</span></div>
            <a className="btn login-github" href="/api/auth/github">
              <IconGithub size={14} /> Sign in with GitHub
            </a>
            <p className="login-hint">
              GitHub accounts can also pull collaborators and show the commit feed
            </p>
          </>
        )}
      </form>
    </div>
  )
}
