import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useSession } from '../session.jsx'
import { today, addDays, formatDate, dday } from '../util.js'
import { useNeis } from '../neis.js'

const NEED_DB = 'DB 업데이트(011_submissions_dday.sql)를 먼저 실행해 주세요.'

// 다가오는 반 D-day (지난 건 빼고 가까운 순)
export function useEvents(classId) {
  const [events, setEvents] = useState(null)
  const [error, setError] = useState('')
  const load = () => supabase.from('class_events').select('*')
    .eq('class_id', classId).gte('event_date', today()).order('event_date')
    .then(({ data, error }) => { setError(error ? NEED_DB : ''); setEvents(data ?? []) })
  useEffect(() => { load() }, [classId]) // eslint-disable-line react-hooks/exhaustive-deps
  return { events, error, reload: load }
}

// 홈: 가장 가까운 D-day 세 개
export function DdayStrip() {
  const { member, canPost } = useSession()
  const { events } = useEvents(member.class_id)
  if (!events) return null
  if (!events.length) {
    return canPost ? <Link to="/dday" className="call-strip"><b>D-day 만들기</b><span className="fine">시험·수학여행까지 남은 날</span></Link> : null
  }
  return (
    <Link to="/dday" className="dday-strip" aria-label="반 D-day 전체 보기">
      {events.slice(0, 3).map((e) => (
        <span key={e.id} className="dday-chip">
          <b>{dday(e.event_date)}</b>
          <span>{e.title}</span>
        </span>
      ))}
    </Link>
  )
}

// 반 D-day: 선생님·반장·부반장이 만들고 지움. 학교 일정에서 골라 넣을 수도 있음
export default function Dday() {
  const { member, canPost } = useSession()
  const navigate = useNavigate()
  const { events, error: loadError, reload } = useEvents(member.class_id)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [error, setError] = useState('')
  const t = today()
  const school = useNeis('schedule', { from: t, to: addDays(t, 120) }, canPost)

  async function add(name, when) {
    setError('')
    const { error } = await supabase.from('class_events').insert({ class_id: member.class_id, title: name.trim().slice(0, 30), event_date: when })
    if (error) return setError(error.message.includes('class_events') ? NEED_DB : 'D-day를 만들지 못했어요.')
    setTitle('')
    setDate('')
    reload()
  }

  async function remove(e) {
    if (!confirm(`"${e.title}" D-day를 지울까요?`)) return
    await supabase.from('class_events').delete().eq('id', e.id)
    reload()
  }

  const have = new Set((events ?? []).map((e) => `${e.event_date}|${e.title}`))
  const suggestions = school.data.filter((s) => !s.holiday && !have.has(`${s.date}|${s.name.slice(0, 30)}`)).slice(0, 8)

  return (
    <div className="page">
      <button className="back" onClick={() => navigate(-1)}>‹ 뒤로</button>
      <h1>반 D-day</h1>
      {loadError && <p className="error" role="alert">{loadError}</p>}
      {events && (events.length ? (
        <ul className="dday-list">
          {events.map((e) => (
            <li key={e.id}>
              <b className="dday-big">{dday(e.event_date)}</b>
              <span className="dday-text">
                <span>{e.title}</span>
                <span className="fine">{formatDate(e.event_date)}</span>
              </span>
              {canPost && <button className="btn-text danger" onClick={() => remove(e)}>지우기</button>}
            </li>
          ))}
        </ul>
      ) : <p className="empty">다가오는 D-day가 없어요.</p>)}

      {canPost && (
        <>
          <form className="section call-box" onSubmit={(e) => { e.preventDefault(); add(title, date) }}>
            <h2>D-day 만들기</h2>
            <div className="field-row">
              <label>이름<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={30} required placeholder="예: 수학여행" /></label>
              <label>날짜<input type="date" value={date} min={t} onChange={(e) => setDate(e.target.value)} required /></label>
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn-primary" disabled={!title.trim() || !date}>만들기</button>
          </form>
          {suggestions.length > 0 && (
            <section className="section">
              <h2>학교 일정에서 고르기</h2>
              <ul className="plain-list">
                {suggestions.map((s) => (
                  <li key={s.date + s.name} className="plain-row">
                    <span>{s.name} <span className="fine">{formatDate(s.date)}</span></span>
                    <button className="btn-text" onClick={() => add(s.name, s.date)}>추가</button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  )
}
