// 화면 밝기: 이 기기에만 저장. 기본은 밝게
export const THEMES = [
  { id: 'light', name: '밝게' },
  { id: 'dark', name: '어둡게' },
  { id: 'auto', name: '휴대폰 따라' }
]
const KEY = 'bacoclass-theme'
const darkQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null

export function getTheme() {
  try {
    const s = localStorage.getItem(KEY)
    if (THEMES.some((x) => x.id === s)) return s
  } catch { /* 저장소를 못 쓰면 기본 */ }
  return 'light'
}

export function applyTheme(id) {
  const dark = id === 'dark' || (id === 'auto' && darkQuery?.matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f1420' : '#e9edf3')
}

export function setTheme(id) {
  try { localStorage.setItem(KEY, id) } catch { /* 이번만 적용 */ }
  applyTheme(id)
}

// '휴대폰 따라'일 때 휴대폰 설정이 바뀌면 바로 따라감
darkQuery?.addEventListener?.('change', () => { if (getTheme() === 'auto') applyTheme('auto') })
