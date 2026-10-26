// NEIS 에서 학교 검색, 급식, 시간표, 학사일정을 가져와 캐시해 두고 돌려주는 Edge Function.
// 처음엔 급식만 했어서 이름이 meals 이지만, body 의 type 으로 모두 처리함.
// 학교는 body 의 office(교육청 코드), school(학교 코드), schoolName, kind 로 받고,
// 없으면 처음 쓰던 단국대학교부속소프트웨어고등학교를 씀.
// 필요한 시크릿: NEIS_API_KEY (open.neis.go.kr 에서 발급)
import { createClient } from 'npm:@supabase/supabase-js@2'

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

type School = { office: string; code: string; kind: string }
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
  return { office, code, kind }
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

// 같은 요청은 neis_cache 에 저장해 두고 12시간 동안 다시 씀
async function cached<T>(cacheKey: string, load: () => Promise<T>): Promise<T> {
  const { data } = await admin.from('neis_cache').select('*').eq('key', cacheKey).maybeSingle()
  if (data && isFresh(data.fetched_at)) return data.data as T
  const fresh = await load()
  await admin.from('neis_cache').upsert({ key: cacheKey, data: fresh, fetched_at: new Date().toISOString() })
  return fresh
}

function timetable(from: string, to: string, grade: number, classNo: number, sc: School) {
  if (!grade || !classNo) throw new Error('반 관리에서 학년과 반 번호를 먼저 정해 주세요')
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
  })
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
