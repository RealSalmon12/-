import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useSession } from '../session.jsx'
import { formatDate, dday } from '../util.js'

export default function AssessmentDetail() {
  const { id } = useParams()
  const { canPost } = useSession()
  const navigate = useNavigate()
  const [a, setA] = useState(null)

  useEffect(() => {
    supabase.from('assessments').select('*').eq('id', id).single().then(({ data }) => setA(data))
  }, [id])

  async function remove() {
    if (!confirm('이 수행평가를 지울까요?')) return
    await supabase.from('assessments').delete().eq('id', id)
    navigate('/assessments', { replace: true })
  }

  if (!a) return <div className="page muted">불러오는 중…</div>
  return (
    <div className="page stack">
      <button className="link back" onClick={() => navigate(-1)}>‹ 뒤로</button>
      <span className="subject">{a.subject}</span>
      <h1>{a.title}</h1>
      <p className="row gap"><span className="badge">{dday(a.due_date)}</span> {formatDate(a.due_date)}</p>
      {a.content && <section className="card pre">{a.content}</section>}
      {a.materials && (
        <section className="card">
          <h2>준비물</h2>
          <p className="pre">{a.materials}</p>
        </section>
      )}
      {canPost && (
        <div className="row gap">
          <Link className="button" to={`/assessments/${id}/edit`}>수정</Link>
          <button className="danger" onClick={remove}>삭제</button>
        </div>
      )}
    </div>
  )
}
