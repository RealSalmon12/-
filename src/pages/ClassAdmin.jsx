import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useSession, ROLE_NAMES } from '../session.jsx'

export default function ClassAdmin() {
  const { member, isTeacher, reloadMember } = useSession()
  const navigate = useNavigate()
  const [members, setMembers] = useState([])
  const [grade, setGrade] = useState(member.classes.grade ?? '')
  const [classNo, setClassNo] = useState(member.classes.class_no ?? '')
  const [saved, setSaved] = useState('')

  const load = () =>
    supabase.from('members').select('user_id, display_name, role')
      .eq('class_id', member.class_id).order('display_name')
      .then(({ data }) => setMembers(data ?? []))

  useEffect(() => { load() }, [member.class_id])

  if (!isTeacher) return <div className="page empty">선생님만 볼 수 있어요.</div>

  async function setRole(userId, role) {
    await supabase.from('members').update({ role }).eq('class_id', member.class_id).eq('user_id', userId)
    load()
  }

  async function kick(m) {
    if (!confirm(`${m.display_name} 학생을 반에서 내보낼까요?`)) return
    await supabase.from('members').delete().eq('class_id', member.class_id).eq('user_id', m.user_id)
    load()
  }

  async function saveClass(e) {
    e.preventDefault()
    const { error } = await supabase.from('classes')
      .update({ grade: Number(grade), class_no: Number(classNo), name: `${grade}학년 ${classNo}반` })
      .eq('id', member.class_id)
    setSaved(error ? 'DB 업데이트(002_real_use.sql)를 먼저 실행해 주세요.' : '저장했어요.')
    if (!error) reloadMember()
  }

  async function resetCode() {
    if (!confirm('초대 코드를 새로 만들면 예전 코드는 못 써요. 계속할까요?')) return
    await supabase.rpc('reset_invite_code', { cid: member.class_id })
    reloadMember()
  }

  return (
    <div className="page">
      <button className="back" onClick={() => navigate(-1)}>‹ 뒤로</button>
      <h1>반 관리</h1>
      <section className="invite">
        <span className="fine">학생들에게 알려줄 초대 코드</span>
        <span className="code">{member.classes.invite_code}</span>
        <button className="btn-text" onClick={resetCode}>코드 새로 만들기</button>
      </section>
      <form className="section" onSubmit={saveClass}>
        <h2>학년과 반</h2>
        <p className="fine">시간표를 NEIS에서 불러올 때 써요.</p>
        <div className="field-row">
          <label>학년
            <select value={grade} onChange={(e) => setGrade(e.target.value)} required>
              <option value="" disabled>고르기</option>
              {[1, 2, 3].map((g) => <option key={g} value={g}>{g}학년</option>)}
            </select>
          </label>
          <label>반
            <input type="number" inputMode="numeric" min="1" max="20" value={classNo} onChange={(e) => setClassNo(e.target.value)} required />
          </label>
        </div>
        <div className="actions">
          <button className="btn-quiet">저장</button>
          {saved && <span className="fine" role="status">{saved}</span>}
        </div>
      </form>
      <section className="section">
        <h2>멤버 {members.length}명</h2>
        <ul className="member-list">
          {members.map((m) => (
            <li key={m.user_id}>
              <span>{m.display_name}</span>
              {m.role === 'teacher' ? <span className="fine">{ROLE_NAMES.teacher}</span> : (
                <span className="member-actions">
                  <select value={m.role} onChange={(e) => setRole(m.user_id, e.target.value)}>
                    <option value="student">학생</option>
                    <option value="president">반장</option>
                    <option value="vice">부반장</option>
                  </select>
                  <button className="btn-text danger" onClick={() => kick(m)}>내보내기</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>
      <button className="btn-text quiet" onClick={() => supabase.auth.signOut()}>로그아웃</button>
    </div>
  )
}
