import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useSession } from '../session.jsx'
import { formatDate } from '../util.js'
import { useChatUrls, loadClassPeople } from '../chatMedia.js'
import Avatar from '../components/Avatar.jsx'
import ChatTabs from '../components/ChatTabs.jsx'

const PAGE = 100
const COLS = 'id, student_id, sender_id, body, created_at'
const dayOf = (ts) => new Date(ts).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const timeOf = (ts) => new Date(ts).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit' })
const NEED_DB = 'DB 업데이트(009_notice_dm_calls.sql)를 먼저 실행해 주세요.'

// /dm: 학생은 선생님과의 대화방, 선생님은 학생 목록. /dm/:studentId: 선생님이 보는 그 학생 대화방
export default function Dm() {
  const { user, isTeacher } = useSession()
  const { studentId } = useParams()
  if (!isTeacher) return <DmThread studentId={user.id} />
  if (studentId) return <DmThread studentId={studentId} />
  return <DmList />
}

function DmList() {
  const { member } = useSession()
  const [people, setPeople] = useState({})
  const [latest, setLatest] = useState(null)
  const [error, setError] = useState('')
  const url = useChatUrls(Object.values(people).map((p) => p.avatar_path))

  useEffect(() => {
    loadClassPeople(member.class_id).then(setPeople)
    supabase.from('direct_messages').select(COLS).eq('class_id', member.class_id)
      .order('id', { ascending: false }).limit(500)
      .then(({ data, error }) => {
        if (error) setError(NEED_DB)
        const map = {}
        for (const m of data ?? []) map[m.student_id] ??= m
        setLatest(map)
      })
  }, [member.class_id])

  // 최근에 대화한 학생 먼저, 나머지는 이름순
  const students = Object.values(people).filter((p) => p.role !== 'teacher').sort((a, b) => {
    const la = latest?.[a.user_id]?.id ?? 0
    const lb = latest?.[b.user_id]?.id ?? 0
    return lb - la || a.display_name.localeCompare(b.display_name, 'ko')
  })

  return (
    <div className="page">
      <ChatTabs />
      <h1>학생과 1:1</h1>
      <p className="fine">학생 한 명과 따로 이야기해요. 다른 학생은 볼 수 없어요.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {latest && (students.length ? (
        <ul className="plain-list">
          {students.map((s) => {
            const last = latest[s.user_id]
            return (
              <li key={s.user_id}>
                <Link to={`/dm/${s.user_id}`} className="dm-row">
                  <Avatar url={url(s.avatar_path)} name={s.display_name} size={40} />
                  <span className="dm-row-text">
                    <b>{s.display_name}</b>
                    <span className="fine">{last ? last.body : '아직 대화 없음'}</span>
                  </span>
                  {last && <span className="fine dm-row-time">{dayOf(last.created_at) === dayOf(new Date()) ? timeOf(last.created_at) : formatDate(dayOf(last.created_at))}</span>}
                </Link>
              </li>
            )
          })}
        </ul>
      ) : <p className="empty">아직 반에 학생이 없어요.</p>)}
    </div>
  )
}

