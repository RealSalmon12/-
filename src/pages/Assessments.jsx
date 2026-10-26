import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useSession } from '../session.jsx'
import { useDone } from '../done.js'
import { useNeis } from '../neis.js'
import { downloadIcs } from '../ics.js'
import { today, addDays } from '../util.js'
import DueList from '../components/DueList.jsx'
import { PlusIcon } from '../components/Icons.jsx'

export default function Assessments() {
  const { member, canPost } = useSession()
  const { done, toggle } = useDone()
  const [items, setItems] = useState([])
  const [subject, setSubject] = useState('')
  const [view, setView] = useState('list')
  const [hideDone, setHideDone] = useState(false)
  const [showPast, setShowPast] = useState(false)

  useEffect(() => {
    supabase.from('assessments').select('*').eq('class_id', member.class_id)
      .order('due_date').order('subject')
      .then(({ data }) => setItems(data ?? []))
  }, [member.class_id])

  const subjects = useMemo(() => [...new Set(items.map((a) => a.subject))].sort(), [items])
  const filtered = items.filter((a) => !subject || a.subject === subject)
  const t = today()
  // 다가오는 순서대로 (같은 날이면 과목 이름순)
  const upcoming = filtered.filter((a) => a.due_date >= t && !(hideDone && done.has(a.id)))
  const past = filtered.filter((a) => a.due_date < t).reverse()
  const left = filtered.filter((a) => a.due_date >= t && !done.has(a.id)).length

  return (
    <div className="page">
      <header className="page-head">
        <h1>수행평가</h1>
        <div className="toggle" role="tablist">
          <button role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>목록</button>
          <button role="tab" aria-selected={view === 'calendar'} className={view === 'calendar' ? 'on' : ''} onClick={() => setView('calendar')}>달력</button>
        </div>
      </header>

      {subjects.length > 1 && (
        <div className="chips">
          <button className={!subject ? 'chip on' : 'chip'} onClick={() => setSubject('')}>전체</button>
          {subjects.map((s) => (
            <button key={s} className={subject === s ? 'chip on' : 'chip'} onClick={() => setSubject(s)}>{s}</button>
          ))}
        </div>
      )}

      {view === 'calendar' ? <Calendar items={filtered} done={done} /> : (
        <>
          {filtered.some((a) => a.due_date >= t) && (
            <div className="list-tools">
              <span className="fine">남은 수행평가 {left}개</span>
              <span className="actions">
                <button className="btn-text" aria-pressed={hideDone} onClick={() => setHideDone(!hideDone)}>
                  {hideDone ? '끝낸 것도 보기' : '끝낸 것 숨기기'}
                </button>
                <button className="btn-text" onClick={() => downloadIcs(filtered.filter((a) => a.due_date >= t))}>
                  캘린더에 추가
                </button>
              </span>
            </div>
          )}
          {upcoming.length
            ? <DueList items={upcoming} done={done} onToggle={toggle} />
            : <p className="empty">
                {hideDone && left === 0 && filtered.some((a) => a.due_date >= t)
                  ? '남은 수행평가를 다 끝냈어요.'
                  : <>예정된 수행평가가 없어요.{canPost && ' 아래 버튼으로 첫 일정을 올려 주세요.'}</>}
              </p>}
          {past.length > 0 && (
            <div className="past">
              <button className="btn-text" aria-expanded={showPast} onClick={() => setShowPast(!showPast)}>
                지난 수행평가 {past.length}개 {showPast ? '접기' : '보기'}
              </button>
              {showPast && <DueList items={past} done={done} />}
            </div>
          )}
        </>
      )}

      {canPost && <Link className="fab" to="/assessments/new"><PlusIcon />수행평가 쓰기</Link>}
    </div>
  )
}

function Calendar({ items, done }) {
  const [month, setMonth] = useState(today().slice(0, 7)) // 'YYYY-MM'
  const [y, m] = month.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1, 1))
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const from = `${month}-01`
  const school = useNeis('schedule', { from, to: addDays(from, days - 1) })
  const cells = [...Array(first.getUTCDay()).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const byDay = {}
  for (const a of items) {
    if (a.due_date.startsWith(month)) (byDay[Number(a.due_date.slice(8))] ??= []).push(a)
  }
  const eventsByDay = {}
  for (const e of school.data) {
    if (e.date.startsWith(month)) (eventsByDay[Number(e.date.slice(8))] ??= []).push(e)
  }
  const move = (n) => {
    const d = new Date(Date.UTC(y, m - 1 + n, 1))
    setMonth(d.toISOString().slice(0, 7))
  }
  const t = today()

  return (
    <div className="cal">
      <div className="stepper">
        <button className="step" onClick={() => move(-1)} aria-label="이전 달">‹</button>
        <b>{y}년 {m}월</b>
        <button className="step" onClick={() => move(1)} aria-label="다음 달">›</button>
      </div>
      <div className="calendar">
        {['일', '월', '화', '수', '목', '금', '토'].map((d) => <div key={d} className="dow">{d}</div>)}
        {cells.map((d, i) => {
          const holiday = d && eventsByDay[d]?.some((e) => e.holiday)
          return (
            <div key={i} className={`day ${d && `${month}-${String(d).padStart(2, '0')}` === t ? 'today' : ''} ${holiday || i % 7 === 0 ? 'off' : ''}`}>
              {d && <span className="num">{d}</span>}
              {d && eventsByDay[d]?.map((e) => <span key={e.name} className="school-event">{e.name}</span>)}
              {d && byDay[d]?.map((a) => (
                <Link key={a.id} to={`/assessments/${a.id}`} className={done.has(a.id) ? 'event done' : 'event'}>{a.subject}</Link>
              ))}
            </div>
          )
        })}
      </div>
      <p className="fine">초록색은 수행평가, 회색 글씨는 학교 일정이에요.</p>
    </div>
  )
}
