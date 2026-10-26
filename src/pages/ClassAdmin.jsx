import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useSession, ROLE_NAMES } from '../session.jsx'

export default function ClassAdmin() {
  const { member, isTeacher, reloadMember } = useSession()
  const navigate = useNavigate()
  const [members, setMembers] = useState([])

  const load = () =>
    supabase.from('members').select('user_id, display_name, role')
      .eq('class_id', member.class_id).order('display_name')
      .then(({ data }) => setMembers(data ?? []))

  useEffect(() => { load() }, [member.class_id])

  if (!isTeacher) return <div className="page muted">선생님만 볼 수 있어요.</div>

  async function setRole(userId, role) {
    await supabase.from('members').update({ role }).eq('class_id', member.class_id).eq('user_id', userId)
    load()
  }

  async function kick(m) {
    if (!confirm(`${m.display_name} 학생을 반에서 내보낼까요?`)) return
    await supabase.from('members').delete().eq('class_id', member.class_id).eq('user_id', m.user_id)
    load()
  }

  async function resetCode() {
    if (!confirm('초대 코드를 새로 만들면 예전 코드는 못 써요. 계속할까요?')) return
    await supabase.rpc('reset_invite_code', { cid: member.class_id })
    reloadMember()
  }

  return (
    <div className="page stack">
      <button className="link back" onClick={() => navigate(-1)}>‹ 뒤로</button>
      <h1>반 관리</h1>
      <section className="card stack-sm">
        <span className="muted small">학생들에게 알려줄 초대 코드</span>
        <span className="code">{member.classes.invite_code}</span>
        <button className="link" onClick={resetCode}>코드 새로 만들기</button>
      </section>
      <section className="card">
        <h2>멤버 {members.length}명</h2>
        <ul className="list">
          {members.map((m) => (
            <li key={m.user_id} className="row between">
              <span>{m.display_name}</span>
              {m.role === 'teacher' ? <span className="badge">{ROLE_NAMES.teacher}</span> : (
                <span className="row gap">
                  <select value={m.role} onChange={(e) => setRole(m.user_id, e.target.value)}>
                    <option value="student">학생</option>
                    <option value="president">반장</option>
                    <option value="vice">부반장</option>
                  </select>
                  <button className="link danger-text" onClick={() => kick(m)}>내보내기</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
      <button className="link muted" onClick={() => supabase.auth.signOut()}>로그아웃</button>
    </div>
  )
}
