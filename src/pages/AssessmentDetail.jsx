import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useSession } from '../session.jsx'
import { formatDate } from '../util.js'
import { DueMark } from '../components/DueList.jsx'
import { useDone } from '../done.js'
import { downloadIcs } from '../ics.js'

export default function AssessmentDetail() {
  const { id } = useParams()
  const { canPost } = useSession()
  const navigate = useNavigate()
  const [a, setA] = useState(null)
  const { done, toggle } = useDone()

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
        <h1>{a.title}</h1>
        <p className="detail-due"><DueMark date={a.due_date} done={done.has(a.id)} /> {formatDate(a.due_date)}</p>
      </header>
      <dl className="facts">
        <div><dt>과목</dt><dd>{a.subject}</dd></div>
        {a.kind && <div><dt>평가 방식</dt><dd>{a.kind}</dd></div>}
        {a.weight != null && <div><dt>반영 비율</dt><dd>{a.weight}%</dd></div>}
      </dl>
      {a.content && (
        <section className="section">
          <h2>세부 내용</h2>
          <p className="prose">{a.content}</p>
        </section>
      )}
      {a.materials && (
        <section className="section">
          <h2>준비물</h2>
          <p className="prose">{a.materials}</p>
        </section>
      )}
      <div className="stack-buttons">
        <button className={done.has(a.id) ? 'btn-done on' : 'btn-done'} aria-pressed={done.has(a.id)} onClick={() => toggle(a.id)}>
          {done.has(a.id) ? '다 했어요 ✓' : '다 했으면 눌러 주세요'}
        </button>
        <button className="btn-quiet" onClick={() => downloadIcs([a], `${a.subject}-${a.title}.ics`)}>휴대폰 캘린더에 추가</button>
      </div>
      {canPost && (
        <div className="actions">
          <Link className="btn-quiet" to={`/assessments/${id}/edit`}>수정</Link>
          <button className="btn-danger" onClick={remove}>삭제</button>
        </div>
      )}
    </div>
  )
}
