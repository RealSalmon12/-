import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useSession } from './session.jsx'
import Login from './pages/Login.jsx'
import Join from './pages/Join.jsx'
import Home from './pages/Home.jsx'
import Assessments from './pages/Assessments.jsx'
import AssessmentDetail from './pages/AssessmentDetail.jsx'
import AssessmentForm from './pages/AssessmentForm.jsx'
import Notices from './pages/Notices.jsx'
import NoticeDetail from './pages/NoticeDetail.jsx'
import NoticeForm from './pages/NoticeForm.jsx'
import Meals from './pages/Meals.jsx'
import ClassAdmin from './pages/ClassAdmin.jsx'
import Timetable from './pages/Timetable.jsx'
import Account from './pages/Account.jsx'
import Calls from './pages/Calls.jsx'
import Chat from './pages/Chat.jsx'
import Dm from './pages/Dm.jsx'
import Announcements from './pages/Announcements.jsx'
import Reports from './pages/Reports.jsx'
import Dday from './pages/Dday.jsx'
import { UnreadProvider, useUnread, Badge } from './unread.jsx'
import { HomeIcon, PencilIcon, GridIcon, ChatIcon } from './components/Icons.jsx'

// 급식·가정통신문은 홈에서 바로 보이므로 탭에서 뺌 (홈에서 눌러 들어가면 홈 탭이 켜져 있음)
const underHome = (path) => path === '/meals' || path.startsWith('/notices')
const TABS = [
  { to: '/', label: '홈', Icon: HomeIcon },
  { to: '/assessments', label: '수행평가', Icon: PencilIcon },
  { to: '/timetable', label: '시간표', Icon: GridIcon },
  { to: '/chat', label: '채팅', Icon: ChatIcon }
]

export default function App() {
  const { user, member } = useSession()
  const { pathname } = useLocation()

  if (user === undefined || (user && member === undefined)) {
    return <div className="splash" aria-label="불러오는 중" />
  }
  if (!user) return <Login />
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
