import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useSession } from '../session.jsx'
import { formatDate } from '../util.js'

// 비공개 버킷이라 1시간짜리 서명 링크로 사진을 보여줌
export async function signedUrls(paths) {
  if (!paths.length) return []
  const { data } = await supabase.storage.from('notices').createSignedUrls(paths, 3600)
  return (data ?? []).map((d) => d.signedUrl)
}

export default function Notices() {
  const { member, canPost } = useSession()
  const [items, setItems] = useState([])
  const [thumbs, setThumbs] = useState({})

  useEffect(() => {
    supabase.from('notices').select('*').eq('class_id', member.class_id)
      .order('created_at', { ascending: false })
      .then(async ({ data }) => {
        setItems(data ?? [])
        const firsts = (data ?? []).filter((n) => n.photo_paths.length)
        const urls = await signedUrls(firsts.map((n) => n.photo_paths[0]))
        setThumbs(Object.fromEntries(firsts.map((n, i) => [n.id, urls[i]])))
      })
  }, [member.class_id])

  return (
    <div className="page stack">
      <h1>가정통신문</h1>
      {!items.length && <p className="muted">아직 올라온 통신문이 없어요</p>}
      <ul className="list cards">
        {items.map((n) => (
          <li key={n.id} className="card">
            <Link to={`/notices/${n.id}`} className="row gap">
              {thumbs[n.id] ? <img className="thumb" src={thumbs[n.id]} alt="" /> : <div className="thumb" />}
              <span className="stack-sm">
                <b>{n.title}</b>
                <span className="muted small">
                  {formatDate(n.created_at.slice(0, 10))} · 사진 {n.photo_paths.length}장
                  {n.due_date && ` · 제출 ${formatDate(n.due_date)}`}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {canPost && <Link className="fab" to="/notices/new" aria-label="통신문 올리기">＋</Link>}
    </div>
  )
}
