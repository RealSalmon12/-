import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useSession } from '../session.jsx'
import { formatDate } from '../util.js'
import { DueMark } from '../components/DueList.jsx'

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

  if (!a) return <div className="page" />
  return (
    <div className="page">
      <button className="back" onClick={() => navigate(-1)}>‹ 뒤로</button>
      <header className="detail-head">
        <p className="due-subject">{a.subject}</p>
        <h1>{a.title}</h1>
        <p className="detail-due"><DueMark date={a.due_date} /> {formatDate(a.due_date)}</p>
      </header>
      {a.content && <p className="prose">{a.content}</p>}
      {a.materials && (
        <section className="section">
          <h2>준비물</h2>
          <p className="prose">{a.materials}</p>
        </section>
      )}
      {canPost && (
        <div className="actions">
          <Link className="btn-quiet" to={`/assessments/${id}/edit`}>수정</Link>
          <button className="btn-danger" onClick={remove}>삭제</button>
        </div>
      )}
    </div>
  )
}
