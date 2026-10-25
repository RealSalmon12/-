import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useSession } from '../session.jsx'
import { today } from '../util.js'

const EMPTY = { subject: '', due_date: today(), title: '', content: '', materials: '' }

export default function AssessmentForm() {
  const { id } = useParams()
  const { member, canPost } = useSession()
  const navigate = useNavigate()
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!id) return
    supabase.from('assessments').select('subject, due_date, title, content, materials')
      .eq('id', id).single().then(({ data }) => data && setForm(data))
  }, [id])

  if (!canPost) return <div className="page muted">선생님, 반장, 부반장만 쓸 수 있어요.</div>

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    const { data, error } = id
      ? await supabase.from('assessments').update(form).eq('id', id).select('id').single()
      : await supabase.from('assessments').insert({ ...form, class_id: member.class_id }).select('id').single()
    setBusy(false)
    if (error) return setError(error.message)
    navigate(`/assessments/${data.id}`, { replace: true })
  }

  return (
    <form className="page stack" onSubmit={submit}>
      <button type="button" className="link back" onClick={() => navigate(-1)}>‹ 취소</button>
      <h1>{id ? '수행평가 수정' : '수행평가 쓰기'}</h1>
      <label>과목<input value={form.subject} onChange={set('subject')} placeholder="예: 국어" required /></label>
      <label>날짜<input type="date" value={form.due_date} onChange={set('due_date')} required /></label>
      <label>제목<input value={form.title} onChange={set('title')} placeholder="예: 시 낭송 발표" required /></label>
      <label>내용<textarea rows={6} value={form.content} onChange={set('content')} /></label>
      <label>준비물 (선택)<textarea rows={2} value={form.materials} onChange={set('materials')} /></label>
      {error && <p className="error">{error}</p>}
      <button className="primary big" disabled={busy}>저장</button>
    </form>
  )
}
