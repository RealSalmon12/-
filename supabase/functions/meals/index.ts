// NEIS 에서 학교 검색, 급식, 시간표, 학사일정을 가져와 캐시해 두고 돌려주는 Edge Function.
// 처음엔 급식만 했어서 이름이 meals 이지만, body 의 type 으로 모두 처리함.
// 학교는 body 의 office(교육청 코드), school(학교 코드), schoolName, kind 로 받고,
// 없으면 처음 쓰던 단국대학교부속소프트웨어고등학교를 씀.
// 필요한 시크릿: NEIS_API_KEY (open.neis.go.kr 에서 발급)
// 시간표는 이번 주 것이면 컴시간알리미(교체·보강까지 바로 반영)에서 먼저 가져오고, 안 되면 NEIS.
import { createClient } from 'npm:@supabase/supabase-js@2'
import iconv from 'npm:iconv-lite@0.6.3'

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

type ComciRoutes = { main: string; search: string; timetable: string; teacher: string; original: string; day: string; subject: string }
let comciRoutes: { at: number; v: ComciRoutes } | null = null

async function getComciRoutes(): Promise<ComciRoutes> {
  if (comciRoutes && Date.now() - comciRoutes.at < 3600_000) return comciRoutes.v
  const res = await fetch(`${COMCI}/st`, { headers: comciHeaders })
  const html = new TextDecoder('euc-kr').decode(await res.arrayBuffer())
  const pick = (re: RegExp, what: string) => {
    const m = re.exec(html)
    if (!m) throw new Error(`컴시간알리미 페이지에서 ${what} 를 못 찾음`)
    return m[0]
  }
  const v = {
    main: pick(/(?<=\.\/)\d+(?=\?\d+l)/, 'main'),
    search: pick(/(?<=\?)\d+(?=l)/, 'search'),
    timetable: pick(/(?<=')\d+(?=_')/, 'timetable'),
    teacher: pick(/(?<=성명=자료\.자료)\d+/, 'teacher'),
    original: pick(/(?<=원자료=Q자료\(자료.자료)\d+/, 'original'),
    day: pick(/(?<=일일자료=Q자료\(자료.자료)\d+/, 'day'),
    subject: pick(/(?<=자료.자료)\d+(?=\[sb\])/, 'subject')
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

  const week = await cached(`comci2:${code}:${grade}-${classNo}:${monday}`, async () => {
    const r = await getComciRoutes()
    const data = await comciJson(`${r.main}_T?${btoa(`${r.timetable}_${code}_0_1`)}`)
    const teachers = data[`자료${r.teacher}`] as string[]
    const subjects = data[`자료${r.subject}`] as string[]
    const now = data[`자료${r.day}`] as number[][][][]
    const original = data[`자료${r.original}`] as number[][][][]
    if (!Array.isArray(subjects) || !Array.isArray(now)) throw new Error('컴시간알리미 자료 모양이 달라짐')
    // 칸 값에 과목번호와 교사번호가 합쳐져 있음. 자료.분리 가 있으면 그걸로 나누고(100 이면 옛 방식: 교사*100+과목),
    // 없으면 교사 수 자릿수로 나눔 (comcigan.ts 와 같은 방식)
    const split = Number(data['분리']) || 0
    const fallback = 10 ** (Math.floor(Math.log10(Math.max(teachers?.length ?? 2, 2) - 1)) + 2)
    const subjectNo = (v: number) => split === 100 ? v % 100 : Math.floor(v / (split || fallback))
    const teacherNo = (v: number) => split === 100 ? Math.floor(v / 100) : v % (split || fallback / 10)
    const days = now[grade]?.[classNo] ?? []
    const orig = original?.[grade]?.[classNo] ?? []
    const rows: { date: string; period: number; subject: string; teacher: string; changed: boolean; src: string }[] = []
    for (let d = 1; d <= 5; d++) {
      const periods = days[d] ?? []
      for (let p = 1; p < periods.length; p++) {
        const v = periods[p]
        if (!v) continue
        const subject = String(subjects[subjectNo(v)] ?? '').trim()
        if (!subject) continue
        const teacher = String(teachers?.[teacherNo(v)] ?? '').replace(/\*$/, '').trim()
        rows.push({ date: addDaysIso(monday, d - 1), period: p, subject, teacher, changed: !!orig[d] && orig[d][p] !== v, src: 'comci' })
      }
    }
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
