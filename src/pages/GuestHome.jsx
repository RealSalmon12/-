import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useSession } from '../session.jsx'
import { useToday, formatDate, addDays } from '../util.js'
import { useMeals } from './Meals.jsx'
import { useTimetable } from './Timetable.jsx'
import { useNeis } from '../neis.js'
import Tray from '../components/Tray.jsx'
import NeisCredit from '../components/NeisCredit.jsx'

// 게스트 홈: 오늘 시간표, 급식, 학사일정 + 로그인 안내
export default function GuestHome() {
  const { member, endGuest } = useSession()
  const t = useToday()
  const meals = useMeals(t, t)
  const [mealType, setMealType] = useState(null)
  const hour = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', hour12: false }))
  const shown = meals.list.find((m) => m.meal_type === (mealType ?? (hour >= 13 ? '석식' : '중식'))) ?? meals.list[0]
  const timetable = useTimetable(t, t)
  const school = useNeis('schedule', { from: t, to: addDays(t, 30) })
  const signIn = () => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })

  return (
    <div className="page">
      <header className="masthead">
        <div>
          <p className="masthead-date">{formatDate(t)}</p>
          <h1 className="masthead-class">{member.classes.name}</h1>
          <p className="masthead-date">{member.classes.school_name}</p>
        </div>
        <button className="btn-quiet" onClick={endGuest}>학교 바꾸기</button>
      </header>

      <section className="section">
        <div className="section-head">
          <h2>오늘 시간표</h2>
          <Link className="more" to="/timetable">이번 주</Link>
        </div>
        {timetable.data.length ? (
          <Link to="/timetable" className="today-strip">
            {[...timetable.data].sort((a, b) => a.period - b.period).map((r) => (
              <span key={r.period}><b>{r.period}교시</b>{r.subject}</span>
            ))}
          </Link>
        ) : <p className="empty">{timetable.loading ? '불러오는 중…' : timetable.error || '오늘은 수업이 없어요.'}</p>}
      </section>

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
        {meals.loading ? <div className="menu-ghost" />
          : shown ? <Tray dishes={shown.dishes} />
          : <p className="empty">오늘은 급식이 없어요.</p>}
        <Link className="more" to="/meals">다른 날 급식 · 알레르기 보기</Link>
      </section>

      {school.data.length > 0 && (
        <section className="section">
          <h2>학교 일정</h2>
          <ul className="plain-list">
            {school.data.slice(0, 4).map((e) => (
              <li key={e.date + e.name} className="plain-row">
                <span>{e.name}</span>
                <span className="fine">{formatDate(e.date)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <h2>우리 반이랑 같이 쓰기</h2>
        <p className="fine">로그인하고 초대 코드로 반에 들어가면 수행평가 마감, 가정통신문, 반 채팅, 마감 알림까지 쓸 수 있어요.</p>
        <button className="btn-primary" onClick={signIn}>Google 계정으로 로그인</button>
      </section>

      <NeisCredit what="급식·시간표·학사일정" />
    </div>
  )
}
