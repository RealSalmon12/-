import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useSession } from '../session.jsx'
import { useNeis } from '../neis.js'
import { today, addDays, mondayOf, shortDate } from '../util.js'
import NeisCredit from '../components/NeisCredit.jsx'

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
  const [monday, setMonday] = useState(mondayOf(today()))
  const friday = addDays(monday, 4)
  const { ready, loading, data, error } = useTimetable(monday, friday)
  const [due, setDue] = useState([])
  const t = today()

  useEffect(() => {
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
        <button className="btn-text" onClick={() => setMonday(mondayOf(today()))}>
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
      <p className="fine">빨간 점이 있는 칸은 그날 그 과목 수행평가가 있다는 뜻이에요. 시간표는 NEIS에서 자동으로 불러와요.</p>
      <NeisCredit what="시간표" />
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
        const body = <>{c?.subject}{test && <span className="tt-dot" aria-label="수행평가 있음" />}</>
        const cls = `tt-cell ${d === today ? 'today' : ''} ${test ? 'has-test' : ''}`
        return test
          ? <Link key={d} to={`/assessments/${test.id}`} className={cls}>{body}</Link>
          : <span key={d} className={cls}>{body}</span>
      })}
    </>
  )
}
