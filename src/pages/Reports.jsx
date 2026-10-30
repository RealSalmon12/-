import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useSession } from '../session.jsx'
import { formatDate } from '../util.js'
import { loadClassPeople } from '../chatMedia.js'

const dayOf = (ts) => new Date(ts).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const timeOf = (ts) => new Date(ts).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit' })

// 처리 안 한 신고 수 (홈·반 관리에서 씀)
export function useOpenReports(classId, enabled) {
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!enabled) return
    supabase.from('chat_reports').select('id', { count: 'exact', head: true })
      .eq('class_id', classId).is('resolved_at', null)
      .then(({ count }) => setN(count ?? 0))
  }, [classId, enabled])
  return n
}

// 선생님 신고함: 반 채팅에서 들어온 신고를 보고 메시지를 지우거나 처리 완료
export default function Reports() {
  const { member, isTeacher } = useSession()
  const navigate = useNavigate()
  const [reports, setReports] = useState(null)
  const [people, setPeople] = useState({})
  const [showDone, setShowDone] = useState(false)
  const [error, setError] = useState('')

  const load = () => supabase.from('chat_reports').select('*')
    .eq('class_id', member.class_id).order('id', { ascending: false }).limit(100)
    .then(({ data, error }) => {
      setError(error ? 'DB 업데이트(010_report_unread_poll_rating.sql)를 먼저 실행해 주세요.' : '')
      setReports(data ?? [])
    })

  useEffect(() => {
    load()
    loadClassPeople(member.class_id).then(setPeople)
  }, [member.class_id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!isTeacher) return <div className="page empty">선생님만 볼 수 있어요.</div>

  async function resolve(r) {
    await supabase.from('chat_reports').update({ resolved_at: new Date().toISOString() }).eq('id', r.id)
    load()
  }

  async function removeMessage(r) {
    if (!confirm('신고된 메시지를 반 채팅에서 지울까요?')) return
    if (r.image_snapshot) await supabase.storage.from('chat').remove([r.image_snapshot])
    await supabase.from('chat_messages').delete().eq('id', r.message_id)
    await resolve(r)
  }

  const name = (id) => people[id]?.display_name ?? '알 수 없음'
  const shown = (reports ?? []).filter((r) => showDone || !r.resolved_at)

  return (
    <div className="page">
      <button className="back" onClick={() => navigate(-1)}>‹ 뒤로</button>
      <div className="page-head">
        <h1>채팅 신고함</h1>
        <button className="btn-text quiet" onClick={() => setShowDone(!showDone)}>{showDone ? '처리 안 한 것만' : '처리한 것도 보기'}</button>
      </div>
      <p className="fine">학생이 반 채팅 메시지를 신고하면 여기에 모이고 알림이 와요. 신고한 학생 이름은 선생님만 볼 수 있어요.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {reports && (shown.length ? (
        <ul className="announce-list">
          {shown.map((r) => (
            <li key={r.id} className={`announce report${r.resolved_at ? ' done' : ''}`}>
              <div className="section-head">
                <b>{name(r.reported_user)}의 메시지</b>
                <span className="fine">{formatDate(dayOf(r.created_at))} {timeOf(r.created_at)}</span>
              </div>
              <blockquote className="report-quote">{r.body_snapshot || (r.image_snapshot ? '(사진)' : '(내용 없음)')}</blockquote>
              <p className="fine">신고한 사람: {name(r.reporter_id)}{r.reason && ` · 이유: ${r.reason}`}</p>
              {r.resolved_at ? <p className="fine">처리 완료</p> : (
                <div className="actions">
                  {r.message_id && <button className="btn-danger" onClick={() => removeMessage(r)}>메시지 지우기</button>}
                  <button className="btn-quiet" onClick={() => resolve(r)}>{r.message_id ? '그냥 두고 처리 완료' : '처리 완료 (이미 지워짐)'}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : <p className="empty">{showDone ? '들어온 신고가 없어요.' : '처리할 신고가 없어요.'}</p>)}
    </div>
  )
}
