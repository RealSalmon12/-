import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { useSession } from '../session.jsx'
import { loadClassPeople } from '../chatMedia.js'

const NEED_DB = 'DB 업데이트(011_submissions_dday.sql)를 먼저 실행해 주세요.'

// 가정통신문 제출 체크. 관리자는 학생마다 체크하고 안 낸 학생에게 알림, 학생은 내 상태만 봄
export default function Submissions({ noticeId }) {
  const { user, member, canPost } = useSession()
  const [done, setDone] = useState(null) // 낸 학생 id 집합
  const [people, setPeople] = useState({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const load = () => supabase.from('notice_submissions').select('user_id').eq('notice_id', noticeId)
    .then(({ data, error }) => { setDone(error ? null : new Set(data.map((d) => d.user_id))); if (error) setMsg(NEED_DB) })

  useEffect(() => {
    load()
    if (canPost) loadClassPeople(member.class_id).then(setPeople)
  }, [noticeId, canPost, member.class_id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!canPost) {
    if (!done) return null
    return done.has(user.id)
      ? <p className="submit-state ok">✓ 제출 확인됐어요</p>
      : <p className="submit-state">아직 제출 확인 전이에요. 내고 나서 선생님이 체크하면 바뀌어요.</p>
  }

  const students = Object.values(people).filter((p) => p.role !== 'teacher')
    .sort((a, b) => a.display_name.localeCompare(b.display_name, 'ko'))
  const count = students.filter((s) => done?.has(s.user_id)).length

  async function toggle(s) {
    if (!done) return
    if (done.has(s.user_id)) {
      await supabase.from('notice_submissions').delete().eq('notice_id', noticeId).eq('user_id', s.user_id)
    } else {
      await supabase.from('notice_submissions').insert({ notice_id: noticeId, user_id: s.user_id })
    }
    load()
  }

  async function remind() {
    const left = students.length - count
    if (!confirm(`아직 안 낸 학생 ${left}명에게 알림을 보낼까요?`)) return
    setBusy(true)
    setMsg('')
    const { data, error } = await supabase.functions.invoke('notify', { body: { kind: 'notice_remind', id: noticeId } })
    setBusy(false)
    setMsg(error?.context?.status === 429 ? '알림은 한 시간에 한 번만 보낼 수 있어요.'
      : error ? '알림을 보내지 못했어요. notify 함수를 다시 배포했는지 확인해 주세요.'
      : `${data.students}명에게 알렸어요 (기기 ${data.sent}대).`)
  }

  return (
    <section className="section">
      <div className="section-head">
        <h2>제출 확인</h2>
        {done && <span className="fine">{count}/{students.length}명 냄</span>}
      </div>
      {msg && <p className={msg === NEED_DB ? 'error' : 'call-sent'} role="status">{msg}</p>}
      {done && (
        <>
          <ul className="submit-list">
            {students.map((s) => (
              <li key={s.user_id}>
                <label className={done.has(s.user_id) ? 'on' : ''}>
                  <input type="checkbox" checked={done.has(s.user_id)} onChange={() => toggle(s)} />
                  {s.display_name}
                </label>
              </li>
            ))}
          </ul>
          {count < students.length && (
            <button className="btn-quiet self-start" onClick={remind} disabled={busy}>
              {busy ? '보내는 중…' : `안 낸 학생 ${students.length - count}명에게 알림`}
            </button>
          )}
        </>
      )}
    </section>
  )
}
