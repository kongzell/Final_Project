/** ไอคอน SVG แบบ inline — ไม่ต้องลง icon library เพิ่ม */
import type { ReactNode } from "react"

type P = { size?: number; className?: string }

const svg = (path: ReactNode, size: number, className?: string) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {path}
  </svg>
)

export const IconSearch = ({ size = 16, className }: P) =>
  svg(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>, size, className)

export const IconFilter = ({ size = 16, className }: P) =>
  svg(<path d="M3 5h18M6 12h12M10 19h4" />, size, className)

export const IconChevronLeft = ({ size = 16, className }: P) =>
  svg(<path d="m14 6-6 6 6 6" />, size, className)

export const IconChevronDown = ({ size = 16, className }: P) =>
  svg(<path d="m6 9 6 6 6-6" />, size, className)

export const IconPlus = ({ size = 16, className }: P) =>
  svg(<path d="M12 5v14M5 12h14" />, size, className)

export const IconDots = ({ size = 16, className }: P) =>
  svg(<><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></>, size, className)

export const IconUser = ({ size = 16, className }: P) =>
  svg(<><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" /></>, size, className)

export const IconUsers = ({ size = 16, className }: P) =>
  svg(<><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c0-3.2 2.9-5.3 6.5-5.3s6.5 2.1 6.5 5.3" /><path d="M17 5.3a3.2 3.2 0 0 1 0 6" /><path d="M18.5 14.9c2 .7 3.5 2.3 3.5 5.1" /></>, size, className)

export const IconCalendar = ({ size = 16, className }: P) =>
  svg(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>, size, className)

export const IconFlag = ({ size = 16, className }: P) =>
  svg(<><path d="M5 21V4" /><path d="M5 5h12l-2.5 4L17 13H5" /></>, size, className)

export const IconCheck = ({ size = 16, className }: P) =>
  svg(<path d="m4 12 5.5 5.5L20 7" />, size, className)

export const IconClose = ({ size = 16, className }: P) =>
  svg(<path d="M6 6l12 12M18 6 6 18" />, size, className)

export const IconTaskList = ({ size = 16, className }: P) =>
  svg(<><path d="m3 6 2 2 3-3.5" /><path d="m3 14 2 2 3-3.5" /><path d="M12 6h9M12 15h9" /></>, size, className)

export const IconStar = ({ size = 16, className }: P) =>
  svg(<path d="m12 4 2.4 5 5.6.7-4 3.9 1 5.4L12 16.4 7 19l1-5.4-4-3.9 5.6-.7z" />, size, className)

export const IconFolder = ({ size = 16, className }: P) =>
  svg(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />, size, className)

export const IconFile = ({ size = 16, className }: P) =>
  svg(<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></>, size, className)

export const IconDownload = ({ size = 16, className }: P) =>
  svg(<><path d="M12 4v12" /><path d="m7 11 5 5 5-5" /><path d="M5 20h14" /></>, size, className)

export const IconUpload = ({ size = 16, className }: P) =>
  svg(<><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M5 20h14" /></>, size, className)

export const IconLink = ({ size = 16, className }: P) =>
  svg(<><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></>, size, className)

export const IconTrash = ({ size = 16, className }: P) =>
  svg(<><path d="M4 7h16M9 7V5h6v2" /><path d="M6 7v13h12V7" /><path d="M10 11v6M14 11v6" /></>, size, className)

export const IconPalette = ({ size = 16, className }: P) =>
  svg(<><path d="M12 3a9 9 0 0 0 0 18c1.1 0 1.8-.9 1.8-1.8 0-1.5 1.2-1.9 2.2-1.9h1.4A3.6 3.6 0 0 0 21 13.7 9 9 0 0 0 12 3z" /><circle cx="7.5" cy="12" r="1.1" fill="currentColor" stroke="none" /><circle cx="9.8" cy="8" r="1.1" fill="currentColor" stroke="none" /><circle cx="14.4" cy="7.6" r="1.1" fill="currentColor" stroke="none" /></>, size, className)

export const IconChevronRight = ({ size = 16, className }: P) =>
  svg(<path d="m10 6 6 6-6 6" />, size, className)

export const IconPencil = ({ size = 16, className }: P) =>
  svg(<><path d="M4 20h4l10-10-4-4L4 16z" /><path d="m14 6 4 4" /></>, size, className)

export const IconSparkle = ({ size = 16, className }: P) =>
  svg(<><path d="M12 3.5 13.7 9l5.3 1.8-5.3 1.7L12 18l-1.7-5.5L5 10.8 10.3 9z" /><path d="M18.5 3v3M20 4.5h-3" /></>, size, className)

export const IconLayers = ({ size = 16, className }: P) =>
  svg(<><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 14 9 5 9-5" /></>, size, className)

export const IconGithub = ({ size = 16, className }: P) =>
  svg(<path d="M9 19c-4 1.2-4-2.2-5.5-2.6M15 21v-3.4c0-1 .1-1.4-.5-2 2.3-.3 4.5-1.2 4.5-5a3.9 3.9 0 0 0-1-2.7 3.6 3.6 0 0 0-.1-2.7s-.9-.3-2.9 1.1a10 10 0 0 0-5 0C7.5 2.9 6.6 3.2 6.6 3.2a3.6 3.6 0 0 0-.1 2.7A3.9 3.9 0 0 0 5.5 8.6c0 3.8 2.2 4.7 4.5 5-.6.6-.6 1.2-.5 2V21" />, size, className)

export const IconHand = ({ size = 16, className }: P) =>
  svg(<><path d="M8 11V5.5a1.5 1.5 0 0 1 3 0V11" /><path d="M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5" /><path d="M14 10.5V6a1.5 1.5 0 0 1 3 0v7" /><path d="M8 11V9a1.5 1.5 0 0 0-3 0v5a7 7 0 0 0 7 7h1a6 6 0 0 0 6-6v-2" /></>, size, className)
