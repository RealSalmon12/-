import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
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
import { HomeIcon, PencilIcon, PaperIcon, TrayIcon, GridIcon } from './components/Icons.jsx'

const TABS = [
  { to: '/', label: '홈', Icon: HomeIcon },
  { to: '/assessments', label: '수행평가', Icon: PencilIcon },
  { to: '/timetable', label: '시간표', Icon: GridIcon },
  { to: '/notices', label: '통신문', Icon: PaperIcon },
  { to: '/meals', label: '급식', Icon: TrayIcon }
]

export default function App() {
  const { user, member } = useSession()

  if (user === undefined || (user && member === undefined)) {
    return <div className="splash" aria-label="불러오는 중" />
  }
  if (!user) return <Login />
  if (!member) return <Join />

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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <nav className="tabbar">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'}>
            <t.Icon />
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
