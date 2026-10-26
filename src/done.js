import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { useSession } from './session.jsx'

// 내가 "다 했어요"로 표시한 수행평가 id 모음
export function useDone() {
  const { user } = useSession()
  const [done, setDone] = useState(new Set())

  useEffect(() => {
    supabase.from('assessment_done').select('assessment_id').eq('user_id', user.id)
      .then(({ data }) => setDone(new Set((data ?? []).map((d) => d.assessment_id))))
  }, [user.id])

  const toggle = useCallback(async (id) => {
    const isDone = done.has(id)
    const next = new Set(done)
    isDone ? next.delete(id) : next.add(id)
    setDone(next)
    const { error } = isDone
      ? await supabase.from('assessment_done').delete().eq('assessment_id', id).eq('user_id', user.id)
      : await supabase.from('assessment_done').insert({ assessment_id: id })
    if (error) setDone(done) // 실패하면 원래대로
  }, [done, user.id])

  return { done, toggle }
}
