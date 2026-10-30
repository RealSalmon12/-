import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useSession } from '../session.jsx'
import { formatDate } from '../util.js'
import { loadClassPeople } from '../chatMedia.js'

const dayOf = (ts) => new Date(ts).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const timeOf = (ts) => new Date(ts).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit' })
const NEED_DB = 'DB 업데이트(009_notice_dm_calls.sql)를 먼저 실행해 주세요.'

// 최근 공지 (홈에서도 씀)
export function useAnnouncements(classId, limit = 50) {
  const [items, setItems] = useState(null)
  const [error, setError] = useState('')
  const load = () => supabase.from('announcements').select('id, title, body, created_at')
    .eq('class_id', classId).order('id', { ascending: false }).limit(limit)
    .then(({ data, error }) => { setError(error ? NEED_DB : ''); setItems(data ?? []) })
  useEffect(() => { load() }, [classId, limit]) // eslint-disable-line react-hooks/exhaustive-deps
  return { items, error, reload: load }
}

// 선생님 공지: 선생님이 쓰면 반 전체에 알림이 감
export default function Announcements() {
  const { user, member, isTeacher } = useSession()
  const navigate = useNavigate()
  const { items, error: loadError, reload } = useAnnouncements(member.class_id)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [reads, setReads] = useState({}) // 공지 id -> 읽은 사람 id 목록 (선생님만)
  const [people, setPeople] = useState({})
  const [open, setOpen] = useState(null)

  // 이 화면을 열면 보이는 공지를 모두 읽음으로 남기고, 선생님은 누가 읽었는지 불러옴
  useEffect(() => {
    if (!items?.length) return
    const ids = items.map((a) => a.id)
    supabase.from('announcement_reads')
      .upsert(ids.map((id) => ({ announcement_id: id, user_id: user.id })), { ignoreDuplicates: true })
      .then(() => {
        if (!isTeacher) return
        supabase.from('announcement_reads').select('announcement_id, user_id').in('announcement_id', ids)
          .then(({ data }) => {
            const map = {}
            for (const r of data ?? []) (map[r.announcement_id] ??= []).push(r.user_id)
            setReads(map)
          })
      })
  }, [items, isTeacher, user.id])
  useEffect(() => { if (isTeacher) loadClassPeople(member.class_id).then(setPeople) }, [isTeacher, member.class_id])
  const students = Object.values(people).filter((p) => p.role !== 'teacher')

  async function post(e) {
    e.preventDefault()
    if (!confirm('반 전체에 이 공지를 보내고 알림을 울릴까요?')) return
    setBusy(true)
    setError('')
    setNotice('')
    const { data, error } = await supabase.from('announcements')
      .insert({ class_id: member.class_id, title: title.trim(), body: body.trim() }).select('id').single()
    if (error) {
      setBusy(false)
      return setError(error.message.includes('announcements') ? NEED_DB : '공지를 올리지 못했어요. 잠시 뒤 다시 해 주세요.')
    }
    const res = await supabase.functions.invoke('notify', { body: { kind: 'announcement', id: data.id } })
    setBusy(false)
    setTitle('')
    setBody('')
    setNotice(res.error ? '공지를 올렸어요. 알림은 보내지 못했어요 (notify 함수를 배포했는지 확인해 주세요).'
      : `공지를 올리고 ${res.data.sent}대의 기기에 알림을 보냈어요.`)
    reload()
  }

  async function remove(a) {
    if (!confirm(`"${a.title}" 공지를 지울까요?`)) return
    await supabase.from('announcements').delete().eq('id', a.id)
    reload()
  }

  return (
    <div className="page">
      <button className="back" onClick={() => navigate(-1)}>‹ 뒤로</button>
      <h1>선생님 공지</h1>

      {isTeacher && (
        <form className="section call-box" onSubmit={post}>
          <p className="fine">반 학생 모두에게 공지가 올라가고, 알림을 켠 학생 휴대폰으로 바로 알림이 가요.</p>
          <label>제목
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} required placeholder="예: 내일 체육복 챙겨 오세요" />
          </label>
          <label>내용 (선택)
            <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={4} />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          {notice && <p className="call-sent" role="status">{notice}</p>}
          <button className="btn-primary" disabled={busy || !title.trim()}>{busy ? '보내는 중…' : '공지 보내기'}</button>
        </form>
      )}

      <section className="section">
        {loadError && <p className="error" role="alert">{loadError}</p>}
        {items && (items.length ? (
          <ul className="announce-list">
            {items.map((a) => (
              <li key={a.id} className="announce">
                <div className="section-head">
                  <b>{a.title}</b>
                  <span className="fine">{formatDate(dayOf(a.created_at))} {timeOf(a.created_at)}</span>
                </div>
                {a.body && <p className="prose">{a.body}</p>}
                {isTeacher && (
                  <div className="section-head">
                    {students.length > 0 && (() => {
                      const readBy = new Set(reads[a.id] ?? [])
                      const unread = students.filter((p) => !readBy.has(p.user_id))
                      return (
                        <button className="btn-text" onClick={() => setOpen(open === a.id ? null : a.id)} aria-expanded={open === a.id}>
                          읽음 {students.length - unread.length}/{students.length}
                        </button>
                      )
                    })()}
                    <button className="btn-text danger" onClick={() => remove(a)}>지우기</button>
                  </div>
                )}
                {isTeacher && open === a.id && (
                  <p className="fine read-list">
                    안 읽은 학생: {students.filter((p) => !(reads[a.id] ?? []).includes(p.user_id)).map((p) => p.display_name).join(', ') || '없어요. 모두 읽었어요.'}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : <p className="empty">아직 공지가 없어요.</p>)}
      </section>
    </div>
  )
}
