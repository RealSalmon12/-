import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

// Edge Function 'meals' 에 type 을 넘겨 급식/시간표/학사일정을 가져옴
export function useNeis(type, params, enabled = true) {
  const [state, setState] = useState({ loading: true, data: [], error: '' })
  const key = JSON.stringify(params)
  useEffect(() => {
    if (!enabled) return setState({ loading: false, data: [], error: '' })
    let alive = true
    setState((s) => ({ ...s, loading: true }))
    supabase.functions.invoke('meals', { body: { type, ...params } }).then(async ({ data, error }) => {
      if (!alive) return
      let message = ''
      if (error) {
        // 함수가 돌려준 한국어 오류 문구가 있으면 그걸 보여줌
        const body = await error.context?.json?.().catch(() => null)
        message = body?.error ?? '학교 정보를 불러오지 못했어요.'
      }
      setState({ loading: false, data: Array.isArray(data) ? data : [], error: message })
    })
    return () => { alive = false }
  }, [type, key, enabled])
  return state
}
