import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useSession, ROLE_NAMES } from '../session.jsx'
import { today, formatDate } from '../util.js'
import { useMeals } from './Meals.jsx'
import Tray from '../components/Tray.jsx'
import DueList from '../components/DueList.jsx'

// 오후 1시 반이 지나면 석식부터 보여줌
const defaultMeal = (list) => {
  const hour = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', hour12: false }))
  const want = hour >= 13 ? '석식' : '중식'
  return list.find((m) => m.meal_type === want)?.meal_type ?? list[0]?.meal_type
}

export default function Home() {
  const { member, isTeacher } = useSession()
  const [assessments, setAssessments] = useState([])
  const [notices, setNotices] = useState([])
  const [mealType, setMealType] = useState(null)
  const t = today()
  const meals = useMeals(t, t)
  const shown = meals.list.find((m) => m.meal_type === (mealType ?? defaultMeal(meals.list)))

  useEffect(() => {
    supabase.from('assessments').select('id, subject, title, due_date')
      .eq('class_id', member.class_id).gte('due_date', t).order('due_date').limit(4)
      .then(({ data }) => setAssessments(data ?? []))
    supabase.from('notices').select('id, title, created_at, due_date')
      .eq('class_id', member.class_id).order('created_at', { ascending: false }).limit(3)
      .then(({ data }) => setNotices(data ?? []))
  }, [member.class_id, t])

  return (
    <div className="page">
      <header className="masthead">
        <div>
          <p className="masthead-date">{formatDate(t)}</p>
          <h1 className="masthead-class">{member.classes.name}</h1>
          <p className="masthead-me">{ROLE_NAMES[member.role]} {member.display_name}</p>
        </div>
        {isTeacher
          ? <Link className="btn-quiet" to="/class">반 관리</Link>
          : <button className="btn-quiet" onClick={() => supabase.auth.signOut()}>로그아웃</button>}
      </header>

      <section className="section">
        <div className="section-head">
          <h2>오늘 급식</h2>
          {meals.list.length > 1 && (
            <div className="toggle" role="tablist">
              {meals.list.map((m) => (
                <button key={m.meal_type} role="tab" aria-selected={shown === m}
                  className={shown === m ? 'on' : ''} onClick={() => setMealType(m.meal_type)}>
                  {m.meal_type}
                </button>
              ))}
            </div>
          )}
        </div>
        {meals.loading ? <div className="tray tray-ghost" />
          : shown ? (
            <>
              <Tray dishes={shown.dishes} />
              {shown.calories && <p className="fine">{shown.calories.replace(' Kcal', ' kcal')}</p>}
            </>
          )
          : <p className="empty">오늘은 급식이 없어요.</p>}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>곧 마감</h2>
          <Link className="more" to="/assessments">전체 보기</Link>
        </div>
        {assessments.length
          ? <DueList items={assessments} />
          : <p className="empty">다가오는 수행평가가 없어요.</p>}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>새 가정통신문</h2>
          <Link className="more" to="/notices">전체 보기</Link>
        </div>
        {notices.length ? (
          <ul className="plain-list">
            {notices.map((n) => (
              <li key={n.id}>
                <Link to={`/notices/${n.id}`} className="plain-row">
                  <span>{n.title}</span>
                  {n.due_date && <span className="fine">{formatDate(n.due_date)}까지</span>}
                </Link>
              </li>
            ))}
          </ul>
        ) : <p className="empty">아직 올라온 통신문이 없어요.</p>}
      </section>
    </div>
  )
}
