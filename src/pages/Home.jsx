import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useSession } from '../session.jsx'
import { useToday, formatDate } from '../util.js'
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
import { useTimetable } from './Timetable.jsx'
import { useAnnouncements } from './Announcements.jsx'
import { useOpenReports } from './Reports.jsx'
import { DdayStrip } from './Dday.jsx'
import { PaperIcon, MegaphoneIcon, CalendarIcon, BellIcon } from '../components/Icons.jsx'

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
  const t = useToday()
  const meals = useMeals(t, t)
  const shown = meals.list.find((m) => m.meal_type === (mealType ?? defaultMeal(meals.list)))
  const { done, toggle } = useDone()
  const timetable = useTimetable(t, t)
  const openReports = useOpenReports(member.class_id, isTeacher)
  const { items: announcements } = useAnnouncements(member.class_id, 1)
  // 일주일 안의 최신 공지만 홈 위쪽에
  const recent = announcements?.[0] && Date.now() - new Date(announcements[0].created_at) < 7 * 86400_000 ? announcements[0] : null
  const [classCalls, setClassCalls] = useState(null)
  // 끝낸 건 빼고 가까운 순서로 4개
  const soon = assessments.filter((a) => !done.has(a.id)).slice(0, 3)
  // 사흘 안에 올라온 통신문 수
  const newNotices = notices.filter((n) => Date.now() - new Date(n.created_at) < 3 * 86400_000).length

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

  const alerts = canPost && (classCalls || openReports > 0)

  return (
    <div className="page">
      <header className="hero">
        <div className="hero-top">
          <div>
            <p className="hero-date">{formatDate(t)}</p>
            <h1 className="hero-class">{member.classes.name}</h1>
            {member.classes.school_name && <p className="hero-school">{member.classes.school_name}</p>}
          </div>
          <div className="masthead-actions">
            {isTeacher && <Link className="hero-btn" to="/class">반 관리</Link>}
            <Link to="/account" className="masthead-avatar" aria-label="내 계정">
              <Avatar url={avatarUrl(avatarPath)} name={member.display_name} size={40} />
            </Link>
          </div>
        </div>
        <Link to="/timetable" className="hero-tt" aria-label="오늘 시간표, 눌러서 이번 주 보기">
          {timetable.data.length
            ? [...timetable.data].sort((a, b) => a.period - b.period).map((r) => (
              <span key={r.period}><b>{r.period}</b>{r.subject}</span>
            ))
            : <span className="hero-tt-empty">{timetable.loading ? '시간표 불러오는 중…' : '오늘은 수업이 없어요 · 이번 주 시간표 보기'}</span>}
        </Link>
      </header>

      {recent && (
        <Link to="/announcements" className="home-announce">
          <span className="label">선생님 공지</span>
          <b>{recent.title}</b>
          {recent.body && <p>{recent.body}</p>}
        </Link>
      )}

      {alerts && (
        <div className="alert-row">
          {classCalls > 0 && <Link to="/calls" className="call-strip has-calls"><b>관리자 호출</b><span className="fine">오늘 {classCalls}건</span></Link>}
          {openReports > 0 && <Link to="/reports" className="call-strip has-calls"><b>채팅 신고</b><span className="fine">{openReports}건</span></Link>}
        </div>
      )}

      <DdayStrip />

      <section className="section">
        <div className="section-head">
          <h2>오늘 급식{shown?.calories && <span className="fine h2-note">{shown.calories.replace(' Kcal', ' kcal')}</span>}</h2>
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
            </>
          )
          : <p className="empty">오늘은 급식이 없어요.</p>}
        <Link className="more" to="/meals">다른 날 급식 · 알레르기 보기</Link>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>곧 마감</h2>
          <Link className="more" to="/assessments">전체</Link>
        </div>
        {soon.length
          ? <DueList items={soon} done={done} onToggle={toggle} />
          : <p className="empty">{assessments.length ? '다가오는 수행평가를 다 끝냈어요.' : '다가오는 수행평가가 없어요.'}</p>}
        <PushToggle compact />
      </section>

      <nav className="quick" aria-label="바로가기">
        <Link to="/notices" className="q-sky"><span className="quick-icon"><PaperIcon /></span>통신문{newNotices > 0 && <span className="badge">{newNotices}</span>}</Link>
        <Link to="/announcements" className="q-sun"><span className="quick-icon"><MegaphoneIcon /></span>공지</Link>
        <Link to="/dday" className="q-mint"><span className="quick-icon"><CalendarIcon /></span>일정</Link>
        <Link to="/calls" className="q-lilac"><span className="quick-icon"><BellIcon /></span>호출</Link>
      </nav>

      <InstallHint />
      <NeisCredit what="급식·시간표·학사일정" />
    </div>
  )
}
