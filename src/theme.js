// 강조색: 이 기기에만 저장. 기본은 파랑
export const ACCENTS = [
  { id: 'blue', name: '파랑', color: '#3366f0' },
  { id: 'green', name: '초록', color: '#14a06a' },
  { id: 'purple', name: '보라', color: '#7a5af0' },
  { id: 'black', name: '검정', color: '#25282e' }
]
const KEY = 'bacoclass-accent'

export function getAccent() {
  try {
    const s = localStorage.getItem(KEY)
    if (ACCENTS.some((x) => x.id === s)) return s
  } catch { /* 저장소를 못 쓰면 기본 */ }
  return 'blue'
}

export function applyAccent(id) {
  document.documentElement.dataset.accent = id
}

export function setAccent(id) {
  try { localStorage.setItem(KEY, id) } catch { /* 이번만 적용 */ }
  applyAccent(id)
}
