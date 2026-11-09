import { lazy, Suspense } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useSession } from './session.jsx'
import Login from './pages/Login.jsx'
import Join from './pages/Join.jsx'
import Home from './pages/Home.jsx'
import GuestHome from './pages/GuestHome.jsx'
import { UnreadProvider, useUnread, Badge } from './unread.jsx'
import { HomeIcon, PencilIcon, GridIcon, ChatIcon, TrayIcon } from './components/Icons.jsx'

// 홈 말고 다른 화면은 들어갈 때 받음 (처음 열 때 받는 양 줄이기)
const Assessments = lazy(() => import('./pages/Assessments.jsx'))
const AssessmentDetail = lazy(() => import('./pages/AssessmentDetail.jsx'))
const AssessmentForm = lazy(() => import('./pages/AssessmentForm.jsx'))
const Notices = lazy(() => import('./pages/Notices.jsx'))
const NoticeDetail = lazy(() => import('./pages/NoticeDetail.jsx'))
const NoticeForm = lazy(() => import('./pages/NoticeForm.jsx'))
const Meals = lazy(() => import('./pages/Meals.jsx'))
const ClassAdmin = lazy(() => import('./pages/ClassAdmin.jsx'))
const Timetable = lazy(() => import('./pages/Timetable.jsx'))
const Account = lazy(() => import('./pages/Account.jsx'))
const Calls = lazy(() => import('./pages/Calls.jsx'))
const Chat = lazy(() => import('./pages/Chat.jsx'))
const Dm = lazy(() => import('./pages/Dm.jsx'))
const Announcements = lazy(() => import('./pages/Announcements.jsx'))
const Reports = lazy(() => import('./pages/Reports.jsx'))
const Dday = lazy(() => import('./pages/Dday.jsx'))

// 급식·가정통신문은 홈에서 바로 보이므로 탭에서 뺌 (홈에서 눌러 들어가면 홈 탭이 켜져 있음)
const underHome = (path) => path === '/meals' || path.startsWith('/notices')
const TABS = [
  { to: '/', label: '홈', Icon: HomeIcon },
  { to: '/assessments', label: '수행평가', Icon: PencilIcon },
  { to: '/timetable', label: '시간표', Icon: GridIcon },
  { to: '/chat', label: '채팅', Icon: ChatIcon }
]

export default function App() {
  const { user, member, isGuest } = useSession()
  const { pathname } = useLocation()

  if (user === undefined || (user && member === undefined)) {
    return <div className="boot"><img src="/icon-192.png" alt="BacoClass 불러오는 중" /></div>
  }
  if (!user) return isGuest ? <GuestShell /> : <Login />
  if (!member) return <Join />

  return (
    <UnreadProvider>
      <Shell pathname={pathname} />
    </UnreadProvider>
  )
}

function Shell({ pathname }) {
  const { total } = useUnread()
  return (
    <div className="app">
      <main>
        <Suspense fallback={<div className="page-loading" aria-label="불러오는 중" />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/assessments" element={<Assessments />} />
          <Route path="/assessments/new" element={<AssessmentForm />} />
          <Route path="/assessments/:id" element={<AssessmentDetail />} />
          <Route path="/assessments/:id/edit" element={<AssessmentForm />} />
          <Route path="/notices" element={<Notices />} />
          <Route path="/notices/new" element={<NoticeForm />} />
          <Route path="/notices/:id" element={<NoticeDetail />} />
          <Route path="/timetable" element={<Timetable />} />
          <Route path="/meals" element={<Meals />} />
          <Route path="/class" element={<ClassAdmin />} />
          <Route path="/account" element={<Account />} />
          <Route path="/calls" element={<Calls />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/dm" element={<Dm />} />
          <Route path="/dm/:studentId" element={<Dm />} />
          <Route path="/announcements" element={<Announcements />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/dday" element={<Dday />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'}
            // 1:1 채팅은 채팅 탭에, 급식·가정통신문은 홈 탭에 속함
            className={({ isActive }) => (isActive || (t.to === '/chat' && pathname.startsWith('/dm'))
              || (t.to === '/' && underHome(pathname)) ? 'active' : '')}>
            <span className="tab-icon">
              <t.Icon />
              {t.to === '/chat' && <Badge n={total} />}
            </span>
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

// 로그인 없이 둘러보기: 홈(오늘), 급식, 시간표만
const GUEST_TABS = [
  { to: '/', label: '홈', Icon: HomeIcon },
  { to: '/meals', label: '급식', Icon: TrayIcon },
  { to: '/timetable', label: '시간표', Icon: GridIcon }
]

function GuestShell() {
  return (
    <div className="app">
      <main>
        <Suspense fallback={<div className="page-loading" aria-label="불러오는 중" />}>
          <Routes>
            <Route path="/" element={<GuestHome />} />
            <Route path="/meals" element={<Meals />} />
            <Route path="/timetable" element={<Timetable />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </main>
      <nav className="tabbar">
        {GUEST_TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'}>
            <span className="tab-icon"><t.Icon /></span>
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
