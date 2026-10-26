import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useSession } from '../session.jsx'
import { compressImage } from '../util.js'

export default function NoticeForm() {
  const { member, canPost } = useSession()
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [memo, setMemo] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [files, setFiles] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!canPost) return <div className="page empty">선생님, 반장, 부반장만 올릴 수 있어요.</div>

  const addFiles = (e) => setFiles([...files, ...e.target.files])

  async function submit(e) {
    e.preventDefault()
    if (!files.length) return setError('사진을 한 장 이상 골라 주세요')
    setBusy(true)
    setError('')
    const paths = []
    for (const file of files) {
      const blob = await compressImage(file)
      const path = `${member.class_id}/${crypto.randomUUID()}.jpg`
      const { error } = await supabase.storage.from('notices').upload(path, blob, { contentType: 'image/jpeg' })
      if (error) {
        setBusy(false)
        return setError(error.message)
      }
      paths.push(path)
    }
    const { data, error } = await supabase.from('notices').insert({
      class_id: member.class_id, title, memo, due_date: dueDate || null, photo_paths: paths
    }).select('id').single()
    setBusy(false)
    if (error) return setError(error.message)
    navigate(`/notices/${data.id}`, { replace: true })
  }

  return (
    <form className="page form" onSubmit={submit}>
      <button type="button" className="back" onClick={() => navigate(-1)}>‹ 취소</button>
      <h1>통신문 올리기</h1>
      <label>제목<input value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
      <label className="picker">
        사진 찍기 또는 고르기
        <span className="fine">여러 장을 한 번에 골라도 돼요</span>
        <input className="sr-only" type="file" accept="image/*" multiple onChange={addFiles} />
      </label>
      {files.length > 0 && (
        <div className="previews">
          {files.map((f, i) => (
            <div key={i} className="preview">
              <img src={URL.createObjectURL(f)} alt="" />
              <button type="button" aria-label={`${i + 1}번째 사진 빼기`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
        </div>
      )}
      <label>메모 (선택)<textarea rows={3} value={memo} onChange={(e) => setMemo(e.target.value)} /></label>
      <label>제출 마감일 (선택)<input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label>
      {error && <p className="error">{error}</p>}
      <button className="btn-primary" disabled={busy}>{busy ? '올리는 중…' : '올리기'}</button>
    </form>
  )
}
