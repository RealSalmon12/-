// NEIS 에서 학교 검색, 급식, 시간표, 학사일정을 가져와 캐시해 두고 돌려주는 Edge Function.
// 처음엔 급식만 했어서 이름이 meals 이지만, body 의 type 으로 모두 처리함.
// 학교는 body 의 office(교육청 코드), school(학교 코드), schoolName, kind 로 받고,
// 없으면 처음 쓰던 단국대학교부속소프트웨어고등학교를 씀.
// 필요한 시크릿: NEIS_API_KEY (open.neis.go.kr 에서 발급)
// 시간표는 이번 주 것이면 컴시간알리미(교체·보강까지 바로 반영)에서 먼저 가져오고, 안 되면 NEIS.
import { createClient } from 'npm:@supabase/supabase-js@2'
import iconv from 'npm:iconv-lite@0.6.3'
import { Buffer } from 'node:buffer'

const DEFAULT_SCHOOL = { office: 'B10', name: '단국대학교부속소프트웨어고등학교', kind: '고등학교' }
const TIMETABLE_SERVICE: Record<string, string> = {
  초등학교: 'elsTimetable', 중학교: 'misTimetable', 고등학교: 'hisTimetable', 특수학교: 'spsTimetable'
}
const NEIS = 'https://open.neis.go.kr/hub'
const CACHE_HOURS = 12

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

const key = Deno.env.get('NEIS_API_KEY') ?? ''

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

async function neis(service: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ KEY: key, Type: 'json', pIndex: '1', pSize: '1000', ...params })
  const res = await fetch(`${NEIS}/${service}?${qs}`)
  const body = await res.json()
  // 자료가 없으면 { RESULT: { CODE: 'INFO-200' } } 형태로 옴
  return body[service]?.[1]?.row ?? []
}

type School = { office: string; code: string; kind: string; name: string }
const codeByName = new Map<string, string>()

// body 에서 학교를 정하고, 학교 코드가 없으면 이름으로 찾아 둠
async function resolveSchool(body: Record<string, string>): Promise<School> {
  const office = body.office || DEFAULT_SCHOOL.office
  const name = body.schoolName || DEFAULT_SCHOOL.name
  const kind = body.kind || DEFAULT_SCHOOL.kind
  let code = body.school || codeByName.get(office + name) || ''
  if (!code) {
    const rows = await neis('schoolInfo', { ATPT_OFCDC_SC_CODE: office, SCHUL_NM: name })
    if (!rows.length) throw new Error('학교 코드를 찾지 못했어요')
    code = rows[0].SD_SCHUL_CODE
    codeByName.set(office + name, code)
  }
  return { office, code, kind, name }
}

async function searchSchools(query: string) {
  if (!query || query.trim().length < 2) throw new Error('학교 이름을 두 글자 이상 적어 주세요')
  const rows = await neis('schoolInfo', { SCHUL_NM: query.trim(), pSize: '30' })
  return rows.map((r: Record<string, string>) => ({
    office: r.ATPT_OFCDC_SC_CODE,
    officeName: r.ATPT_OFCDC_SC_NM,
    code: r.SD_SCHUL_CODE,
    name: r.SCHUL_NM,
    kind: r.SCHUL_KND_SC_NM,
    address: r.ORG_RDNMA ?? ''
  }))
}

const ymd = (d: string) => d.replaceAll('-', '')
const isoDate = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
const isFresh = (t: string) => Date.now() - new Date(t).getTime() < CACHE_HOURS * 3600_000

// 시간표는 아침마다 새로 받음: 한국 시간 오전 6시가 지나면 그 전에 받아 둔 건 버림
// (전날 밤에 받아 둔 시간표가 다음 날 아침에도 그대로 보이던 문제)
const MORNING_HOUR_KST = 6
function lastMorning() {
  const kst = Date.now() + 9 * 3600_000
  const day = 86400_000
  const sinceMorning = (kst - MORNING_HOUR_KST * 3600_000) % day
  return Date.now() - sinceMorning
}
const isFreshToday = (t: string) => isFresh(t) && new Date(t).getTime() >= lastMorning()

