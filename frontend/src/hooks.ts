import { useEffect } from "react"

/** กด Esc แล้วเรียก onEscape — ใช้ปิด modal ทุกตัวให้เหมือนกัน */
export function useEscape(onEscape: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onEscape()
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onEscape])
}
