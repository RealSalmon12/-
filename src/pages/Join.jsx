import { useState } from 'react'
import { supabase } from '../supabase.js'
import { useSession } from '../session.jsx'
import SchoolPicker, { gradesFor } from '../components/SchoolPicker.jsx'

export default function Join() {
  const { user, reloadMember } = useSession()
  const [name, setName] = useState(user.user_metadata?.full_name ?? '')
  const [code, setCode] = useState('')
  const [school, setSchool] = useState(null)
  const [grade, setGrade] = useState('')
  const [classNo, setClassNo] = useState('')
  const [teacherMode, setTeacherMode] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (teacherMode && !school) return setError('학교를 먼저 찾아서 골라 주세요.')
    setBusy(true)
    setError('')
    const { error } = teacherMode
      ? await supabase.rpc('create_class', {
        class_grade: Number(grade), class_number: Number(classNo), my_name: name.trim(),
        office: school.office, school: school.code, school_title: school.name, kind: school.kind
      })
      : await supabase.rpc('join_class', { code, my_name: name.trim() })
    setBusy(false)
    if (error) {
      return setError(/create_class|function/.test(error.message)
        ? 'DB 업데이트가 아직 안 됐어요. Supabase에서 003_school_picker.sql 을 실행해 주세요.'
        : error.message)
    }
    reloadMember()
  }

  return (
    <form className="page form" onSubmit={submit}>
      <h1>{teacherMode ? '반 만들기' : '반 들어가기'}</h1>
      <label>
        이름
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      {teacherMode ? (
        <>
        <SchoolPicker value={school} onChange={setSchool} />
        <div className="field-row">
          <label>
            학년
            <select value={grade} onChange={(e) => setGrade(e.target.value)} required>
              <option value="" disabled>고르기</option>
              {gradesFor(school?.kind).map((g) => <option key={g} value={g}>{g}학년</option>)}
            </select>
          </label>
          <label>
            반
            <input type="number" inputMode="numeric" min="1" max="20" value={classNo}
              onChange={(e) => setClassNo(e.target.value)} placeholder="예: 3" required />
          </label>
        </div>
        </>
      ) : (
        <label>
          초대 코드 (선생님께 받은 6자리)
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
            maxLength={6} autoCapitalize="characters" required />
        </label>
      )}
      {error && <p className="error">{error}</p>}
      <button className="btn-primary" disabled={busy}>{teacherMode ? '만들기' : '들어가기'}</button>
      <button type="button" className="btn-text" onClick={() => setTeacherMode(!teacherMode)}>
        {teacherMode ? '초대 코드로 들어가기' : '선생님이신가요? 반 만들기'}
      </button>
      <button type="button" className="btn-text quiet" onClick={() => supabase.auth.signOut()}>로그아웃</button>
    </form>
  )
}