function meals(from: string, to: string, sc: School) {
  return cached(`meals:${sc.code}:${from}:${to}`, async () => {
    const rows = await neis('mealServiceDietInfo', {
      ATPT_OFCDC_SC_CODE: sc.office,
      SD_SCHUL_CODE: sc.code,
      MLSV_FROM_YMD: ymd(from),
      MLSV_TO_YMD: ymd(to)
    })
    return rows.map((r: Record<string, string>) => ({
      meal_date: isoDate(r.MLSV_YMD),
      meal_type: r.MMEAL_SC_NM,
      dishes: r.DDISH_NM.split(/<br\s*\/?>/i).map((s) => s.trim()).filter(Boolean),
      calories: r.CAL_INFO ?? null
    }))
  })
}

// 같은 요청은 neis_cache 에 저장해 두고 12시간 동안 다시 씀 (fresh 로 기준을 바꿀 수 있음)
async function cached<T>(cacheKey: string, load: () => Promise<T>, fresh = isFresh): Promise<T> {
  const { data } = await admin.from('neis_cache').select('*').eq('key', cacheKey).maybeSingle()
  if (data && fresh(data.fetched_at)) return data.data as T
  const loaded = await load()
  await admin.from('neis_cache').upsert({ key: cacheKey, data: loaded, fetched_at: new Date().toISOString() })
  return loaded
}

async function timetable(from: string, to: string, grade: number, classNo: number, sc: School) {
  if (!grade || !classNo) throw new Error('반 관리에서 학년과 반 번호를 먼저 정해 주세요')
  // 이번 주면 컴시간알리미 먼저. 학교를 못 찾거나 사이트가 바뀌어 실패하면 아래 NEIS 로
  let why = ''
  try {
    const rows = await comciTimetable(from, to, grade, classNo, sc)
    if (rows) return rows
  } catch (e) {
    why = String((e as Error).message ?? e)
    console.error('컴시간알리미 실패, NEIS 로 대신함:', why)
  }
  // 화면에 어디서 가져왔는지(그리고 컴시간알리미가 왜 안 됐는지) 보여줄 수 있게 붙여 둠
  const rows = await neisTimetable(from, to, grade, classNo, sc)
  return rows.map((r: Record<string, unknown>) => ({ ...r, src: 'neis', why }))
}

function neisTimetable(from: string, to: string, grade: number, classNo: number, sc: School) {
  const service = TIMETABLE_SERVICE[sc.kind] ?? 'hisTimetable'
  return cached(`timetable:${sc.code}:${grade}-${classNo}:${from}:${to}`, async () => {
    const rows = await neis(service, {
      ATPT_OFCDC_SC_CODE: sc.office,
      SD_SCHUL_CODE: sc.code,
      GRADE: String(grade),
      CLASS_NM: String(classNo),
      TI_FROM_YMD: ymd(from),
      TI_TO_YMD: ymd(to)
    })
    return rows.map((r: Record<string, string>) => ({
      date: isoDate(r.ALL_TI_YMD),
      period: Number(r.PERIO),
      subject: (r.ITRT_CNTNT ?? '').replace(/^-/, '').trim()
    }))
  }, isFreshToday)
}

// ───── 컴시간알리미 ─────
// 공식 API 가 없어서, 컴시간알리미 웹페이지가 쓰는 주소를 그대로 따라 함 (comcigan.ts 라이브러리와 같은 방식).
// 페이지가 바뀌면 실패할 수 있고, 그러면 NEIS 로 넘어감.
const COMCI = 'http://comci.net:4082'
const COMCI_MINUTES = 20 // 교체가 자주 생기니 짧게 캐시
const comciHeaders = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' }

type ComciRoutes = {
  main: string; search: string; timetable: string
  // 아래 넷은 페이지에서 못 찾으면 null → 시간표 자료 모양으로 추측함
  teacher: string | null; original: string | null; day: string | null; subject: string | null
  note: string
}
let comciRoutes: { at: number; v: ComciRoutes } | null = null

