// 리로스쿨 화면을 읽는 부분. 로그인한 세션으로 HTML 을 받아서 필요한 것만 뽑음.
// 화면 구조는 2026-11 단대소고(dankook.riroschool.kr) 기준.
import { parseHTML } from 'npm:linkedom@0.18.15'

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36'

export type RiroFile = { name: string; url: string }
export type RiroAssessment = {
  id: string            // 리로스쿨 cate 번호
  state: string         // 대기 / 제출 / 마감
  year: number
  subject: string
  title: string
  teacher: string
  start: string         // 'YYYY-MM-DD HH:MM'
  end: string
  due: string           // 'YYYY-MM-DD' (자정 마감은 전날로)
  url: string
}
export type RiroNotice = {
  id: string            // 리로스쿨 uid
  kind: string          // 알림 / 제출 ...
  target: string
  title: string
  writer: string
  date: string          // 'YYYY-MM-DD'
  url: string
}
export type RiroDetail = { text: string; html: string; files: RiroFile[] }

// 리로스쿨 일부 화면은 EUC-KR 일 수 있어서, 머리말·meta 의 charset 을 보고 글자로 바꿈
export function decodeHtml(bytes: Uint8Array, contentType = '') {
  const head = new TextDecoder('latin1').decode(bytes.slice(0, 4096))
  const named = (contentType.match(/charset=["']?([\w-]+)/i) ?? head.match(/<meta[^>]+charset=["']?([\w-]+)/i))?.[1]?.toLowerCase()
  const label = named && /^(euc-kr|ks_c_5601-1987|cp949|x-windows-949|ksc5601)$/.test(named) ? 'euc-kr' : named
  if (label && label !== 'utf-8' && label !== 'utf8') {
    try { return new TextDecoder(label).decode(bytes) } catch { /* 모르는 이름이면 아래로 */ }
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('euc-kr').decode(bytes)
  }
}

// 첨부 대신 온 화면에서 진짜 파일 주소(자바스크립트 이동, meta refresh)를 찾음
export function redirectInHtml(html: string) {
  return html.match(/location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/i)?.[1]
    ?? html.match(/location\.replace\(\s*['"]([^'"]+)['"]/i)?.[1]
    ?? html.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]+url=([^"'>\s]+)/i)?.[1]
    ?? null
}
const alertIn = (html: string) => html.match(/alert\(\s*['"]([^'"]{1,80})['"]/)?.[1]?.replace(/\\n/g, ' ')

// Edge Function 에는 DOM 타입이 없어서 any 로 둠
// deno-lint-ignore no-explicit-any
const doc = (html: string): any => (parseHTML(html) as any).document
const clean = (s: string | null | undefined) => (s ?? '').replace(/[\u00a0\u3000]/g, ' ').replace(/\s+/g, ' ').trim()

// 본문 HTML 을 앱에서 그대로 보여 줄 안전한 HTML 로 (표·굵게·목록만 남기고 나머지 태그·속성은 다 버림)
// 글자는 모두 이스케이프하고, 허용한 태그 이름과 숫자 colspan/rowspan 만 새로 써서 만듦
const KEEP = new Set(['p', 'br', 'strong', 'b', 'u', 'em', 'i', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'ul', 'ol', 'li', 'blockquote'])
const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'img', 'svg', 'video', 'audio', 'form', 'input', 'button', 'select', 'textarea', 'noscript', 'template'])
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
// deno-lint-ignore no-explicit-any
function walk(node: any): string {
  if (node.nodeType === 3) return esc(String(node.textContent ?? '').replace(/[\u00a0\u3000]/g, ' '))
  if (node.nodeType !== 1) return ''
  const tag = String(node.tagName).toLowerCase()
  if (DROP.has(tag)) return ''
  const inner = [...node.childNodes].map(walk).join('')
  if (tag === 'br') return '<br>'
  if (tag === 'div') return `<p>${inner}</p>`
  if (/^h[1-6]$/.test(tag)) return `<p><strong>${inner}</strong></p>`
  if (!KEEP.has(tag)) return inner
  let attrs = ''
  if (tag === 'td' || tag === 'th') {
    for (const name of ['colspan', 'rowspan']) {
      const v = node.getAttribute(name)
      if (v && /^\d{1,2}$/.test(v) && v !== '1') attrs += ` ${name}="${v}"`
    }
  }
  return `<${tag}${attrs}>${inner}</${tag}>`
}
export function safeHtml(html: string) {
  const root = doc(`<div id="x">${html}</div>`).getElementById('x')
  if (!root) return ''
  const out = [...root.childNodes].map(walk).join('')
    .replace(/<p>(\s|<br>)*<\/p>/g, '')
    .replace(/(<br>\s*){3,}/g, '<br><br>')
    .trim()
  return out.length > 100_000 ? '' : out
}

// 본문 HTML 을 줄바꿈을 살린 글자로 (알림·미리보기용). 표는 한 줄에 칸을 " · " 로 이어 붙임
export function htmlToText(html: string) {
  const marked = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/t[dh]>\s*(?=<t[dh][\s>])/gi, ' · ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
  const text = doc(`<div id="x">${marked}</div>`).getElementById('x')?.textContent ?? ''
  return text
    .replace(/[\u00a0\u3000]/g, ' ')
    .split('\n')
    .map((l: string) => l.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// 학년도 Y 의 'MM-DD' → 실제 연도 (3월~12월은 Y, 1~2월은 Y+1)
function withYear(schoolYear: number, md: string) {
  const [m] = md.split('-').map(Number)
  return `${m >= 3 ? schoolYear : schoolYear + 1}-${md}`
}

// 교과 '기타'·'예체' 는 제목 앞 [과목명] 을 과목으로 씀
function subjectOf(raw: string, title: string) {
  if (!['기타', '예체', ''].includes(raw)) return raw
  const m = title.match(/^\s*\[([^\]]+)\]/) ?? title.match(/^\s*\(([^)]+)\)/)
  if (!m) return raw || '기타'
  return m[1].replace(/^\s*\d학년\s*/, '').replace(/\(.*?\)/g, '').trim() || raw
}

// 수행평가 목록 (portfolio.php?db=...)
export function parseAssessmentList(html: string, base: string): RiroAssessment[] {
  const out: RiroAssessment[] = []
  for (const tr of doc(html).querySelectorAll('.rd_board table tr')) {
    const link = tr.querySelector('td.tit a.txt')
    const tds = tr.querySelectorAll('td')
    if (!link || tds.length < 8) continue
    const href = link.getAttribute('href') ?? ''
    const id = href.match(/[?&]cate=(\d+)/)?.[1]
    if (!id) continue
    // "2026년 1학년  국어  - 말하기 수행평가"
    const full = clean(link.textContent)
    const cut = full.indexOf(' - ')
    const head = cut >= 0 ? full.slice(0, cut) : ''
    const title = (cut >= 0 ? full.slice(cut + 3) : full).trim()
    const year = Number(head.match(/(\d{4})년/)?.[1] ?? new Date().getFullYear())
    const raw = head.replace(/\d{4}년/, '').replace(/(\d학년|전학년)/, '').trim()
    const dates = [...tr.querySelectorAll('td.robo')].pop()?.innerHTML ?? ''
    const md = [...dates.matchAll(/(\d{2}-\d{2}) (\d{2}:\d{2}):\d{2}/g)]
    if (md.length < 2) continue
    const start = `${withYear(year, md[0][1])} ${md[0][2]}`
    const end = `${withYear(year, md[1][1])} ${md[1][2]}`
    let due = end.slice(0, 10)
    if (md[1][2] === '00:00') {
      const d = new Date(`${due}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() - 1)
      due = d.toISOString().slice(0, 10)
    }
    out.push({
      id,
      state: clean(tr.querySelector('td.state')?.textContent),
      year,
      subject: subjectOf(raw, title),
      title,
      teacher: clean(tds[5]?.textContent),
      start,
      end,
      due,
      url: new URL(href, base).href
    })
  }
  return out
}

// 다른 반 전용 과제는 뺌: 제목에 "(1-3)" 처럼 반이 적혀 있는데 우리 반이 아니면 false
// "(1-3)", "1-3반", "1학년 3반" 처럼 적힌 반을 찾음
export function forClass(title: string, grade: number | null, classNo: number | null) {
  if (!grade || !classNo) return true
  const found = [
    ...title.matchAll(/\((\d)\s*-\s*(\d{1,2})\)/g),
    ...title.matchAll(/(\d)\s*-\s*(\d{1,2})\s*반/g),
    ...title.matchAll(/(\d)\s*학년\s*(\d{1,2})\s*반/g)
  ]
  if (!found.length) return true
  return found.some((m) => Number(m[1]) === grade && Number(m[2]) === classNo)
}

// 과제 제출 목록 화면(portfolio.php?action=list)의 반 고르기 칸 = 이 과제를 받는 반들 (예: ['101', '102'])
export function parseTargetClasses(html: string): string[] {
  const options = doc(html).querySelectorAll('select[name="cls"] option')
  return [...options].map((o: { getAttribute(n: string): string | null }) => o.getAttribute('value') ?? '')
    .filter((v: string) => /^\d{3,4}$/.test(v))
}

// 수행평가 공지·첨부 (portfolio.php?action=write_form 이나 set_view)
export function parseAssessmentDetail(html: string, base: string, db: string, cate: string): RiroDetail | null {
  const d = doc(html)
  const box = d.querySelector('.noti_box .txt_content') ?? d.querySelector('.txt_content')
  const links = d.querySelectorAll('.attched_file a.btn_file, .write_file_list a.btn_file')
  if (!box && !links.length) return null
  const files: RiroFile[] = []
  for (const a of links) {
    // javascript:bL('down','00&num=1572',0,'67bb8e...')
    const m = (a.getAttribute('href') ?? '').match(/bL\('down','([^']*)',(\d+),'([0-9a-f]+)'\)/)
    if (!m) continue
    const tip = a.querySelector('.ellipsisText')?.getAttribute('data-tooltip') ?? ''
    const name = clean(tip.includes(' / ') ? tip.slice(tip.indexOf(' / ') + 3) : a.querySelector('.ellipsisText')?.textContent)
    const q = `?club=index&action=down&db=${db}&page=1&cate=${cate}&cls=&my_cate=&sort=&uid=${m[1]}&file_num=${m[2]}&file_code=${m[3]}`
    files.push({ name, url: new URL(`portfolio.php${q}`, base).href })
  }
  return { text: box ? htmlToText(box.innerHTML) : '', html: box ? safeHtml(box.innerHTML) : '', files }
}

// 가정통신문 목록 (board_msg.php?db=...)
export function parseNoticeList(html: string, base: string, db: string): RiroNotice[] {
  const out: RiroNotice[] = []
  for (const tr of doc(html).querySelectorAll('.rd_board table tr')) {
    const a = tr.querySelector('a[href^="javascript:bL(1,"]')
    const tds = tr.querySelectorAll('td')
    if (!a || tds.length < 8) continue
    const id = (a.getAttribute('href') ?? '').match(/bL\(1,(\d+),/)?.[1]
    const date = clean(tds[7].textContent).match(/\d{4}-\d{2}-\d{2}/)?.[0]
    if (!id || !date) continue
    out.push({
      id,
      kind: clean(tds[1].textContent),
      target: clean(tds[2].textContent),
      title: clean(a.textContent),
      writer: clean(tds[5].textContent),
      date,
      url: new URL(`board_msg.php?club=index&action=view&db=${db}&uid=${id}`, base).href
    })
  }
  return out
}

// 가정통신문 본문·첨부 (board_msg.php?action=view)
export function parseNoticeDetail(html: string, base: string): RiroDetail & { posted: string | null } {
  const d = doc(html)
  const view = d.querySelector('.view_table')
  const body = view?.querySelector('.ckeditor_view')
  const files: RiroFile[] = []
  for (const a of view?.querySelectorAll('a[href*="action=down"]') ?? []) {
    const q = (a.getAttribute('href') ?? '').match(/'(\?[^']*action=down[^']*)'/)?.[1]
    if (!q) continue
    const name = clean(a.textContent).replace(/^\d+\.\s*/, '')
    files.push({ name, url: new URL(`board_msg.php${q.replace(/&amp;/g, '&')}`, base).href })
  }
  const head = clean(view?.querySelector('.view_header_right')?.textContent)
  const posted = head.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)?.[0] ?? null
  return { text: body ? htmlToText(body.innerHTML) : '', html: body ? safeHtml(body.innerHTML) : '', files, posted }
}

// 사용자가 넣은 학교 리로스쿨 주소를 'https://xxx.riroschool.kr/' 로. 리로스쿨이 아닌 주소는 null
// (예: dankook, dankook.riroschool.kr, https://dankook.riroschool.kr/index.php)
export function normalizeBase(input: string) {
  const m = input.trim().toLowerCase().match(/^(?:https?:\/\/)?([a-z0-9][a-z0-9-]{0,40})(?:\.riroschool\.kr)?(?:\/[^\s]*)?$/)
  if (!m || m[1] === 'www') return null
  return `https://${m[1]}.riroschool.kr/`
}

// 메뉴에서 교과활동(수행평가)·가정통신문 게시판 번호를 찾음
export function parseMenu(html: string) {
  const items = [...html.matchAll(/menuAction\('\/(portfolio|board_msg)\.php\?db=(\d+)'\s*,\s*''\);?"[^>]*>\s*(?:<img[^>]*>)?\s*([^<]+)</g)]
    .map((m) => ({ kind: m[1], db: m[2], name: m[3].replace(/\s+/g, ' ').trim() }))
  const find = (kind: string, words: string[]) => {
    for (const w of words) {
      const hit = items.find((i) => i.kind === kind && i.name.includes(w))
      if (hit) return hit.db
    }
    return null
  }
  return {
    assessDb: find('portfolio', ['교과활동', '수행평가', '교과']),
    noticeDb: find('board_msg', ['가정통신문', '가정통신', '통신문'])
  }
}

// ── 로그인 세션 ─────────────────────────────────────────────
export class RiroSession {
  private jar = new Map<string, string>()
  constructor(readonly base: string) {}

  private keep(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';')
      const i = pair.indexOf('=')
      const name = pair.slice(0, i).trim()
      const value = pair.slice(i + 1).trim()
      const expired = attrs.some((a) => /max-age=0\b/i.test(a)) || attrs.some((a) => {
        const e = a.match(/expires=(.*)/i)?.[1]
        return e ? new Date(e).getTime() < Date.now() : false
      })
      if (!value || value === 'deleted' || expired) this.jar.delete(name)
      else this.jar.set(name, value)
    }
  }

  async request(path: string, init: RequestInit = {}, referer = this.base): Promise<Response> {
    let url = new URL(path, this.base).href
    let opts: RequestInit = init
    for (let hop = 0; hop < 6; hop++) {
      const headers = new Headers(opts.headers)
      headers.set('User-Agent', UA)
      headers.set('Referer', referer)
      if (this.jar.size) headers.set('Cookie', [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '))
      const res = await fetch(url, { ...opts, headers, redirect: 'manual', signal: AbortSignal.timeout(20_000) })
      this.keep(res)
      const loc = res.headers.get('location')
      if (res.status >= 300 && res.status < 400 && loc) {
        await res.body?.cancel()
        url = new URL(loc, url).href
        opts = { method: 'GET' }
        continue
      }
      return res
    }
    throw new Error('리로스쿨이 너무 여러 번 다른 주소로 보냈어요')
  }

  async page(path: string) {
    const res = await this.request(path)
    const html = decodeHtml(new Uint8Array(await res.arrayBuffer()), res.headers.get('content-type') ?? '')
    if (!res.ok) throw new Error(`리로스쿨 응답 ${res.status}`)
    if (html.includes('signin_form')) throw new Error('리로스쿨 로그인이 풀렸어요')
    return html
  }

  async login(id: string, pw: string) {
    // 첫 화면에서 쿠키를 받아 둠
    await (await this.request('user.php?action=signin')).body?.cancel()
    const res = await this.request('ajax.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' },
      body: new URLSearchParams({ app: 'user', mode: 'login', userType: '1', id, pw, deeplink: '', redirect_link: '' })
    })
    const out = await res.json().catch(() => null)
    if (out?.data?.otp == 1) throw new LoginError('리로스쿨 계정에 2단계 인증(OTP)이 켜져 있어 자동 로그인을 할 수 없어요')
    if (out?.code !== '000') {
      const msg = String(out?.msg ?? '').replace(/\\r|\\n|\r|\n/g, ' ').trim()
      throw new LoginError(`리로스쿨 로그인 실패${msg ? `: ${msg}` : ''}`)
    }
    // 로그인 뒤 첫 화면 (메뉴에서 게시판 번호를 찾을 때 씀)
    if (!out?.data?.url) return ''
    const landing = await this.request(out.data.url)
    return decodeHtml(new Uint8Array(await landing.arrayBuffer()), landing.headers.get('content-type') ?? '')
  }

  // referer: 첨부가 있던 화면 주소 (리로스쿨이 어디서 눌렀는지 확인할 때가 있음)
  async download(url: string, referer?: string, hop = 0): Promise<Uint8Array> {
    const res = await this.request(url, {}, referer ?? this.base)
    if (!res.ok) throw new Error(`첨부 받기 실패 (응답 ${res.status})`)
    const type = res.headers.get('content-type') ?? ''
    const bytes = new Uint8Array(await res.arrayBuffer())
    const looksHtml = type.includes('text/html') ||
      /^\s*<(!doctype|html|script|head|meta)/i.test(new TextDecoder('latin1').decode(bytes.slice(0, 200)))
    if (!looksHtml) return bytes
    const html = decodeHtml(bytes, type)
    const next = redirectInHtml(html)
    if (next && hop < 2) return this.download(new URL(next, url).href, url, hop + 1)
    if (html.includes('signin_form')) throw new Error('첨부 받는 중 로그인이 풀렸어요')
    throw new Error(`첨부 대신 화면이 왔어요${alertIn(html) ? `: ${alertIn(html)}` : ''}`)
  }
}

export class LoginError extends Error {}
