import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useSession } from '../session.jsx'
import { useNeis } from '../neis.js'
import { addDays, mondayOf, shortDate, useToday } from '../util.js'

const DAYS = ['월', '화', '수', '목', '금']
const squash = (s) => s.replace(/\s/g, '')

// 시간표 과목과 수행평가 과목 이름이 조금 달라도(예: '문학' / '국어 문학') 같은 과목으로 봄
export const sameSubject = (a, b) => {
  const x = squash(a), y = squash(b)
  return !!x && !!y && (x.includes(y) || y.includes(x))
}

export function useTimetable(from, to) {
  const { member } = useSession()
  const { grade, class_no: classNo } = member.classes
  const ready = !!grade && !!classNo
  return { ready, ...useNeis('timetable', { from, to, grade, classNo }, ready) }
}

export function NeedsClassNumber() {
  const { isTeacher } = useSession()
  return (
    <p className="empty">
      시간표를 불러오려면 학년과 반 번호가 필요해요.{' '}
      {isTeacher ? <Link className="more" to="/class">반 관리에서 정하기</Link> : '선생님께 반 관리에서 정해 달라고 해 주세요.'}
    </p>
  )
}

export default function Timetable() {
  const { member } = useSession()
  const t = useToday()
  const [monday, setMonday] = useState(mondayOf(t))
  const friday = addDays(monday, 4)
  const { ready, loading, data, error } = useTimetable(monday, friday)
  const [due, setDue] = useState([])

  // 날이 바뀌면 이번 주로 돌아옴 (월요일 아침엔 새 주 시간표가 바로 보이게)
  useEffect(() => { setMonday(mondayOf(t)) }, [t])

  useEffect(() => {
    if (!member.class_id) return // 게스트는 수행평가 없음
    supabase.from('assessments').select('id, subject, title, due_date')
      .eq('class_id', member.class_id).gte('due_date', monday).lte('due_date', friday)
      .then(({ data }) => setDue(data ?? []))
  }, [member.class_id, monday, friday])

  const dates = DAYS.map((_, i) => addDays(monday, i))
  const maxPeriod = Math.max(7, ...data.map((r) => r.period))
  const cell = (date, period) => data.find((r) => r.date === date && r.period === period)

  return (
    <div className="page">
      <header className="page-head"><h1>시간표</h1></header>
      <div className="stepper">
        <button className="step" onClick={() => setMonday(addDays(monday, -7))} aria-label="지난주">‹</button>
        <button className="btn-text" onClick={() => setMonday(mondayOf(t))}>
          {shortDate(monday)} ~ {shortDate(friday)}{monday === mondayOf(t) && ' 이번 주'}
        </button>
        <button className="step" onClick={() => setMonday(addDays(monday, 7))} aria-label="다음 주">›</button>
      </div>

      {!ready ? <NeedsClassNumber />
        : error ? <p className="error">{error}</p>
        : !loading && !data.length ? <p className="empty">이 주에는 시간표가 없어요. 방학이거나 아직 NEIS에 올라오지 않았을 수 있어요.</p>
        : (
          <div className="timetable" style={{ gridTemplateRows: `auto repeat(${maxPeriod}, minmax(48px, auto))` }}>
            <span />
            {dates.map((d, i) => (
              <span key={d} className={d === t ? 'tt-day today' : 'tt-day'}>{DAYS[i]}</span>
            ))}
            {Array.from({ length: maxPeriod }, (_, p) => (
              <Period key={p} period={p + 1} dates={dates} cell={cell} due={due} today={t} />
            ))}
          </div>
        )}
      <p className="fine legend-line">
        <span><i className="tt-dot static" /> 수행평가 있는 날</span>
        <span><i className="tt-changed-mark" /> 바뀐 수업</span>
      </p>
      <p className="neis-credit">시간표 출처: {data[0]?.src === 'neis' ? '나이스 교육정보 개방 포털' : '컴시간알리미, 나이스 교육정보 개방 포털'}</p>
    </div>
  )
}

function Period({ period, dates, cell, due, today }) {
  return (
    <>
      <span className="tt-period">{period}</span>
      {dates.map((d) => {
        const c = cell(d, period)
        const test = c && due.find((a) => a.due_date === d && sameSubject(a.subject, c.subject))
        const body = (
          <>
            <span>{c?.subject}{c?.teacher && <small className="tt-teacher">{c.teacher}</small>}</span>
            {test && <span className="tt-dot" aria-label="수행평가 있음" />}
          </>
        )
        const cls = `tt-cell ${d === today ? 'today' : ''} ${test ? 'has-test' : ''} ${c?.changed ? 'changed' : ''}`
        return test
          ? <Link key={d} to={`/assessments/${test.id}`} className={cls}>{body}</Link>
          : <span key={d} className={cls}>{body}</span>
      })}
    </>
  )
}
