import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { useSession, ROLE_NAMES } from '../session.jsx'
import { useChatUrls, loadClassPeople } from '../chatMedia.js'
import Avatar from './Avatar.jsx'

const whenOf = (ts) => {
  const d = new Date(ts)
  const day = d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const time = d.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit' })
  return day === today ? time : `${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일 ${time}`
}

// 수행평가 댓글: 같은 반 누구나 쓰고, 본인 댓글은 본인이, 아무 댓글이나 선생님·반장·부반장이 지움
export default function Comments({ assessmentId }) {
  const { user, member, canPost } = useSession()
  const [list, setList] = useState(null)
  const [people, setPeople] = useState({})
  const [blocked, setBlocked] = useState(new Set())
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const url = useChatUrls(Object.values(people).map((p) => p.avatar_path))

  const merge = useCallback((rows) => setList((old) => {
    const map = new Map((old ?? []).map((c) => [c.id, c]))
    for (const r of rows) map.set(r.id, r)
    return [...map.values()].sort((a, b) => a.id - b.id)
  }), [])

  useEffect(() => {
    loadClassPeople(member.class_id).then(setPeople)
    supabase.from('user_blocks').select('blocked_id')
      .then(({ data }) => setBlocked(new Set((data ?? []).map((b) => b.blocked_id))))
    supabase.from('assessment_comments').select('id, user_id, body, created_at')
      .eq('assessment_id', assessmentId).order('id')
      .then(({ data, error }) => {
        if (error) {
          setList([])
          setError(error.message.includes('assessment_comments')
            ? 'DB 업데이트(017_assessment_comments.sql)를 먼저 실행해 주세요.' : '댓글을 불러오지 못했어요.')
          return
        }
        setList(data)
      })

    const channel = supabase.channel(`acomments:${assessmentId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'assessment_comments', filter: `assessment_id=eq.${assessmentId}` },
        ({ new: row }) => merge([row]))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'assessment_comments' },
        ({ old }) => setList((l) => l?.filter((c) => c.id !== old.id)))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [assessmentId, member.class_id, merge])

  // 새로 들어온 친구 이름을 모르면 멤버 목록을 다시 읽음
  const unknown = list?.some((c) => !people[c.user_id])
  useEffect(() => {
    if (unknown && Object.keys(people).length) loadClassPeople(member.class_id).then(setPeople)
  }, [unknown]) // eslint-disable-line react-hooks/exhaustive-deps

  async function send(e) {
    e.preventDefault()
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    setError('')
    const { data, error } = await supabase.from('assessment_comments')
      .insert({ assessment_id: assessmentId, class_id: member.class_id, body })
      .select('id, user_id, body, created_at').single()
    setSending(false)
    if (error) {
      setError(error.message.includes('COMMENT_TOO_FAST') ? '너무 빨리 쓰고 있어요. 잠깐 뒤에 다시 써 주세요.'
        : error.message.includes('assessment_comments') ? 'DB 업데이트(017_assessment_comments.sql)를 먼저 실행해 주세요.'
        : '댓글을 올리지 못했어요. 잠시 뒤 다시 해 주세요.')
      return
    }
    setText('')
    merge([data])
  }

  async function remove(c) {
    if (!confirm('이 댓글을 지울까요?')) return
    const { error } = await supabase.from('assessment_comments').delete().eq('id', c.id)
    if (error) return alert('지우지 못했어요. 잠시 뒤 다시 해 주세요.')
    setList((l) => l.filter((x) => x.id !== c.id))
  }

  return (
    <section className="section comments">
      <h2>댓글{list?.length ? <span className="comments-count">{list.length}</span> : null}</h2>
      {list === null ? null : list.length === 0 ? (
        <p className="fine">아직 댓글이 없어요. 궁금한 점이나 정보를 나눠 보세요.</p>
      ) : (
        <ul className="comment-list">
          {list.map((c) => {
            const p = people[c.user_id]
            const mine = c.user_id === user.id
            return (
              <li key={c.id} className="comment">
                <Avatar url={url(p?.avatar_path)} name={p?.display_name} size={30} />
                <div className="comment-col">
                  <p className="comment-meta">
                    <b>{p?.display_name ?? '반 친구'}</b>
                    {p && p.role !== 'student' && <span className="chat-role">{ROLE_NAMES[p.role]}</span>}
                    <time>{whenOf(c.created_at)}</time>
                    {(mine || canPost) && (
                      <button className="btn-text quiet comment-delete" onClick={() => remove(c)}>삭제</button>
                    )}
                  </p>
                  {blocked.has(c.user_id) && !mine
                    ? <p className="fine">차단한 사람의 댓글이에요.</p>
                    : <p className="comment-body">{c.body}</p>}
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <form className="comment-form" onSubmit={send}>
        <textarea value={text} rows={1} maxLength={500} placeholder="댓글 달기"
          aria-label="댓글 내용" onChange={(e) => setText(e.target.value)} />
        <button className="chat-send" disabled={!text.trim() || sending}>올리기</button>
      </form>
      {error && <p className="error fine">{error}</p>}
    </section>
  )
}