function DmThread({ studentId }) {
  const { user, member, isTeacher } = useSession()
  const navigate = useNavigate()
  const [messages, setMessages] = useState(null)
  const [hasOlder, setHasOlder] = useState(false)
  const [people, setPeople] = useState({})
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [picked, setPicked] = useState(null)
  const [error, setError] = useState('')
  const listRef = useRef(null)
  const stickRef = useRef(true)
  const keepRef = useRef(null)
  const url = useChatUrls(Object.values(people).map((p) => p.avatar_path))

  const merge = useCallback((rows) => setMessages((old) => {
    const map = new Map((old ?? []).map((m) => [m.id, m]))
    for (const r of rows) map.set(r.id, r)
    return [...map.values()].sort((a, b) => a.id - b.id)
  }), [])

  useEffect(() => {
    loadClassPeople(member.class_id).then(setPeople)
    supabase.from('direct_messages').select(COLS)
      .eq('class_id', member.class_id).eq('student_id', studentId).order('id', { ascending: false }).limit(PAGE)
      .then(({ data, error }) => {
        if (error) { setMessages([]); setError(NEED_DB); return }
        setHasOlder(data.length === PAGE)
        setMessages(data.reverse())
      })
    const channel = supabase.channel(`dm:${studentId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages', filter: `student_id=eq.${studentId}` },
        ({ new: row }) => merge([row]))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'direct_messages' },
        ({ old }) => setMessages((list) => list?.filter((m) => m.id !== old.id)))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [member.class_id, studentId, merge])

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
    const { data } = await supabase.from('direct_messages').select(COLS)
      .eq('class_id', member.class_id).eq('student_id', studentId).lt('id', messages[0].id)
      .order('id', { ascending: false }).limit(PAGE)
    setHasOlder((data ?? []).length === PAGE)
    merge(data ?? [])
  }

  async function send(e) {
    e?.preventDefault()
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    setError('')
    const { data, error } = await supabase.from('direct_messages')
      .insert({ class_id: member.class_id, student_id: studentId, body }).select(COLS).single()
    setSending(false)
    if (error) {
      setError(error.message.includes('CHAT_TOO_FAST') ? '너무 빨리 보내고 있어요. 잠깐 뒤에 보내 주세요.'
        : error.message.includes('direct_messages') ? NEED_DB : '보내지 못했어요. 잠시 뒤 다시 해 주세요.')
      return
    }
    setText('')
    stickRef.current = true
    merge([data])
    // 상대에게 알림 (실패해도 메시지는 이미 저장됨)
    supabase.functions.invoke('notify', { body: { kind: 'dm', id: data.id } })
  }

  async function remove(m) {
    if (!confirm('이 메시지를 지울까요?')) return
    const { error } = await supabase.from('direct_messages').delete().eq('id', m.id)
    if (error) return setError('지우지 못했어요.')
    setPicked(null)
    setMessages((list) => list.filter((x) => x.id !== m.id))
  }

  const student = people[studentId]
  const rows = []
  ;(messages ?? []).forEach((m, i) => {
    const prev = messages[i - 1]
    const day = dayOf(m.created_at)
    if (!prev || dayOf(prev.created_at) !== day) rows.push({ day })
    const next = messages[i + 1]
    rows.push({
      m,
      mine: m.sender_id === user.id,
      first: !prev || prev.sender_id !== m.sender_id || dayOf(prev.created_at) !== day,
      last: !next || next.sender_id !== m.sender_id || new Date(next.created_at) - new Date(m.created_at) > 60_000
    })
  })

  return (
    <div className="chat">
      <header className="chat-head">
        <ChatTabs />
        {isTeacher ? (
          <div className="dm-head">
            <button className="back" onClick={() => navigate('/dm')}>‹ 학생 목록</button>
            <h1>{student?.display_name ?? '학생'}</h1>
          </div>
        ) : <h1>선생님과 1:1</h1>}
        <p className="fine">
          {isTeacher ? '이 학생과 이 반 선생님만 볼 수 있어요.' : '나와 우리 반 선생님만 볼 수 있어요. 고민이나 질문을 편하게 보내세요.'}
        </p>
      </header>

      <div className="chat-list" ref={listRef} onScroll={(e) => {
        const el = e.currentTarget
        stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      }}>
        {hasOlder && <button className="btn-text chat-older" onClick={loadOlder}>이전 메시지 더 보기</button>}
        {messages?.length === 0 && !error && (
          <p className="empty chat-empty">{isTeacher ? '아직 주고받은 메시지가 없어요.' : '선생님께 첫 메시지를 보내 보세요.'}</p>
        )}
        {rows.map((r) => r.day ? (
          <p key={r.day} className="chat-day"><span>{formatDate(r.day)}</span></p>
        ) : (
          <div key={r.m.id} className={`chat-msg${r.mine ? ' mine' : ''}${r.first ? ' first' : ''}`}>
            {!r.mine && (
              <span className="chat-avatar-slot">
                {r.first && <Avatar url={url(people[r.m.sender_id]?.avatar_path)} name={people[r.m.sender_id]?.display_name} size={34} />}
              </span>
            )}
            <div className="chat-col">
              {r.first && !r.mine && (
                <p className="chat-name">
                  {people[r.m.sender_id]?.display_name ?? '알 수 없음'}
                  {people[r.m.sender_id]?.role === 'teacher' && <span className="chat-role">선생님</span>}
                </p>
              )}
              <div className="chat-line">
                <button className="chat-bubble" onClick={() => setPicked(picked === r.m.id ? null : r.m.id)}
                  aria-expanded={picked === r.m.id}>
                  {r.m.body}
                </button>
                {r.last && <time className="chat-time">{timeOf(r.m.created_at)}</time>}
              </div>
              {picked === r.m.id && r.mine && (
                <button className="btn-text danger chat-delete" onClick={() => remove(r.m)}>지우기</button>
              )}
            </div>
          </div>
        ))}
      </div>

      <form className="chat-compose" onSubmit={send}>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="chat-compose-row">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={1000}
            placeholder={isTeacher ? `${student?.display_name ?? '학생'}에게 보내기` : '선생님께 보내기'} aria-label="메시지"
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
