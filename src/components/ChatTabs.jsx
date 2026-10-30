import { NavLink } from 'react-router-dom'
import { useSession } from '../session.jsx'

// 채팅 화면 위쪽: 반 채팅 / 선생님과 1:1
export default function ChatTabs() {
  const { isTeacher } = useSession()
  return (
    <nav className="toggle chat-tabs" aria-label="채팅 종류">
      <NavLink to="/chat" className={({ isActive }) => (isActive ? 'on' : '')}>반 채팅</NavLink>
      <NavLink to="/dm" className={({ isActive }) => (isActive ? 'on' : '')}>{isTeacher ? '학생과 1:1' : '선생님과 1:1'}</NavLink>
    </nav>
  )
}
