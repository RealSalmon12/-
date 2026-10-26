// 급식 정보를 NEIS 에서 가져와 meal_cache 에 저장하고 돌려주는 Edge Function.
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
  const qs = new URLSearchParams({ KEY: key, Type: 'json', pIndex: '1', pSize: '100', ...params })
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  try {
    const { from, to } = await req.json() // 'YYYY-MM-DD'
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
      throw new Error('날짜 형식은 YYYY-MM-DD')
    }

    const { data: cached } = await admin
      .from('meal_cache').select('*')
      .gte('meal_date', from).lte('meal_date', to)
      .order('meal_date')

    const fresh = Date.now() - CACHE_HOURS * 3600_000
    if (cached?.length && cached.every((r) => new Date(r.fetched_at).getTime() > fresh)) {
      return Response.json(cached, { headers: cors })
    }

    const rows = await neis('mealServiceDietInfo', {
      ATPT_OFCDC_SC_CODE: OFFICE_CODE,
      SD_SCHUL_CODE: await getSchoolCode(),
      MLSV_FROM_YMD: ymd(from),
      MLSV_TO_YMD: ymd(to)
    })

    const meals = rows.map((r: Record<string, string>) => ({
      meal_date: isoDate(r.MLSV_YMD),
      meal_type: r.MMEAL_SC_NM,
      dishes: r.DDISH_NM.split(/<br\s*\/?>/i).map((s) => s.trim()).filter(Boolean),
      calories: r.CAL_INFO ?? null,
      fetched_at: new Date().toISOString()
    }))

    if (meals.length) await admin.from('meal_cache').upsert(meals)
    return Response.json(meals, { headers: cors })
  } catch (e) {
    return Response.json({ error: String((e as Error).message ?? e) }, { status: 400, headers: cors })
  }
})
