import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useSession, ROLE_NAMES } from '../session.jsx'
import { today, formatDate, dday } from '../util.js'
import { MealCard, useMeals } from './Meals.jsx'

export default function Home() {
  const { member, isTeacher } = useSession()
  const [assessments, setAssessments] = useState([])
  const [notices, setNotices] = useState([])
  const t = today()
  const meals = useMeals(t, t)

  useEffect(() => {
    supabase.from('assessments').select('id, subject, title, due_date')
      .eq('class_id', member.class_id).gte('due_date', t).order('due_date').limit(3)
      .then(({ data }) => setAssessments(data ?? []))
    supabase.from('notices').select('id, title, created_at')
      .eq('class_id', member.class_id).order('created_at', { ascending: false }).limit(3)
      .then(({ data }) => setNotices(data ?? []))
  }, [member.class_id, t])

  return (
    <div className="page stack">
      <header className="row between">
        <div>
          <h1>{member.classes.name}</h1>
          <p className="muted">{member.display_name} · {ROLE_NAMES[member.role]}</p>
        </div>
        {isTeacher
          ? <Link className="chip" to="/class">반 관리</Link>
          : <button className="chip" onClick={() => supabase.auth.signOut()}>로그아웃</button>}
      </header>

      <section className="card">
        <h2>오늘 급식 <span className="muted small">{formatDate(t)}</span></h2>
        {meals.loading ? <p className="muted">불러오는 중…</p>
          : meals.list.length ? meals.list.map((m) => <MealCard key={m.meal_type} meal={m} compact />)
          : <p className="muted">오늘은 급식이 없어요</p>}
      </section>

      <section className="card">
        <h2 className="row between">다가오는 수행평가 <Link className="small" to="/assessments">전체</Link></h2>
        {assessments.length ? (
          <ul className="list">
            {assessments.map((a) => (
              <li key={a.id}>
                <Link to={`/assessments/${a.id}`} className="row between">
                  <span><b>{a.subject}</b> {a.title}</span>
                  <span className="badge">{dday(a.due_date)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="muted">예정된 수행평가가 없어요</p>}
      </section>

      <section className="card">
        <h2 className="row between">최근 가정통신문 <Link className="small" to="/notices">전체</Link></h2>
        {notices.length ? (
          <ul className="list">
            {notices.map((n) => (
              <li key={n.id}><Link to={`/notices/${n.id}`}>{n.title}</Link></li>
            ))}
          </ul>
        ) : <p className="muted">아직 올라온 통신문이 없어요</p>}
      </section>
    </div>
  )
}
