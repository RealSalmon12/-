import { useState } from 'react'
import { supabase } from '../supabase.js'
import { useSession } from '../session.jsx'

export default function Join() {
  const { user, reloadMember } = useSession()
  const [name, setName] = useState(user.user_metadata?.full_name ?? '')
  const [code, setCode] = useState('')
  const [className, setClassName] = useState('')
  const [teacherMode, setTeacherMode] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = teacherMode
      ? await supabase.rpc('create_class', { class_name: className.trim(), my_name: name.trim() })
      : await supabase.rpc('join_class', { code, my_name: name.trim() })
    setBusy(false)
    if (error) return setError(error.message)
    reloadMember()
  }

  return (
    <form className="page stack" onSubmit={submit}>
      <h1>{teacherMode ? '반 만들기' : '반 들어가기'}</h1>
      <label>
        이름
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      {teacherMode ? (
        <label>
          반 이름
          <input value={className} onChange={(e) => setClassName(e.target.value)}
            placeholder="예: 2학년 3반" required />
        </label>
      ) : (
        <label>
          초대 코드 (선생님께 받은 6자리)
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6} autoCapitalize="characters" required />
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <button className="primary big" disabled={busy}>{teacherMode ? '만들기' : '들어가기'}</button>
      <button type="button" className="link" onClick={() => setTeacherMode(!teacherMode)}>
        {teacherMode ? '초대 코드로 들어가기' : '선생님이신가요? 반 만들기'}
      </button>
      <button type="button" className="link muted" onClick={() => supabase.auth.signOut()}>로그아웃</button>
    </form>
  )
}
