import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useSession, ROLE_NAMES } from '../session.jsx'
import { today, addDays, formatDate } from '../util.js'

export const DAILY_CALLS = 3
const RECIPIENTS = { student: '선생님, 반장, 부반장', president: '선생님과 부반장', vice: '선생님과 반장' }

// 한국 시간 기준 그날 0시
const startOf = (iso) => `${iso}T00:00:00+09:00`
const timeOf = (ts) => new Date(ts).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit' })
const dayOf = (ts) => new Date(ts).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })

// 오늘 내가 부른 횟수 (홈 화면과 같이 씀)
export function useCallsUsed() {
  const { user } = useSession()
  const [used, setUsed] = useState(null)
  const load = useCallback(() => {
    supabase.from('admin_calls').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).gte('created_at', startOf(today()))
      .then(({ count, error }) => setUsed(error ? null : count ?? 0))
  }, [user.id])
  useEffect(() => { load() }, [load])
  return [used, load]
}

export default function Calls() {
  const { member, canPost } = useSession()
  const navigate = useNavigate()
  const canCall = member.role !== 'teacher'
  const [used, reloadUsed] = useCallsUsed()
  const [calls, setCalls] = useState(null)
  const [names, setNames] = useState({})
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const left = used === null ? null : Math.max(0, DAILY_CALLS - used)

  // 관리자는 최근 7일 반 전체, 학생은 오늘 내 호출만 (RLS 가 걸러 줌)
  const loadCalls = useCallback(() => {
    supabase.from('admin_calls').select('id, user_id, message, created_at')
      .eq('class_id', member.class_id).gte('created_at', startOf(addDays(today(), canPost ? -6 : 0)))
      .order('created_at', { ascending: false }).limit(50)
      .then(({ data, error }) => setCalls(error ? [] : data ?? []))
  }, [member.class_id, canPost])

  useEffect(() => { loadCalls() }, [loadCalls])
  useEffect(() => {
    if (!canPost) return
    supabase.from('members').select('user_id, display_name, role').eq('class_id', member.class_id)
      .then(({ data }) => setNames(Object.fromEntries((data ?? []).map((m) => [m.user_id, m]))))
  }, [member.class_id, canPost])

  async function call(e) {
    e.preventDefault()
    if (!confirm(`${RECIPIENTS[member.role]}에게 호출 알림을 보낼까요? (오늘 ${left}번 남음)`)) return
    setBusy(true)
    setError('')
    setNotice('')
    const { data, error } = await supabase.functions.invoke('call-admin', { body: { message: message.trim() } })
    setBusy(false)
    if (error) {
      const status = error.context?.status
      const detail = await error.context?.json?.().catch(() => null)
      setError(status === 429 ? '오늘은 3번을 다 불렀어요. 내일 다시 부를 수 있어요.'
        : detail?.error?.includes('call_admin') || detail?.error?.includes('admin_calls') ? 'DB 업데이트(006_call_admin.sql)를 먼저 실행해 주세요.'
        : status === 404 ? 'call-admin 함수를 먼저 배포해 주세요.'
        : '호출하지 못했어요. 잠시 뒤 다시 해 주세요.')
    } else {
      setMessage('')
      setNotice(data.sent ? '호출했어요. 알림이 갔어요.' : '호출했어요. 다만 알림을 켠 관리자가 아직 없어서 앱에서만 보여요.')
    }
    reloadUsed()
    loadCalls()
  }

  // 날짜별로 묶기
  const groups = []
  for (const c of calls ?? []) {
    const d = dayOf(c.created_at)
    if (groups.at(-1)?.date !== d) groups.push({ date: d, items: [] })
    groups.at(-1).items.push(c)
  }

  return (
    <div className="page">
      <button className="back" onClick={() => navigate(-1)}>‹ 뒤로</button>
      <h1>관리자 호출</h1>

      {canCall && (
        <form className="section call-box" onSubmit={call}>
          <p className="fine">
            {RECIPIENTS[member.role]}에게 바로 알림이 가요. 한 사람당 하루 {DAILY_CALLS}번까지 부를 수 있어요.
          </p>
          <label>무슨 일인지 (선택)
            <input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={60}
              placeholder="예: 3층 화장실 휴지가 없어요" />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          {notice && <p className="call-sent" role="status">{notice}</p>}
          <button className="btn-primary" disabled={busy || left === null || left === 0}>
            {busy ? '부르는 중…' : left === 0 ? '오늘은 다 불렀어요' : `호출하기 · 오늘 ${left ?? '-'}번 남음`}
          </button>
        </form>
      )}

      <section className="section">
        <h2>{canPost ? '최근 7일 호출' : '오늘 내 호출'}</h2>
        {calls === null ? null : groups.length ? groups.map((g) => (
          <div key={g.date} className="call-day">
            {canPost && <p className="fine">{g.date === today() ? '오늘' : formatDate(g.date)}</p>}
            <ul className="plain-list">
              {g.items.map((c) => (
                <li key={c.id} className="call-row">
                  <div>
                    {canPost && (
                      <b>{names[c.user_id]?.display_name ?? '나간 사람'}
                        <span className="fine"> {ROLE_NAMES[names[c.user_id]?.role] ?? ''}</span></b>
                    )}
                    <p>{c.message || '관리자를 불렀어요.'}</p>
                  </div>
                  <span className="fine">{timeOf(c.created_at)}</span>
                </li>
              ))}
            </ul>
          </div>
        )) : <p className="empty">{canPost ? '최근 7일 동안 들어온 호출이 없어요.' : '오늘은 아직 부르지 않았어요.'}</p>}
      </section>
    </div>
  )
}
