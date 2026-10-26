import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useSession, ROLE_NAMES } from '../session.jsx'

export default function Account() {
  const { user, member, isTeacher, reloadMember } = useSession()
  const navigate = useNavigate()
  const [otherTeachers, setOtherTeachers] = useState(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!isTeacher) return
    supabase.from('members').select('user_id', { count: 'exact', head: true })
      .eq('class_id', member.class_id).eq('role', 'teacher').neq('user_id', user.id)
      .then(({ count }) => setOtherTeachers(count ?? 0))
  }, [isTeacher, member.class_id, user.id])

  // 마지막 선생님이 나가면 반이 통째로 지워짐
  const deletesClass = isTeacher && otherTeachers === 0
  const word = '초기화'

  async function reset(e) {
    e.preventDefault()
    if (!deletesClass && !confirm(`${member.classes.name}에서 나갈까요? 내 완료 체크도 지워져요.`)) return
    setBusy(true)
    setError('')
    if (deletesClass) {
      // 통신문 사진은 DB 와 따로 저장돼 있어서 먼저 지움
      const { data: files } = await supabase.storage.from('notices').list(member.class_id, { limit: 1000 })
      if (files?.length) {
        await supabase.storage.from('notices').remove(files.map((f) => `${member.class_id}/${f.name}`))
      }
    }
    const { error } = await supabase.rpc('leave_class')
    setBusy(false)
    if (error) {
      setError(error.message.includes('leave_class')
        ? 'DB 업데이트(004_account_reset.sql)를 먼저 실행해 주세요.'
        : '초기화하지 못했어요. 잠시 뒤 다시 해 주세요.')
      return
    }
    navigate('/', { replace: true })
    reloadMember()
  }

  return (
    <div className="page">
      <button className="back" onClick={() => navigate(-1)}>‹ 뒤로</button>
      <h1>내 계정</h1>
      <dl className="facts">
        <div><dt>이름</dt><dd>{member.display_name}</dd></div>
        <div><dt>역할</dt><dd>{ROLE_NAMES[member.role]}</dd></div>
        <div><dt>반</dt><dd>{member.classes.school_name ? `${member.classes.school_name} ` : ''}{member.classes.name}</dd></div>
        <div><dt>로그인</dt><dd>{user.email}</dd></div>
      </dl>
      <button className="btn-quiet self-start" onClick={() => supabase.auth.signOut()}>로그아웃</button>

      <form className="section danger-zone" onSubmit={reset}>
        <h2>계정 초기화</h2>
        {deletesClass ? (
          <>
            <p className="fine">
              이 반의 선생님이 나 혼자라서, 초기화하면 <b>반 전체가 지워져요.</b> 수행평가, 가정통신문과 사진,
              멤버 목록이 모두 사라지고 되돌릴 수 없어요. 학생들도 반에서 빠지게 돼요.
            </p>
            <label>계속하려면 "{word}"라고 적어 주세요
              <input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </label>
          </>
        ) : (
          <p className="fine">
            {member.classes.name}에서 나가고 처음 화면으로 돌아가요. 반의 수행평가와 통신문은 그대로 남고,
            내 완료 체크만 지워져요. 초대 코드로 언제든 다시 들어올 수 있어요.
          </p>
        )}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn-danger" disabled={busy || (isTeacher && otherTeachers === null) || (deletesClass && typed.trim() !== word)}>
          {busy ? '초기화하는 중…' : deletesClass ? '반 지우고 초기화' : '반 나가고 초기화'}
        </button>
      </form>
    </div>
  )
}
