import { useEffect, useState } from "react"
import type { BreakdownResult, SubtaskSuggestion } from "../api"
import { breakdownTask } from "../api"
import { CATEGORIES, categoryColor, COMPLEXITIES, formatDuration } from "../types"
import {
  IconCheck, IconChevronDown, IconClose, IconPencil, IconPlus, IconSparkle,
} from "./Icons"
import "./Modal.css"
import "./Ai.css"

type Props = {
  projectName: string
  onClose: () => void
  onAdd: (parentTitle: string, picked: SubtaskSuggestion[]) => void
}

export function AiBreakdownModal({ projectName, onClose, onAdd }: Props) {
  const [title, setTitle] = useState("")
  const [context, setContext] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<BreakdownResult | null>(null)
  const [picked, setPicked] = useState<Set<number>>(new Set())
  // ซ่อนรายละเอียดไว้ก่อน — ตอนเลือกงานดูแค่ชื่อกับความยากพอ
  // ถ้ากางทุกใบ งานย่อย 5 ใบจะยาวจนต้องเลื่อนหาปุ่มยืนยัน
  const [openDesc, setOpenDesc] = useState<Set<number>>(new Set())
  /** ใบที่กำลังแก้อยู่ — แก้ได้ทีละใบ จะได้ไม่ต้องเดาว่าอันไหนบันทึกแล้ว */
  const [editing, setEditing] = useState<number | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onClose])

  const run = async () => {
    const t = title.trim()
    if (!t) {
      setError("Enter what you want broken down first")
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = await breakdownTask(t, context)
      setResult(data)
      setPicked(new Set(data.subtasks.map((_, i) => i)))
      setOpenDesc(new Set())
      setEditing(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "The AI request failed")
    } finally {
      setLoading(false)
    }
  }

  const toggle = (i: number) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  /** แก้ข้อมูลของงานย่อยใบหนึ่ง — เก็บไว้ใน state ฝั่งนี้ ยังไม่ยิงไปที่ไหน
   *  จะถูกบันทึกจริงตอนกด "Add to project" เท่านั้น
   */
  const patch = (index: number, change: Partial<SubtaskSuggestion>) =>
    setResult((cur) =>
      cur === null
        ? cur
        : {
            ...cur,
            subtasks: cur.subtasks.map((s, i) => (i === index ? { ...s, ...change } : s)),
          },
    )

  /** งานที่ติ๊กไว้ พร้อมแปลง dependsOn ให้ชี้ตำแหน่งใหม่ในลิสต์ที่กรองแล้ว
   *
   *  AI อ้างถึงงานอื่นด้วยตำแหน่งในลิสต์เต็ม พอผู้ใช้ติ๊กออกบางใบ ตำแหน่งจะเลื่อน
   *  ถ้าไม่แปลงใหม่ งานจะไปผูกกับใบที่ไม่เกี่ยวข้องกันเลย ส่วนที่ชี้ไปยังใบที่ถูกติ๊กออก
   *  ถือว่าไม่ต้องรอแล้ว จึงตัดทิ้ง
   */
  const chosen = (() => {
    if (result === null) return []
    const slot = new Map<number, number>()
    result.subtasks.forEach((_, i) => {
      if (picked.has(i)) slot.set(i, slot.size)
    })
    return result.subtasks
      .filter((_, i) => picked.has(i))
      .map((s) => ({
        ...s,
        dependsOn: s.dependsOn.map((d) => slot.get(d)).filter((d) => d !== undefined),
      }))
  })()
  const totalHours = chosen.reduce((sum, s) => sum + s.estimateHours, 0)

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal modal-wide"
        role="dialog"
        aria-modal="true"
        aria-label="Break down work with AI"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <h2 className="modal-title"><IconSparkle size={16} /> Break down work with AI</h2>
            <p className="modal-sub">{projectName}</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} title="Close">
            <IconClose size={16} />
          </button>
        </header>

        <div className="modal-body">
          <div className="field">
            <span className="field-label">What to build</span>
            <input
              autoFocus
              className="field-input"
              placeholder="e.g. build a shopping cart"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setError(null) }}
              onKeyDown={(e) => e.key === "Enter" && run()}
            />
          </div>

          <div className="field">
            <span className="field-label">More context (optional)</span>
            <input
              className="field-input"
              placeholder="e.g. React + FastAPI, auth already exists"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && run()}
            />
          </div>

          <div className="ai-run">
            <button type="button" className="btn btn-primary" onClick={run} disabled={loading}>
              {loading ? "Thinking..." : <><IconSparkle size={14} /> Break down</>}
            </button>
          </div>

          {error && <p className="modal-error">{error}</p>}

          {result?.mock && (
            <p className="ai-banner">
              Demo mode — <code>GEMINI_API_KEY</code> is not set, so these results are hard-coded samples
            </p>
          )}

          {result && (
            <section className="modal-section">
              <h3 className="modal-h3">{result.summary}</h3>
              <ul className="ai-list">
                {result.subtasks.map((s, i) => (
                  <li key={`${s.title}-${i}`} className={`ai-item${picked.has(i) ? " is-picked" : ""}`}>
                    <button
                      type="button"
                      className="ai-check"
                      aria-pressed={picked.has(i)}
                      onClick={() => toggle(i)}
                    >
                      {picked.has(i) && <IconCheck size={12} />}
                    </button>

                    <div className="ai-info">
                      {editing === i ? (
                        <SubtaskForm
                          value={s}
                          onChange={(change) => patch(i, change)}
                          onDone={() => setEditing(null)}
                        />
                      ) : (
                      <>
                      {s.description ? (
                        <button
                          type="button"
                          className="ai-title is-toggle"
                          aria-expanded={openDesc.has(i)}
                          title="Show what this task covers"
                          onClick={() =>
                            setOpenDesc((cur) => {
                              const next = new Set(cur)
                              if (!next.delete(i)) next.add(i)
                              return next
                            })
                          }
                        >
                          <IconChevronDown
                            size={12}
                            className={openDesc.has(i) ? "ai-caret is-open" : "ai-caret"}
                          />
                          {s.title}
                        </button>
                      ) : (
                        <div className="ai-title">{s.title}</div>
                      )}
                      <div className="ai-chips">
                        <span className="ai-cat" style={{ color: categoryColor(s.category) }}>
                          {s.category}
                        </span>
                        {s.tags.map((t) => (
                          <span key={t} className="ai-tag">{t}</span>
                        ))}
                        <span className="ai-est">{formatDuration(s.estimateHours)}</span>
                        <span
                          className="ai-cx"
                          style={{ color: COMPLEXITIES.find((c) => c.id === s.complexity)?.color }}
                        >
                          {COMPLEXITIES.find((c) => c.id === s.complexity)?.label}
                        </span>
                      </div>
                      {s.reason && <p className="ai-reason">{s.reason}</p>}
                      {openDesc.has(i) && <p className="ai-desc">{s.description}</p>}
                      </>
                      )}
                    </div>

                    {editing !== i && (
                      <button
                        type="button"
                        className="ai-edit"
                        title="Edit this task before adding it"
                        onClick={() => setEditing(i)}
                      >
                        <IconPencil size={13} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <footer className="modal-foot">
          {result && (
            <span className="ai-total">
              {chosen.length} selected · {totalHours.toFixed(1)} h total
            </span>
          )}
          <button type="button" className="btn" onClick={onClose}>Close</button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={chosen.length === 0}
            onClick={() => { onAdd(title.trim(), chosen); onClose() }}
          >
            <IconPlus size={14} /> Add to project
          </button>
        </footer>
      </div>
    </div>
  )
}

/** ฟอร์มแก้งานย่อยหนึ่งใบ ก่อนเอาเข้าบอร์ด
 *
 * ใช้ field ชุดเดียวกับฟอร์ม "เพิ่มงานด้วยมือ" บนบอร์ด จะได้ไม่ต้องเรียนรู้สองแบบ
 */
function SubtaskForm({
  value,
  onChange,
  onDone,
}: {
  value: SubtaskSuggestion
  onChange: (change: Partial<SubtaskSuggestion>) => void
  onDone: () => void
}) {
  return (
    <div className="ai-form" onKeyDown={(e) => e.key === "Escape" && onDone()}>
      <input
        className="ai-in ai-in-title"
        value={value.title}
        autoFocus
        placeholder="Task name"
        onChange={(e) => onChange({ title: e.target.value })}
      />

      <div className="ai-form-row">
        <select
          className="ai-in"
          value={value.category}
          onChange={(e) => onChange({ category: e.target.value })}
        >
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>{c.id}</option>
          ))}
        </select>

        <select
          className="ai-in"
          value={value.complexity}
          onChange={(e) =>
            onChange({ complexity: e.target.value as SubtaskSuggestion["complexity"] })
          }
        >
          {COMPLEXITIES.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>

        <input
          className="ai-in ai-in-hours"
          type="number"
          min={0}
          step={0.5}
          value={value.estimateHours}
          placeholder="hrs"
          onChange={(e) => onChange({ estimateHours: Number(e.target.value) || 0 })}
        />
      </div>

      <input
        className="ai-in"
        value={value.tags.join(", ")}
        placeholder="Skills needed, e.g. React, PostgreSQL"
        // แยกด้วยจุลภาคหรือเว้นวรรคก็ได้ เหมือนฟอร์มเพิ่มงานบนบอร์ด
        onChange={(e) =>
          onChange({ tags: e.target.value.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean) })
        }
      />

      <textarea
        className="ai-in ai-in-desc"
        rows={3}
        value={value.description}
        placeholder="What has to be built, and what counts as done?"
        onChange={(e) => onChange({ description: e.target.value })}
      />

      <button type="button" className="ai-done" onClick={onDone}>Done</button>
    </div>
  )
}
