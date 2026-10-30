import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase } from '../supabase.js'
import { useSession, ROLE_NAMES } from '../session.jsx'
import { formatDate } from '../util.js'

const PAGE = 100
const dayOf = (ts) => new Date(ts).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const timeOf = (ts) => new Date(ts).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit' })
const byId = (a, b) => a.id - b.id

// 반 채팅: 같은 반 멤버끼리. 새 메시지와 지운 메시지는 실시간으로 반영
export default function Chat() {
  const { user, member, canPost } = useSession()
  const [messages, setMessages] = useState(null)
  const [hasOlder, setHasOlder] = useState(false)
  const [people, setPeople] = useState({})
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [picked, setPicked] = useState(null)
  const [error, setError] = useState('')
  const listRef = useRef(null)
  const stickRef = useRef(true) // 맨 아래를 보고 있으면 새 메시지가 와도 따라 내려감
  const keepRef = useRef(null)  // 이전 메시지를 불러올 때 보던 위치 유지

  const merge = useCallback((rows) => setMessages((old) => {
    const map = new Map((old ?? []).map((m) => [m.id, m]))
    for (const r of rows) map.set(r.id, r)
    return [...map.values()].sort(byId)
  }), [])

  const loadPeople = useCallback(() => {
    supabase.from('members').select('user_id, display_name, role').eq('class_id', member.class_id)
      .then(({ data }) => data && setPeople(Object.fromEntries(data.map((m) => [m.user_id, m]))))
  }, [member.class_id])

  useEffect(() => {
    loadPeople()
    supabase.from('chat_messages').select('id, user_id, body, created_at')
      .eq('class_id', member.class_id).order('id', { ascending: false }).limit(PAGE)
      .then(({ data, error }) => {
        if (error) {
          setMessages([])
          setError(error.message.includes('chat_messages') ? 'DB 업데이트(007_class_chat.sql)를 먼저 실행해 주세요.' : '채팅을 불러오지 못했어요.')
          return
        }
        setHasOlder(data.length === PAGE)
        setMessages(data.reverse())
      })

    const channel = supabase.channel(`chat:${member.class_id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `class_id=eq.${member.class_id}` },
        ({ new: row }) => merge([row]))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'chat_messages' },
        ({ old }) => setMessages((list) => list?.filter((m) => m.id !== old.id)))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [member.class_id, merge, loadPeople])

  // 새로 들어온 친구의 이름을 모르면 멤버 목록을 다시 읽음
  const unknown = messages?.some((m) => !people[m.user_id])
  useEffect(() => { if (unknown && Object.keys(people).length) loadPeople() }, [unknown]) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    if (keepRef.current !== null) {
      el.scrollTop = el.scrollHeight - keepRef.current
      keepRef.current = null
    } else if (stickRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  async function loadOlder() {
    const el = listRef.current
    keepRef.current = el.scrollHeight - el.scrollTop
    const { data } = await supabase.from('chat_messages').select('id, user_id, body, created_at')
      .eq('class_id', member.class_id).lt('id', messages[0].id).order('id', { ascending: false }).limit(PAGE)
    setHasOlder((data ?? []).length === PAGE)
    merge(data ?? [])
  }

  async function send(e) {
    e?.preventDefault()
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    setError('')
    const { data, error } = await supabase.from('chat_messages')
      .insert({ class_id: member.class_id, body }).select('id, user_id, body, created_at').single()
    setSending(false)
    if (error) {
      setError(error.message.includes('CHAT_TOO_FAST') ? '너무 빨리 보내고 있어요. 잠깐 뒤에 보내 주세요.'
        : error.message.includes('chat_messages') ? 'DB 업데이트(007_class_chat.sql)를 먼저 실행해 주세요.'
        : '보내지 못했어요. 잠시 뒤 다시 해 주세요.')
      return
    }
    setText('')
    stickRef.current = true
    merge([data])
  }

  async function remove(m) {
    if (!confirm('이 메시지를 지울까요? 모두의 화면에서 사라져요.')) return
    const { error } = await supabase.from('chat_messages').delete().eq('id', m.id)
    if (error) return setError('지우지 못했어요.')
    setPicked(null)
    setMessages((list) => list.filter((x) => x.id !== m.id))
  }

  const rows = []
  ;(messages ?? []).forEach((m, i) => {
    const prev = messages[i - 1]
    const day = dayOf(m.created_at)
    if (!prev || dayOf(prev.created_at) !== day) rows.push({ day })
    const next = messages[i + 1]
    rows.push({
      m,
      mine: m.user_id === user.id,
      // 같은 사람이 1분 안에 이어 보낸 메시지는 이름·시간을 한 번만
      first: !prev || prev.user_id !== m.user_id || dayOf(prev.created_at) !== day,
      last: !next || next.user_id !== m.user_id || new Date(next.created_at) - new Date(m.created_at) > 60_000
    })
  })

  return (
    <div className="chat">
      <header className="chat-head">
        <h1>{member.classes.name} 채팅</h1>
        <p className="fine">같은 반 멤버만 볼 수 있어요. 선생님도 함께 봐요.</p>
      </header>

      <div className="chat-list" ref={listRef} onScroll={(e) => {
        const el = e.currentTarget
        stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      }}>
        {hasOlder && <button className="btn-text chat-older" onClick={loadOlder}>이전 메시지 더 보기</button>}
        {messages?.length === 0 && !error && <p className="empty chat-empty">아직 아무도 말하지 않았어요. 먼저 인사해 보세요.</p>}
        {rows.map((r) => r.day ? (
          <p key={r.day} className="chat-day"><span>{formatDate(r.day)}</span></p>
        ) : (
          <div key={r.m.id} className={`chat-msg${r.mine ? ' mine' : ''}${r.first ? ' first' : ''}`}>
            {r.first && !r.mine && (
              <p className="chat-name">
                {people[r.m.user_id]?.display_name ?? '알 수 없음'}
                {people[r.m.user_id] && people[r.m.user_id].role !== 'student' && (
                  <span className="chat-role">{ROLE_NAMES[people[r.m.user_id].role]}</span>
                )}
              </p>
            )}
            <div className="chat-line">
              <button className="chat-bubble" onClick={() => setPicked(picked === r.m.id ? null : r.m.id)}
                aria-expanded={picked === r.m.id}>
                {r.m.body}
              </button>
              {r.last && <time className="chat-time">{timeOf(r.m.created_at)}</time>}
            </div>
            {picked === r.m.id && (r.mine || canPost) && (
              <button className="btn-text danger chat-delete" onClick={() => remove(r.m)}>
                {r.mine ? '지우기' : '관리자 권한으로 지우기'}
              </button>
            )}
          </div>
        ))}
      </div>

      <form className="chat-compose" onSubmit={send}>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="chat-compose-row">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={500}
            placeholder="메시지 보내기" aria-label="메시지"
            onKeyDown={(e) => {
              // 한글 조합 중 Enter 는 글자 확정이므로 보내지 않음
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) send(e)
            }} />
          <button className="chat-send" disabled={!text.trim() || sending}>보내기</button>
        </div>
      </form>
    </div>
  )
}
