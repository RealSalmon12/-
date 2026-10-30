import { NavLink } from 'react-router-dom'
import { useSession } from '../session.jsx'
import { useUnread, Badge } from '../unread.jsx'

// 채팅 화면 위쪽: 반 채팅 / 선생님과 1:1
export default function ChatTabs() {
  const { isTeacher } = useSession()
  const { classCount, dm } = useUnread()
  const dmCount = Object.values(dm).reduce((a, b) => a + b, 0)
  return (
    <nav className="toggle chat-tabs" aria-label="채팅 종류">
      <NavLink to="/chat" className={({ isActive }) => (isActive ? 'on' : '')}>반 채팅<Badge n={classCount} /></NavLink>
      <NavLink to="/dm" className={({ isActive }) => (isActive ? 'on' : '')}>{isTeacher ? '학생과 1:1' : '선생님과 1:1'}<Badge n={dmCount} /></NavLink>
    </nav>
  )
}
