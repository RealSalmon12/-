import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { useSession } from './session.jsx'

// 우리 반 학교 정보를 함수에 넘길 모양으로
function schoolOf(classes) {
  if (!classes?.office_code) return {}
  return { office: classes.office_code, school: classes.school_code ?? '', schoolName: classes.school_name ?? '', kind: classes.school_kind ?? '' }
}

// Edge Function 'meals' 에 type 을 넘겨 급식/시간표/학사일정을 가져옴 (우리 반 학교 기준)
export function useNeis(type, params, enabled = true) {
  const { member } = useSession()
  const [state, setState] = useState({ loading: true, data: [], error: '' })
  const body = { ...schoolOf(member?.classes), ...params }
  const key = JSON.stringify(body)
  useEffect(() => {
    if (!enabled) return setState({ loading: false, data: [], error: '' })
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    supabase.functions.invoke('meals', { body: { type, ...body } }).then(async ({ data, error }) => {
      if (!alive) return
      let message = ''
      if (error) {
        // 함수가 돌려준 한국어 오류 문구가 있으면 그걸 보여줌
        const body = await error.context?.json?.().catch(() => null)
        message = body?.error ?? '학교 정보를 불러오지 못했어요.'
      }
      // 함수가 아직 옛 버전이면 type 을 몰라 급식을 돌려주므로, 모양이 맞는 것만 씀
      const valid = { meals: (r) => r.meal_type, timetable: (r) => r.period, schedule: (r) => r.name }[type]
      setState({ loading: false, data: Array.isArray(data) ? data.filter(valid) : [], error: message })
    })
    return () => { alive = false }
  }, [type, key, enabled])
  return state
}

// 학교 이름으로 NEIS 학교 목록 검색 (반 만들기, 반 관리에서 씀)
export async function searchSchools(query) {
  const { data, error } = await supabase.functions.invoke('meals', { body: { type: 'schools', query } })
  if (error) {
    const body = await error.context?.json?.().catch(() => null)
    throw new Error(body?.error ?? '학교를 찾지 못했어요. 잠시 뒤 다시 해 주세요.')
  }
  return Array.isArray(data) ? data.filter((r) => r.code) : []
}
