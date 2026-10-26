import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useSession } from '../session.jsx'
import { formatDate } from '../util.js'
import { signedUrls } from './Notices.jsx'

export default function NoticeDetail() {
  const { id } = useParams()
  const { canPost } = useSession()
  const navigate = useNavigate()
  const [n, setN] = useState(null)
  const [urls, setUrls] = useState([])
  const [zoom, setZoom] = useState(null)

  useEffect(() => {
    supabase.from('notices').select('*').eq('id', id).single().then(async ({ data }) => {
      setN(data)
      if (data) setUrls(await signedUrls(data.photo_paths))
    })
  }, [id])

  async function remove() {
    if (!confirm('이 통신문을 지울까요?')) return
    if (n.photo_paths.length) await supabase.storage.from('notices').remove(n.photo_paths)
    await supabase.from('notices').delete().eq('id', id)
    navigate('/notices', { replace: true })
  }

  if (!n) return <div className="page" />
  return (
    <div className="page">
      <button className="back" onClick={() => navigate(-1)}>‹ 뒤로</button>
      <header className="detail-head">
        <h1>{n.title}</h1>
        <p className="fine">{formatDate(n.created_at.slice(0, 10))}에 올림</p>
        {n.due_date && <p className="deadline">{formatDate(n.due_date)}까지 제출</p>}
      </header>
      {n.memo && <p className="prose">{n.memo}</p>}
      <div className="photos">
        {urls.map((u, i) => (
          <img key={u} src={u} alt={`통신문 ${i + 1}쪽`} onClick={() => setZoom(u)} />
        ))}
      </div>
      {canPost && <button className="btn-danger" onClick={remove}>삭제</button>}
      {zoom && (
        <div className="viewer" onClick={() => setZoom(null)}>
          <img src={zoom} alt="" />
          <a className="btn-chalk" href={zoom} download onClick={(e) => e.stopPropagation()}>저장</a>
        </div>
      )}
    </div>
  )
}
