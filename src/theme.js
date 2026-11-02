// 계절 테마: 이 기기에만 저장. 기본은 겨울(포근한 눈)
export const SEASONS = [
  { id: 'spring', name: '봄', note: '벚꽃', color: '#b0476b' },
  { id: 'summer', name: '여름', note: '푸른 잎', color: '#2f7a45' },
  { id: 'autumn', name: '가을', note: '단풍', color: '#a4471f' },
  { id: 'winter', name: '겨울', note: '포근한 눈', color: '#5b3a2e' }
]
const KEY = 'bacoclass-season'

export function getSeason() {
  try {
    const s = localStorage.getItem(KEY)
    if (SEASONS.some((x) => x.id === s)) return s
  } catch { /* 저장소를 못 쓰면 기본 테마 */ }
  return 'winter'
}

export function applySeason(id) {
  document.documentElement.dataset.season = id
  // 휴대폰 위쪽 상태 표시줄 색
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', SEASONS.find((s) => s.id === id).color)
}

export function setSeason(id) {
  try { localStorage.setItem(KEY, id) } catch { /* 이번만 적용 */ }
  applySeason(id)
}
