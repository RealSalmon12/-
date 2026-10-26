// NEIS 에서 급식, 시간표, 학사일정을 가져와 캐시해 두고 돌려주는 Edge Function.
// 처음엔 급식만 했어서 이름이 meals 이지만, body 의 type 으로 셋 다 처리함.
// 필요한 시크릿: NEIS_API_KEY (open.neis.go.kr 에서 발급)
// 선택 시크릿: NEIS_SCHOOL_CODE (없으면 학교 이름으로 찾아서 씀)
import { createClient } from 'npm:@supabase/supabase-js@2'

const OFFICE_CODE = 'B10' // 서울특별시교육청
const SCHOOL_NAME = '단국대학교부속소프트웨어고등학교'
const NEIS = 'https://open.neis.go.kr/hub'
const CACHE_HOURS = 12

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

const key = Deno.env.get('NEIS_API_KEY') ?? ''
let schoolCode = Deno.env.get('NEIS_SCHOOL_CODE') ?? ''

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

async function getSchoolCode() {
  if (schoolCode) return schoolCode
  const rows = await neis('schoolInfo', { ATPT_OFCDC_SC_CODE: OFFICE_CODE, SCHUL_NM: SCHOOL_NAME })
  if (!rows.length) throw new Error('학교 코드를 찾지 못했어요')
  schoolCode = rows[0].SD_SCHUL_CODE
  return schoolCode
}

const ymd = (d: string) => d.replaceAll('-', '')
const isoDate = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
const isFresh = (t: string) => Date.now() - new Date(t).getTime() < CACHE_HOURS * 3600_000

async function meals(from: string, to: string) {
  const { data: cached } = await admin
    .from('meal_cache').select('*')
    .gte('meal_date', from).lte('meal_date', to)
    .order('meal_date')
  if (cached?.length && cached.every((r) => isFresh(r.fetched_at))) return cached

  const rows = await neis('mealServiceDietInfo', {
    ATPT_OFCDC_SC_CODE: OFFICE_CODE,
    SD_SCHUL_CODE: await getSchoolCode(),
    MLSV_FROM_YMD: ymd(from),
    MLSV_TO_YMD: ymd(to)
  })
  const list = rows.map((r: Record<string, string>) => ({
    meal_date: isoDate(r.MLSV_YMD),
    meal_type: r.MMEAL_SC_NM,
    dishes: r.DDISH_NM.split(/<br\s*\/?>/i).map((s) => s.trim()).filter(Boolean),
    calories: r.CAL_INFO ?? null,
    fetched_at: new Date().toISOString()
  }))
  if (list.length) await admin.from('meal_cache').upsert(list)
  return list
}

// 같은 요청은 neis_cache 에 저장해 두고 12시간 동안 다시 씀
async function cached<T>(cacheKey: string, load: () => Promise<T>): Promise<T> {
  const { data } = await admin.from('neis_cache').select('*').eq('key', cacheKey).maybeSingle()
  if (data && isFresh(data.fetched_at)) return data.data as T
  const fresh = await load()
  await admin.from('neis_cache').upsert({ key: cacheKey, data: fresh, fetched_at: new Date().toISOString() })
  return fresh
}

function timetable(from: string, to: string, grade: number, classNo: number) {
  if (!grade || !classNo) throw new Error('반 관리에서 학년과 반 번호를 먼저 정해 주세요')
  return cached(`timetable:${grade}-${classNo}:${from}:${to}`, async () => {
    const rows = await neis('hisTimetable', {
      ATPT_OFCDC_SC_CODE: OFFICE_CODE,
      SD_SCHUL_CODE: await getSchoolCode(),
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

function schedule(from: string, to: string) {
  return cached(`schedule:${from}:${to}`, async () => {
    const rows = await neis('SchoolSchedule', {
      ATPT_OFCDC_SC_CODE: OFFICE_CODE,
      SD_SCHUL_CODE: await getSchoolCode(),
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
    const { type = 'meals', from, to, grade, classNo } = await req.json() // 날짜는 'YYYY-MM-DD'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw new Error('날짜 형식은 YYYY-MM-DD')
    }
    const result =
      type === 'timetable' ? await timetable(from, to, Number(grade), Number(classNo))
      : type === 'schedule' ? await schedule(from, to)
      : await meals(from, to)
    return Response.json(result, { headers: cors })
  } catch (e) {
    return Response.json({ error: String((e as Error).message ?? e) }, { status: 400, headers: cors })
  }
})
