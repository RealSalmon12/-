import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useSession, ROLE_NAMES } from '../session.jsx'
import { today, formatDate, addDays } from '../util.js'
import { useMeals } from './Meals.jsx'
import Tray from '../components/Tray.jsx'
import NeisCredit from '../components/NeisCredit.jsx'
import MealRating from '../components/MealRating.jsx'
import DueList from '../components/DueList.jsx'
import InstallHint from '../components/InstallHint.jsx'
import PushToggle from '../components/PushToggle.jsx'
import Avatar from '../components/Avatar.jsx'
import { useChatUrls, useMyAvatarPath } from '../chatMedia.js'
import { useDone } from '../done.js'
import { useNeis } from '../neis.js'
import { useTimetable } from './Timetable.jsx'
import { useCallsUsed, useCallLimit } from './Calls.jsx'
import { useAnnouncements } from './Announcements.jsx'
import { useOpenReports } from './Reports.jsx'
import { DdayStrip } from './Dday.jsx'

// 오후 1시 반이 지나면 석식부터 보여줌
const defaultMeal = (list) => {
  const hour = Number(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', hour12: false }))
  const want = hour >= 13 ? '석식' : '중식'
  return list.find((m) => m.meal_type === want)?.meal_type ?? list[0]?.meal_type
}

export default function Home() {
  const { user, member, isTeacher, canPost } = useSession()
  const [avatarPath] = useMyAvatarPath(user.id, member.class_id)
  const avatarUrl = useChatUrls([avatarPath])
  const [assessments, setAssessments] = useState([])
  const [notices, setNotices] = useState([])
  const [mealType, setMealType] = useState(null)
  const t = today()
  const meals = useMeals(t, t)
  const shown = meals.list.find((m) => m.meal_type === (mealType ?? defaultMeal(meals.list)))
  const { done, toggle } = useDone()
  const timetable = useTimetable(t, t)
  const [callsUsed] = useCallsUsed()
  const callLimit = useCallLimit(member.class_id)
  const openReports = useOpenReports(member.class_id, isTeacher)
  const { items: announcements } = useAnnouncements(member.class_id, 1)
  // 일주일 안의 최신 공지만 홈 위쪽에
  const recent = announcements?.[0] && Date.now() - new Date(announcements[0].created_at) < 7 * 86400_000 ? announcements[0] : null
  const [classCalls, setClassCalls] = useState(null)
  const school = useNeis('schedule', { from: t, to: addDays(t, 30) })
  // 끝낸 건 빼고 가까운 순서로 4개
  const soon = assessments.filter((a) => !done.has(a.id)).slice(0, 4)

  useEffect(() => {
    supabase.from('assessments').select('*')
      .eq('class_id', member.class_id).gte('due_date', t).order('due_date').order('subject').limit(20)
      .then(({ data }) => setAssessments(data ?? []))
    supabase.from('notices').select('id, title, created_at, due_date')
      .eq('class_id', member.class_id).order('created_at', { ascending: false }).limit(3)
      .then(({ data }) => setNotices(data ?? []))
    if (canPost) {
      supabase.from('admin_calls').select('id', { count: 'exact', head: true })
        .eq('class_id', member.class_id).gte('created_at', `${t}T00:00:00+09:00`)
        .then(({ count, error }) => setClassCalls(error ? null : count ?? 0))
    }
  }, [member.class_id, t, canPost])

  return (
    <div className="page">
      <header className="masthead">
        <div>
          <p className="masthead-date">{formatDate(t)}{member.classes.school_name && <span className="masthead-school">{member.classes.school_name}</span>}</p>
          <h1 className="masthead-class">{member.classes.name}</h1>
          <p className="masthead-me">{ROLE_NAMES[member.role]} {member.display_name}</p>
        </div>
        <div className="masthead-actions">
          <Link to="/account#profile" className="masthead-avatar" aria-label="내 프로필 수정">
            <Avatar url={avatarUrl(avatarPath)} name={member.display_name} size={40} />
          </Link>
          {isTeacher
            ? <Link className="btn-quiet" to="/class">반 관리</Link>
            : <Link className="btn-quiet" to="/account">내 계정</Link>}
        </div>
      </header>

      {timetable.data.length > 0 && (
        <Link to="/timetable" className="today-strip" aria-label="오늘 시간표, 눌러서 이번 주 보기">
          {[...timetable.data].sort((a, b) => a.period - b.period).map((r) => (
            <span key={r.period}><b>{r.period}</b>{r.subject}</span>
          ))}
        </Link>
      )}

      <DdayStrip />

      {recent ? (
        <Link to="/announcements" className="home-announce">
          <span className="label">선생님 공지</span>
          <b>{recent.title}</b>
          {recent.body && <p>{recent.body}</p>}
        </Link>
      ) : isTeacher && (
        <Link to="/announcements" className="call-strip"><b>선생님 공지 보내기</b><span className="fine">반 전체에 알림</span></Link>
      )}

      {openReports > 0 && (
        <Link to="/reports" className="call-strip has-calls"><b>채팅 신고</b><span className="fine">처리할 신고 {openReports}건</span></Link>
      )}

      <Link to="/calls" className={`call-strip${canPost && classCalls ? ' has-calls' : ''}`}>
        <b>관리자 호출</b>
        <span className="fine">
          {canPost
            ? (classCalls ? `오늘 ${classCalls}건 들어왔어요` : '오늘 들어온 호출 없음')
            : (callsUsed === null ? '' : `오늘 ${Math.max(0, callLimit - callsUsed)}번 남음`)}
        </span>
      </Link>

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
              <MealRating date={t} type={shown.meal_type} />
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
        {soon.length
          ? <DueList items={soon} done={done} onToggle={toggle} />
          : <p className="empty">{assessments.length ? '다가오는 수행평가를 다 끝냈어요.' : '다가오는 수행평가가 없어요.'}</p>}
        <PushToggle compact />
      </section>

      {school.data.length > 0 && (
        <section className="section">
          <h2>학교 일정</h2>
          <ul className="plain-list">
            {school.data.slice(0, 3).map((e) => (
              <li key={e.date + e.name} className="plain-row">
                <span>{e.name}</span>
                <span className="fine">{formatDate(e.date)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

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

      <NeisCredit what="급식·시간표·학사일정" />
      <InstallHint />
    </div>
  )
}
