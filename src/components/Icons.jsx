// 하단 탭과 버튼에 쓰는 선 아이콘 (currentColor 사용)
const base = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }

export const HomeIcon = () => (
  <svg {...base}><path d="M4 10.5 12 4l8 6.5V20H4z" /><path d="M10 20v-5h4v5" /></svg>
)
export const PencilIcon = () => (
  <svg {...base}><path d="M5 19h4L19.5 8.5a2.1 2.1 0 0 0-3-3L6 16z" /><path d="M14.5 7.5l2 2" /></svg>
)
export const PaperIcon = () => (
  <svg {...base}><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M10 12h5M10 16h5" /></svg>
)
export const TrayIcon = () => (
  <svg {...base}><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 11h18M10 11v8M9 5v6M15 5v6" /></svg>
)
export const PlusIcon = () => (
  <svg {...base} width="20" height="20"><path d="M12 5v14M5 12h14" /></svg>
)
