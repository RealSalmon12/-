import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useSession } from '../session.jsx'
import { today, KINDS } from '../util.js'
import { AttachPicker, uploadDrafts, removeFiles } from '../components/Attachments.jsx'

const EMPTY = { subject: '', due_date: today(), title: '', kind: '', weight: '', content: '', materials: '' }

export default function AssessmentForm() {
  const { id } = useParams()
  const { member, canPost } = useSession()
  const navigate = useNavigate()
  const [form, setForm] = useState(EMPTY)
  const [subjects, setSubjects] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [files, setFiles] = useState([])
  const [saved, setSaved] = useState(null) // 수정 전 첨부 (012 SQL 전이면 null)

  useEffect(() => {
    // 전에 쓴 과목 이름을 추천 목록으로
    supabase.from('assessments').select('subject').eq('class_id', member.class_id)
      .then(({ data }) => setSubjects([...new Set((data ?? []).map((a) => a.subject))].sort()))
    if (!id) return
    supabase.from('assessments').select('*').eq('id', id).single()
      .then(({ data }) => {
        if (!data) return
        setForm({ ...EMPTY, ...data, kind: data.kind ?? '', weight: data.weight ?? '' })
        if (data.attachments) {
          setSaved(data.attachments)
          setFiles(data.attachments)
        }
      })
  }, [id, member.class_id])

  if (!canPost) return <div className="page empty">선생님, 반장, 부반장만 쓸 수 있어요.</div>

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    let attachments
    try {
      attachments = await uploadDrafts(member.class_id, files)
    } catch (err) {
      setBusy(false)
      return setError(err.message)
    }
    const fresh = attachments.filter((a) => !(saved ?? []).some((s) => s.path === a.path)).map((a) => a.path)
    const row = {
      subject: form.subject.trim(),
      due_date: form.due_date,
      title: form.title.trim(),
      kind: form.kind,
      weight: form.weight === '' ? null : Number(form.weight),
      content: form.content,
      materials: form.materials,
      // 첨부 기능 전 DB 에서도 그냥 수정은 되게, 첨부가 있거나 원래 칸이 있을 때만 보냄
      ...(files.length || saved ? { attachments } : {})
    }
    const { data, error } = id
      ? await supabase.from('assessments').update(row).eq('id', id).select('id').single()
      : await supabase.from('assessments').insert({ ...row, class_id: member.class_id }).select('id').single()
    setBusy(false)
    if (error) {
      await removeFiles(fresh)
      return setError(/attachments/.test(error.message)
        ? 'DB 업데이트가 아직 안 됐어요. Supabase에서 012_assessment_files.sql 을 실행해 주세요.'
        : /kind|weight/.test(error.message)
        ? 'DB 업데이트가 아직 안 됐어요. Supabase에서 002_real_use.sql 을 실행해 주세요.'
        : error.message)
    }
    // 수정에서 뺀 첨부는 저장소에서도 지움
    await removeFiles((saved ?? []).filter((s) => !attachments.some((a) => a.path === s.path)).map((s) => s.path))
    navigate(`/assessments/${data.id}`, { replace: true })
  }

  return (
    <form className="page form" onSubmit={submit}>
      <button type="button" className="back" onClick={() => navigate(-1)}>‹ 취소</button>
      <h1>{id ? '수행평가 수정' : '수행평가 쓰기'}</h1>
      <div className="field-row">
        <label>과목
          <input value={form.subject} onChange={set('subject')} placeholder="예: 국어" list="subject-list" required />
          <datalist id="subject-list">{subjects.map((s) => <option key={s} value={s} />)}</datalist>
        </label>
        <label>날짜<input type="date" value={form.due_date} onChange={set('due_date')} required /></label>
      </div>
      <label>평가 주제<input value={form.title} onChange={set('title')} placeholder="예: 현대시 낭송 발표" required /></label>
      <div className="field-row">
        <label>평가 방식 (선택)
          <select value={form.kind} onChange={set('kind')}>
            <option value="">고르지 않음</option>
            {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label>반영 비율 % (선택)
          <input type="number" inputMode="numeric" min="0" max="100" value={form.weight} onChange={set('weight')} placeholder="예: 20" />
        </label>
      </div>
      <label>세부 내용<textarea rows={6} value={form.content} onChange={set('content')} placeholder="범위, 분량, 채점 기준처럼 알아야 할 것" /></label>
      <label>준비물 (선택)<textarea rows={2} value={form.materials} onChange={set('materials')} /></label>
      <div className="field">
        <span className="field-label">사진·파일 (선택)</span>
        <AttachPicker items={files} onChange={setFiles} onError={setError} />
      </div>
      {error && <p className="error">{error}</p>}
      <button className="btn-primary" disabled={busy}>{busy ? (files.some((f) => f.file) ? '올리는 중…' : '저장하는 중…') : id ? '수정 저장' : '올리기'}</button>
    </form>
  )
}
