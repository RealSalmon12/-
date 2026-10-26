import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useSession } from '../session.jsx'
import { today } from '../util.js'
import DueList from '../components/DueList.jsx'
import { PlusIcon } from '../components/Icons.jsx'

export default function Assessments() {
  const { member, canPost } = useSession()
  const [items, setItems] = useState([])
  const [subject, setSubject] = useState('')
  const [view, setView] = useState('list')
  const [showPast, setShowPast] = useState(false)

  useEffect(() => {
    supabase.from('assessments').select('*').eq('class_id', member.class_id).order('due_date')
      .then(({ data }) => setItems(data ?? []))
  }, [member.class_id])

  const subjects = useMemo(() => [...new Set(items.map((a) => a.subject))].sort(), [items])
  const filtered = items.filter((a) => !subject || a.subject === subject)
  const t = today()
  const upcoming = filtered.filter((a) => a.due_date >= t)
  const past = filtered.filter((a) => a.due_date < t).reverse()

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

      {view === 'calendar' ? <Calendar items={filtered} /> : (
        <>
          {upcoming.length
            ? <DueList items={upcoming} />
            : <p className="empty">예정된 수행평가가 없어요.{canPost && ' 아래 버튼으로 첫 일정을 올려 주세요.'}</p>}
          {past.length > 0 && (
            <div className="past">
              <button className="btn-text" aria-expanded={showPast} onClick={() => setShowPast(!showPast)}>
                지난 수행평가 {past.length}개 {showPast ? '접기' : '보기'}
              </button>
              {showPast && <DueList items={past} />}
            </div>
          )}
        </>
      )}

      {canPost && <Link className="fab" to="/assessments/new"><PlusIcon />수행평가 쓰기</Link>}
    </div>
  )
}

function Calendar({ items }) {
  const [month, setMonth] = useState(today().slice(0, 7)) // 'YYYY-MM'
  const [y, m] = month.split('-').map(Number)
  const first = new Date(Date.UTC(y, m - 1, 1))
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const cells = [...Array(first.getUTCDay()).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const byDay = {}
  for (const a of items) {
    if (a.due_date.startsWith(month)) (byDay[Number(a.due_date.slice(8))] ??= []).push(a)
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
        {cells.map((d, i) => (
          <div key={i} className={`day ${d && `${month}-${String(d).padStart(2, '0')}` === t ? 'today' : ''}`}>
            {d && <span className="num">{d}</span>}
            {d && byDay[d]?.map((a) => (
              <Link key={a.id} to={`/assessments/${a.id}`} className="event">{a.subject}</Link>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
