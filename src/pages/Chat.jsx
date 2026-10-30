import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useSession, ROLE_NAMES } from '../session.jsx'
import { formatDate } from '../util.js'
import { prepareImage, useChatUrls, loadClassPeople } from '../chatMedia.js'
import Avatar from '../components/Avatar.jsx'
import ChatTabs from '../components/ChatTabs.jsx'
import { PhotoIcon, PollIcon } from '../components/Icons.jsx'
import { usePolls, PollCard, PollForm } from '../components/Poll.jsx'
import { useUnread } from '../unread.jsx'
import { mentionQuery, insertMention, findMentions, splitMentions } from '../mentions.js'

const PAGE = 100
const dayOf = (ts) => new Date(ts).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
const timeOf = (ts) => new Date(ts).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: 'numeric', minute: '2-digit' })
const byId = (a, b) => a.id - b.id
// DB 업데이트(010, 008) 전이면 없는 칸을 빼고 읽음
const COL_TRIES = [
  'id, user_id, body, image_path, poll_id, mentions, created_at',
  'id, user_id, body, image_path, created_at',
  'id, user_id, body, created_at'
]
let COLS = COL_TRIES[0]
async function fetchMessages(build) {
  let res = await build(supabase.from('chat_messages').select(COLS))
  while (res.error && /column|poll_id|mentions|image_path/.test(res.error.message) && COL_TRIES.indexOf(COLS) < COL_TRIES.length - 1) {
    COLS = COL_TRIES[COL_TRIES.indexOf(COLS) + 1]
    res = await build(supabase.from('chat_messages').select(COLS))
  }
  return res
}
const NEED_010 = 'DB 업데이트(010_report_unread_poll_rating.sql)를 먼저 실행해 주세요.'

