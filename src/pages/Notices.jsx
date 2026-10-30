import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useSession } from '../session.jsx'
import { formatDate } from '../util.js'
import { PlusIcon } from '../components/Icons.jsx'

// 비공개 버킷이라 1시간짜리 서명 링크로 사진을 보여줌
export async function signedUrls(paths) {
  if (!paths.length) return []
  const { data } = await supabase.storage.from('notices').createSignedUrls(paths, 3600)
  return (data ?? []).map((d) => d.signedUrl)
}

export default function Notices() {
  const navigate = useNavigate()
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
    <div className="page">
      <button className="back" onClick={() => navigate(-1)}>‹ 뒤로</button>
      <header className="page-head"><h1>가정통신문</h1></header>
      {!items.length && <p className="empty">아직 올라온 통신문이 없어요.{canPost && ' 받은 종이를 사진으로 올려 주세요.'}</p>}
      <ul className="notice-list">
        {items.map((n) => (
          <li key={n.id}>
            <Link to={`/notices/${n.id}`} className="notice-row">
              <span className="sheet">
                {thumbs[n.id] && <img src={thumbs[n.id]} alt="" />}
                {n.photo_paths.length > 1 && <span className="sheet-count">{n.photo_paths.length}장</span>}
              </span>
              <span className="notice-body">
                <span className="notice-title">{n.title}</span>
                <span className="fine">{formatDate(n.created_at.slice(0, 10))}에 올림</span>
                {n.due_date && <span className="deadline">{formatDate(n.due_date)}까지 제출</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {canPost && <Link className="fab" to="/notices/new"><PlusIcon />통신문 올리기</Link>}
    </div>
  )
}
