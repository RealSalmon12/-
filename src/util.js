const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

// 한국 시간 기준 오늘 'YYYY-MM-DD'
export function today() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}

export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00Z')
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`
}

export function dday(iso) {
  const diff = Math.round((new Date(iso) - new Date(today())) / 86400000)
  if (diff === 0) return 'D-DAY'
  return diff > 0 ? `D-${diff}` : `D+${-diff}`
}

// 사진을 긴 변 1600px, JPEG 80% 로 줄여서 용량을 아낌
export async function compressImage(file, maxSide = 1600, quality = 0.8) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

// "닭갈비 (1.5.6.)" -> { name: '닭갈비', allergies: '1.5.6' }
// 학교마다 붙이는 표시 기호(★ 학교 표시, # 수제, * 등)
const MARKS = /[★☆*#@※♥♡◆◇●○■□▲△▶◎♣♠♧♤]/g

// '팽이버섯장국★ (5.6.13.)' 같은 NEIS 메뉴 이름에서 기호와 알레르기 번호를 떼어 냄
export function parseDish(dish) {
  let name = dish
  let allergies = ''
  const take = (re) => {
    const m = name.match(re)
    if (!m) return
    allergies = m[1].replace(/\s/g, '').replace(/\.$/, '')
    name = name.replace(re, '')
  }
  take(/\s*\(([\d.\s]+)\)\s*/)
  if (!allergies) take(/(?<=\D)\s*(\d{1,2}(?:\.\d{1,2})*\.)\s*$/)
  name = name.replace(MARKS, '').replace(/\s+/g, ' ').trim()
  return { name: name || dish.trim(), allergies }
}

// 남은 날짜를 숫자로 (오늘 0, 내일 1, 지난 날은 음수)
export function daysLeft(iso) {
  return Math.round((new Date(iso) - new Date(today())) / 86400000)
}

// '10.27 화' 처럼 짧은 날짜
export function shortDate(iso) {
  const d = new Date(iso + 'T00:00:00Z')
  return `${d.getUTCMonth() + 1}.${d.getUTCDate()} ${WEEKDAYS[d.getUTCDay()]}`
}

// 그 주 월요일 'YYYY-MM-DD'
export function mondayOf(iso) {
  const d = new Date(iso + 'T00:00:00Z')
  const back = (d.getUTCDay() + 6) % 7
  return addDays(iso, -back)
}

export const KINDS = ['발표', '서술형', '실기', '보고서·제출', '프로젝트', '토론', '기타']