// 반 채팅: 같은 반 멤버끼리. 새 메시지와 지운 메시지는 실시간으로 반영
export default function Chat() {
  const { user, member, canPost } = useSession()
  const [messages, setMessages] = useState(null)
  const [hasOlder, setHasOlder] = useState(false)
  const [people, setPeople] = useState({})
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [picked, setPicked] = useState(null)
  const [zoom, setZoom] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [pollOpen, setPollOpen] = useState(false)
  const [blocked, setBlocked] = useState(new Set())
  const [caret, setCaret] = useState(0)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const textRef = useRef(null)
  const { markRead } = useUnread()
  const listRef = useRef(null)
  const stickRef = useRef(true) // 맨 아래를 보고 있으면 새 메시지가 와도 따라 내려감
  const keepRef = useRef(null)  // 이전 메시지를 불러올 때 보던 위치 유지

  const merge = useCallback((rows) => setMessages((old) => {
    const map = new Map((old ?? []).map((m) => [m.id, m]))
    for (const r of rows) map.set(r.id, r)
    return [...map.values()].sort(byId)
  }), [])

  const loadPeople = useCallback(() => {
    loadClassPeople(member.class_id).then(setPeople)
  }, [member.class_id])

  useEffect(() => {
    loadPeople()
    fetchMessages((q) => q.eq('class_id', member.class_id).order('id', { ascending: false }).limit(PAGE))
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

  // 내가 차단한 사람
  useEffect(() => {
    supabase.from('user_blocks').select('blocked_id')
      .then(({ data }) => setBlocked(new Set((data ?? []).map((b) => b.blocked_id))))
  }, [])

  // 보고 있는 마지막 메시지까지 읽음으로 남김
  const lastId = messages?.at(-1)?.id
  useEffect(() => { if (lastId) markRead('class', lastId) }, [lastId, markRead])

  const { polls, votes, reloadVotes } = usePolls((messages ?? []).map((m) => m.poll_id))

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
    const { data } = await fetchMessages((q) => q
      .eq('class_id', member.class_id).lt('id', messages[0].id).order('id', { ascending: false }).limit(PAGE))
    setHasOlder((data ?? []).length === PAGE)
    merge(data ?? [])
  }

  async function post(row) {
    const { data, error } = await supabase.from('chat_messages')
      .insert({ class_id: member.class_id, ...row }).select(COLS).single()
    if (error) {
      setError(error.message.includes('CHAT_TOO_FAST') ? '너무 빨리 보내고 있어요. 잠깐 뒤에 보내 주세요.'
        : /poll_id|mentions/.test(error.message) ? NEED_010
        : error.message.includes('image_path') ? 'DB 업데이트(008_chat_photos_profile.sql)를 먼저 실행해 주세요.'
        : error.message.includes('chat_messages') ? 'DB 업데이트(007_class_chat.sql)를 먼저 실행해 주세요.'
        : '보내지 못했어요. 잠시 뒤 다시 해 주세요.')
      return false
    }
    stickRef.current = true
    merge([data])
    // @멘션된 사람에게 알림 (실패해도 메시지는 이미 저장됨)
    if (data.mentions?.length) supabase.functions.invoke('notify', { body: { kind: 'mention', id: data.id } })
    return true
  }

  async function send(e) {
    e?.preventDefault()
    const body = text.trim()
    if (!body || sending) return
    setSending(true)
    setError('')
    const mentions = findMentions(body, people).filter((id) => id !== user.id)
    if (await post(mentions.length ? { body, mentions } : { body })) setText('')
    setSending(false)
  }

  async function createPoll(question, options) {
    setSending(true)
    setError('')
    const { data, error } = await supabase.from('polls')
      .insert({ class_id: member.class_id, question, options }).select('id').single()
    if (error) {
      setSending(false)
      return setError(error.message.includes('polls') ? NEED_010 : '투표를 만들지 못했어요.')
    }
    if (await post({ body: '', poll_id: data.id })) setPollOpen(false)
    setSending(false)
  }

  async function report(m) {
    const why = prompt('신고하는 이유를 적어 주세요 (선택). 선생님에게만 알려져요.', '')
    if (why === null) return
    const { data, error } = await supabase.rpc('report_message', { mid: m.id, why })
    if (error) return setError(error.message.includes('report_message') ? NEED_010 : '신고하지 못했어요. 잠시 뒤 다시 해 주세요.')
    supabase.functions.invoke('notify', { body: { kind: 'report', id: data } })
    setPicked(null)
    setZoom(null)
    setNotice('신고했어요. 선생님에게 알렸어요.')
  }

  async function block(userId) {
    const name = people[userId]?.display_name ?? '이 사람'
    if (!confirm(`${name}님을 차단할까요? 내 화면에서만 메시지가 가려지고, 상대는 알 수 없어요. 내 계정에서 풀 수 있어요.`)) return
    const { error } = await supabase.from('user_blocks').insert({ blocked_id: userId })
    if (error && !error.message.includes('duplicate')) return setError(error.message.includes('user_blocks') ? NEED_010 : '차단하지 못했어요.')
    setBlocked(new Set([...blocked, userId]))
    setPicked(null)
    setZoom(null)
    setNotice(`${name}님을 차단했어요.`)
  }

  // @ 자동 완성 후보
  const query = mentionQuery(text, caret)
  const suggestions = query === null ? [] : Object.values(people)
    .filter((p) => p.user_id !== user.id && p.display_name.includes(query))
    .slice(0, 5)
  function pickMention(p) {
    const next = insertMention(text, caret, p.display_name)
    setText(next.text)
    setCaret(next.caret)
    requestAnimationFrame(() => {
      textRef.current?.focus()
      textRef.current?.setSelectionRange(next.caret, next.caret)
    })
  }

  async function sendPhoto(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const { blob, ext, type } = await prepareImage(file)
      const path = `${member.class_id}/${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from('chat').upload(path, blob, { contentType: type })
      if (error) {
        throw new Error(error.message.includes('Bucket') || error.message.includes('bucket')
          ? 'DB 업데이트(008_chat_photos_profile.sql)를 먼저 실행해 주세요.'
          : error.message.includes('size') ? '사진이 너무 커요. 5MB 이하만 올릴 수 있어요.'
          : '사진을 올리지 못했어요. 잠시 뒤 다시 해 주세요.')
      }
      if (!(await post({ body: '', image_path: path }))) await supabase.storage.from('chat').remove([path])
    } catch (err) {
      setError(err.message)
    }
    setUploading(false)
  }

  async function remove(m) {
    if (!confirm(m.poll_id ? '이 투표를 지울까요? 모두의 화면에서 사라져요.' : '이 메시지를 지울까요? 모두의 화면에서 사라져요.')) return
    const { error } = await supabase.from('chat_messages').delete().eq('id', m.id)
    if (error) return setError('지우지 못했어요.')
    if (m.image_path) await supabase.storage.from('chat').remove([m.image_path])
    if (m.poll_id) await supabase.from('polls').delete().eq('id', m.poll_id)
    setPicked(null)
    setZoom(null)
    setMessages((list) => list.filter((x) => x.id !== m.id))
  }

  const url = useChatUrls([
    ...(messages ?? []).map((m) => m.image_path),
    ...Object.values(people).map((p) => p.avatar_path)
  ])

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
        <ChatTabs />
        <div className="section-head">
          <h1>{member.classes.name} 채팅</h1>
          <Link className="more" to="/account">내 프로필</Link>
        </div>
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
            {!r.mine && (
              <span className="chat-avatar-slot">
                {r.first && <Avatar url={url(people[r.m.user_id]?.avatar_path)} name={people[r.m.user_id]?.display_name} size={34} />}
              </span>
            )}
            <div className="chat-col">
              {r.first && !r.mine && (
                <p className="chat-name">
                  {people[r.m.user_id]?.display_name ?? '알 수 없음'}
                  {people[r.m.user_id] && people[r.m.user_id].role !== 'student' && (
                    <span className="chat-role">{ROLE_NAMES[people[r.m.user_id].role]}</span>
                  )}
                </p>
              )}
              {blocked.has(r.m.user_id) ? (
                <p className="chat-blocked fine">차단한 사람의 메시지예요.</p>
              ) : (
              <div className="chat-line">
                {r.m.poll_id ? (
                  <>
                    <PollCard poll={polls[r.m.poll_id]} votes={votes[r.m.poll_id]} mine={r.mine} people={people} onChanged={reloadVotes} />
                    <button className="btn-text quiet chat-more" onClick={() => setPicked(picked === r.m.id ? null : r.m.id)} aria-label="더 보기">⋯</button>
                  </>
                ) : r.m.image_path ? (
                  <button className="chat-photo" onClick={() => setZoom(r.m)} aria-label="사진 크게 보기">
                    {url(r.m.image_path) && <img src={url(r.m.image_path)} alt="" loading="lazy"
                      onLoad={() => { if (stickRef.current) listRef.current.scrollTop = listRef.current.scrollHeight }} />}
                  </button>
                ) : (
                  <button className="chat-bubble" onClick={() => setPicked(picked === r.m.id ? null : r.m.id)}
                    aria-expanded={picked === r.m.id}>
                    {splitMentions(r.m.body, people).map((part, i) => part.name
                      ? <b key={i} className={`mention${part.name === member.display_name ? ' me' : ''}`}>{part.text}</b>
                      : part.text)}
                  </button>
                )}
                {r.last && <time className="chat-time">{timeOf(r.m.created_at)}</time>}
              </div>
              )}
              {picked === r.m.id && (
                <div className="chat-actions">
                  {r.mine && <button className="btn-text danger" onClick={() => remove(r.m)}>지우기</button>}
                  {!r.mine && <button className="btn-text danger" onClick={() => report(r.m)}>신고</button>}
                  {!r.mine && !blocked.has(r.m.user_id) && <button className="btn-text quiet" onClick={() => block(r.m.user_id)}>차단</button>}
                  {!r.mine && canPost && <button className="btn-text danger" onClick={() => remove(r.m)}>관리자 권한으로 지우기</button>}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {pollOpen && <PollForm busy={sending} onCreate={createPoll} onCancel={() => setPollOpen(false)} />}
      <form className="chat-compose" onSubmit={send}>
        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p className="call-sent" role="status" onClick={() => setNotice('')}>{notice}</p>}
        {suggestions.length > 0 && (
          <ul className="mention-list" role="listbox" aria-label="부를 사람">
            {suggestions.map((p) => (
              <li key={p.user_id}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pickMention(p)}>
                  <Avatar url={url(p.avatar_path)} name={p.display_name} size={24} />
                  {p.display_name}
                  {p.role !== 'student' && <span className="chat-role">{ROLE_NAMES[p.role]}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="chat-compose-row">
          <label className="chat-attach" aria-label="사진·짤 보내기">
            <PhotoIcon />
            <input type="file" accept="image/*" className="sr-only" onChange={sendPhoto} disabled={uploading} />
          </label>
          <button type="button" className="chat-attach" aria-label="투표 만들기" aria-pressed={pollOpen} onClick={() => setPollOpen(!pollOpen)}>
            <PollIcon />
          </button>
          <textarea ref={textRef} value={text} rows={1} maxLength={500}
            onChange={(e) => { setText(e.target.value); setCaret(e.target.selectionStart) }}
            onSelect={(e) => setCaret(e.target.selectionStart)}
            placeholder={uploading ? '사진 올리는 중…' : '메시지 (@로 친구 부르기)'} aria-label="메시지"
            onKeyDown={(e) => {
              // 한글 조합 중 Enter 는 글자 확정이므로 보내지 않음
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) send(e)
            }} />
          <button className="chat-send" disabled={!text.trim() || sending}>보내기</button>
        </div>
      </form>

      {zoom && (
        <div className="viewer" onClick={() => setZoom(null)}>
          {url(zoom.image_path) && <img src={url(zoom.image_path)} alt="" />}
          <div className="viewer-actions" onClick={(e) => e.stopPropagation()}>
            {url(zoom.image_path) && <a className="btn-chalk" href={url(zoom.image_path)} download>저장</a>}
            {(zoom.user_id === user.id || canPost) && (
              <button className="btn-chalk danger" onClick={() => remove(zoom)}>지우기</button>
            )}
            {zoom.user_id !== user.id && <button className="btn-chalk danger" onClick={() => report(zoom)}>신고</button>}
          </div>
        </div>
      )}
    </div>
  )
}