async function getComciRoutes(): Promise<ComciRoutes> {
  if (comciRoutes && Date.now() - comciRoutes.at < 3600_000) return comciRoutes.v
  const res = await fetch(`${COMCI}/st`, { headers: comciHeaders })
  // Supabase 함수 환경의 TextDecoder 는 euc-kr 을 못 읽어서 한글이 깨짐 → iconv 로 읽음
  const html = iconv.decode(Buffer.from(await res.arrayBuffer()), 'euc-kr')
  const must = (re: RegExp, what: string) => {
    const m = re.exec(html)
    if (!m) throw new Error(`컴시간알리미 페이지에서 ${what} 를 못 찾음 (페이지 ${html.length}자)`)
    return m[0]
  }
  const may = (re: RegExp) => re.exec(html)?.[0] ?? null
  const v: ComciRoutes = {
    main: must(/(?<=\.\/)\d+(?=\?\d+l)/, 'main'),
    search: must(/(?<=\?)\d+(?=l)/, 'search'),
    timetable: must(/(?<=')\d+(?=_')/, 'timetable'),
    teacher: may(/(?<=성명\s*=\s*자료\.자료)\d+/),
    original: may(/(?<=원자료\s*=\s*Q자료\(자료.자료)\d+/),
    day: may(/(?<=일일자료\s*=\s*Q자료\(자료.자료)\d+/),
    subject: may(/(?<=자료.자료)\d+(?=\[sb\])/),
    // 못 찾았을 때 원인을 보려고 페이지 일부를 남겨 둠
    note: `한글 ${/[가-힣]/.test(html) ? '있음' : '없음'}, 자료 참조: ${[...new Set(html.match(/.{0,8}자료\.자료\d+.{0,6}/g) ?? [])].slice(0, 6).join(' | ')}`
  }
  comciRoutes = { at: Date.now(), v }
  return v
}

async function comciJson(path: string) {
  const res = await fetch(`${COMCI}/${path}`, { headers: comciHeaders })
  if (!res.ok) throw new Error(`컴시간알리미 응답 ${res.status}`)
  return JSON.parse((await res.text()).replace(/\0+$/, ''))
}

const squash = (s: string) => s.replace(/\s/g, '')

// 학교 이름 비교용: 띄어쓰기 빼고, 컴시간알리미가 자주 쓰는 줄임말로 맞춤
// 예) 단국대학교부속소프트웨어고등학교 → 단국대부속소프트웨어고
const normName = (s: string) => squash(s)
  .replace(/고등학교$/, '고').replace(/중학교$/, '중').replace(/초등학교$/, '초').replace(/학교$/, '')
  .replace(/대학교/g, '대').replace(/사범대학/g, '사대').replace(/부설/g, '부속').replace(/부속/g, '부')

async function comciSearch(q: string) {
  const r = await getComciRoutes()
  const encoded = [...iconv.encode(q, 'euc-kr')].map((b) => '%' + b.toString(16).padStart(2, '0')).join('')
  const { 학교검색: list = [] } = await comciJson(`${r.main}?${r.search}l${encoded}`) as { 학교검색?: [number, string, string, number][] }
  return list
}

// NEIS 학교 이름으로 컴시간알리미 학교 코드를 찾음 (한 번 찾으면 저장해 둠)
async function comciSchoolCode(name: string): Promise<number> {
  const cacheKey = `comci-school2:${name}`
  const { data } = await admin.from('neis_cache').select('*').eq('key', cacheKey).maybeSingle()
  if (data?.data?.code) return data.data.code
  const want = normName(name)
  const plain = squash(name)
  // 긴 이름은 컴시간알리미에 줄임말로 있어서 검색이 안 될 수 있으니 점점 짧게 검색
  const queries = [...new Set([plain, want, plain.slice(0, 4), plain.slice(0, 2)])].filter((q) => q.length >= 2)
  const seen: string[] = []
  for (const q of queries) {
    const list = await comciSearch(q)
    seen.push(...list.map((x) => x[2]))
    const hit = list.find((x) => normName(x[2]) === want)
      ?? list.find((x) => { const n = normName(x[2]); return n.length >= 3 && (want.includes(n) || n.includes(want)) })
    if (hit) {
      await admin.from('neis_cache').upsert({ key: cacheKey, data: { code: hit[3], name: hit[2] }, fetched_at: new Date().toISOString() })
      return hit[3]
    }
  }
  throw new Error(`컴시간알리미에서 '${name}' 학교를 못 찾음${seen.length ? ` (검색 결과: ${[...new Set(seen)].slice(0, 5).join(', ')})` : ''}`)
}

type Grid = number[][][][]
const sameName = (a: string, b: string) => { const x = squash(a), y = squash(b); return !!x && !!y && (x.includes(y) || y.includes(x)) }

type Parts = {
  teachers: string[]; subjects: string[]; now: Grid; original: Grid
  subjectNo: (v: number) => number; teacherNo: (v: number) => number
  how: string
}

// 칸 값에 과목번호와 교사번호가 합쳐져 있음. 자료.분리 가 100 이면 옛 방식(교사*100+과목), 아니면 과목*분리+교사
function splitter(sep: number): Pick<Parts, 'subjectNo' | 'teacherNo'> {
  return sep === 100
    ? { subjectNo: (v) => v % 100, teacherNo: (v) => Math.floor(v / 100) }
    : { subjectNo: (v) => Math.floor(v / sep), teacherNo: (v) => v % sep }
}

// 페이지에서 자료 번호를 다 찾았을 때 (comcigan.ts 와 같은 방식)
function fromRoutes(data: Record<string, unknown>, r: ComciRoutes): Parts {
  const teachers = data[`자료${r.teacher}`] as string[]
  const subjects = data[`자료${r.subject}`] as string[]
  const now = data[`자료${r.day}`] as Grid
  const original = data[`자료${r.original}`] as Grid
  if (!Array.isArray(subjects) || !Array.isArray(now)) throw new Error('컴시간알리미 자료 모양이 달라짐')
  const sep = Number(data['분리']) || 10 ** (Math.floor(Math.log10(Math.max(teachers?.length ?? 2, 2) - 1)) + 2)
  return { teachers, subjects, now, original, ...splitter(sep), how: `페이지 번호 사용(일일 ${r.day}, 원 ${r.original}, 분리 ${sep})` }
}

// 페이지에서 자료 번호를 못 찾았을 때: 시간표 자료 안의 배열 모양을 보고 고르고,
// 과목 이름이 NEIS 시간표와 가장 많이 맞는 조합을 씀
function inferComci(data: Record<string, unknown>, grade: number, classNo: number,
  neisRows: { date: string; period: number; subject: string }[], note: string): Parts {
  const strArrays = Object.entries(data).filter(([, v]) =>
    Array.isArray(v) && v.length > 3 && v.filter((x) => typeof x === 'string').length >= v.length * 0.8) as [string, string[]][]
  const grids = Object.entries(data).filter(([, v]) => {
    const week = (v as Grid)?.[grade]?.[classNo]
    return Array.isArray(week) && Array.isArray(week[1]) && week[1].some((x) => typeof x === 'number' && x > 0)
  }) as [string, Grid][]
  const t = squash
  const same = (a: string, b: string) => { const x = t(a), y = t(b); return !!x && !!y && (x.includes(y) || y.includes(x)) }
  const neis = new Map(neisRows.map((r) => [`${new Date(r.date + 'T00:00:00Z').getUTCDay()}-${r.period}`, r.subject]))
  const seps = [...new Set([Number(data['분리']) || 0, 100, 1000, 10000].filter(Boolean))]

  const scoreOf = (g: Grid, subj: string[], sep: number) => {
    const { subjectNo } = splitter(sep)
    let score = 0
    const week = g[grade][classNo]
    for (let d = 1; d <= 5; d++) for (let p = 1; p < (week[d]?.length ?? 0); p++) {
      const v = week[d][p]; const n = neis.get(`${d}-${p}`)
      if (v && n && same(String(subj[subjectNo(v)] ?? ''), n)) score++
    }
    return score
  }
  let best = { score: 0, grid: '', subj: '', sep: 0 }
  for (const [gk, g] of grids) for (const [sk, subj] of strArrays) for (const sep of seps) {
    const score = scoreOf(g, subj, sep)
    if (score > best.score) best = { score, grid: gk, subj: sk, sep }
  }
  const gridScores = grids.map(([k, g]) => [k, scoreOf(g, data[best.subj] as string[] ?? [], best.sep)] as const)
  if (best.score < 3) {
    throw new Error(`컴시간알리미 자료를 못 알아봄 (문자열 배열: ${strArrays.map(([k, v]) => `${k}(${v.length}개, 예: ${v.slice(1, 3).join('/')})`).join(', ') || '없음'}; 시간표 배열: ${grids.map(([k]) => k).join(', ') || '없음'}; 분리: ${data['분리'] ?? '없음'}; ${note})`)
  }
  const { subjectNo, teacherNo } = splitter(best.sep)
  // NEIS 와 가장 맞는 배열이 원래 시간표, 그다음으로 맞는 배열(교체 몇 칸만 다름)이 오늘 기준 시간표.
  // 두 번째가 너무 안 맞으면(다른 주·다른 용도 배열) 원래 시간표를 그대로 씀
  const ranked = [...gridScores].sort((a, b) => b[1] - a[1])
  const original = data[best.grid] as Grid
  const second = ranked.find(([k]) => k !== best.grid)
  const nowKey = second && second[1] >= best.score * 0.5 ? second[0] : best.grid
  const now = data[nowKey] as Grid
  // 교사 이름 배열: 과목 배열이 아니고, 이름처럼 생긴 글자(한글 2~4자, 끝에 * 가능)가 가장 많은 것
  const nameLike = (a: string[]) => a.filter((x) => /^[가-힣]{2,4}\*?$/.test(String(x).trim())).length / a.length
  const teachers = strArrays.filter(([k]) => k !== best.subj).sort((a, b) => nameLike(b[1]) - nameLike(a[1]))[0]?.[1] ?? []
  const how = `추측: 일일 ${nowKey}, 원 ${best.grid}, 과목 ${best.subj}, 분리 ${best.sep}, 점수 ${ranked.map(([k, n]) => `${k}:${n}`).join(' ')}`
  return { teachers, subjects: data[best.subj] as string[], now, original, subjectNo, teacherNo, how }
}

function kstToday() {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
}
function addDaysIso(iso: string, n: number) {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// 이번 주(월~금) 범위만 컴시간알리미로. 다른 주면 null 을 돌려 NEIS 로 넘어감
async function comciTimetable(from: string, to: string, grade: number, classNo: number, sc: School) {
  const t = kstToday()
  const dow = new Date(t + 'T00:00:00Z').getUTCDay()
  if (dow === 0 || dow === 6) return null
  const monday = addDaysIso(t, 1 - dow)
  if (from < monday || to > addDaysIso(monday, 4)) return null
  if (!sc.name) throw new Error('학교 이름이 없음')
  const code = await comciSchoolCode(sc.name)

  const week = await cached(`comci6:${code}:${grade}-${classNo}:${monday}`, async () => {
    const r = await getComciRoutes()
    const data = await comciJson(`${r.main}_T?${btoa(`${r.timetable}_${code}_0_1`)}`)
    const neisRows: { date: string; period: number; subject: string }[] = await neisTimetable(monday, addDaysIso(monday, 4), grade, classNo, sc).catch(() => [])
    const pickKnown = !!(r.teacher && r.subject && r.day && r.original)
    const parts = pickKnown ? fromRoutes(data, r) : inferComci(data, grade, classNo, neisRows, r.note)
    const { teachers, subjects, now, original, subjectNo, teacherNo } = parts
    const days = now[grade]?.[classNo] ?? []
    const orig = original?.[grade]?.[classNo] ?? []
    const neisAt = new Map<string, string>(neisRows.map((n) => [`${n.date}-${n.period}`, n.subject]))
    const rows: { date: string; period: number; subject: string; teacher: string; changed: boolean; src: string; note?: string }[] = []
    const failed: string[] = []
    // 교체된 칸은 과목 번호가 지금 과목 목록에서 빈 자리를 가리키는 경우가 있음 → 다른 문자열 목록에서 같은 번호를 찾아봄
    const otherLists = Object.entries(data as Record<string, unknown>).filter(([, a]) =>
      Array.isArray(a) && a !== subjects && a !== teachers && a.length > 3 &&
      a.filter((x) => typeof x === 'string').length >= a.length * 0.5) as [string, unknown[]][]
    const altUsed = new Set<string>()
    const subjectOf = (v: number) => {
      const i = subjectNo(v)
      const main = String(subjects[i] ?? '').trim()
      if (main) return main
      for (const [k, a] of otherLists) {
        const x = typeof a[i] === 'string' ? (a[i] as string).trim() : ''
        if (x) { altUsed.add(k); return x }
      }
      return ''
    }
    for (let d = 1; d <= 5; d++) {
      const periods = days[d] ?? []
      for (let p = 1; p < periods.length; p++) {
        const v = periods[p]
        if (!v) continue
        const date = addDaysIso(monday, d - 1)
        let subject = subjectOf(v)
        if (!subject) {
          const i = subjectNo(v)
          failed.push(`${'월화수목금'[d - 1]}${p}=${v}[${JSON.stringify(subjects[i] ?? null)}/${String(teachers?.[teacherNo(v)] ?? '')}]`)
          continue
        }
        // 컴시간알리미는 과목 이름을 줄여 씀(공통국어2 → 국어). 같은 칸 NEIS 과목과 같은 과목이면 NEIS 의 긴 이름을 씀
        const full = neisAt.get(`${date}-${p}`)
        if (full && sameName(full, subject)) subject = full
        const teacher = String(teachers?.[teacherNo(v)] ?? '').replace(/\*$/, '').trim()
        rows.push({ date, period: p, subject, teacher, changed: !!orig[d] && orig[d][p] !== v, src: 'comci' })
      }
    }
    // 원인 확인용: 어떤 자료를 골랐는지, 못 읽은 칸 값이 뭔지
    // 원인 확인용 자세한 자료: 과목·교사 목록 전체, 이 반 일일/원 칸 값
    const list = (a: unknown[] | undefined) => (a ?? []).map((x, i) => `${i}:${x === null ? 'null' : String(x)}`).join(',')
    const cellVals = (g: Grid | undefined) => [1, 2, 3, 4, 5].map((d) => (g?.[grade]?.[classNo]?.[d] ?? []).slice(1).join('/')).join(' | ')
    const dump = `과목목록[${list(subjects)}] 교사목록[${list(teachers)}] 일일칸[${cellVals(now)}] 원칸[${cellVals(original)}]`
    const note = `${parts.how}; 과목 ${subjects.length}개, 교사 ${teachers?.length ?? 0}개${altUsed.size ? `; 다른 목록 사용: ${[...altUsed].join(',')}` : ''}${failed.length ? `; 못 읽은 칸: ${failed.slice(0, 12).join(' ')}; 다른 목록: ${otherLists.map(([k, a]) => `${k}(${a.length})`).join(',') || '없음'}; ${dump}` : ''}`
    if (rows[0]) rows[0].note = note
    if (!rows.length) throw new Error('컴시간알리미에 이 반 시간표가 없음')
    return rows
  }, (at) => Date.now() - new Date(at).getTime() < COMCI_MINUTES * 60_000)

  return week.filter((r) => r.date >= from && r.date <= to)
}

function schedule(from: string, to: string, sc: School) {
  return cached(`schedule:${sc.code}:${from}:${to}`, async () => {
    const rows = await neis('SchoolSchedule', {
      ATPT_OFCDC_SC_CODE: sc.office,
      SD_SCHUL_CODE: sc.code,
      AA_FROM_YMD: ymd(from),
      AA_TO_YMD: ymd(to)
    })
    return rows
      .filter((r: Record<string, string>) => r.EVENT_NM && r.EVENT_NM !== '토요휴업일')
      .map((r: Record<string, string>) => ({
        date: isoDate(r.AA_YMD),
        name: r.EVENT_NM,
        holiday: r.SBTR_DD_SC_NM === '휴업일'
      }))
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const body = await req.json()
    const { type = 'meals', from, to, grade, classNo } = body // 날짜는 'YYYY-MM-DD'
    if (type === 'schools') return Response.json(await searchSchools(body.query), { headers: cors })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw new Error('날짜 형식은 YYYY-MM-DD')
    }
    const sc = await resolveSchool(body)
    const result =
      type === 'timetable' ? await timetable(from, to, Number(grade), Number(classNo), sc)
      : type === 'schedule' ? await schedule(from, to, sc)
      : await meals(from, to, sc)
    return Response.json(result, { headers: cors })
  } catch (e) {
    return Response.json({ error: String((e as Error).message ?? e) }, { status: 400, headers: cors })
  }
})
