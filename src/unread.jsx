import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase.js'
import { useSession } from './session.jsx'

const UnreadContext = createContext({ classCount: 0, dm: {}, total: 0, markRead: () => {} })

// 안 읽은 메시지 수. 방마다 어디까지 읽었는지(chat_reads)와 비교해서 셈
// room: 'class' (반 채팅), 'dm:<학생 id>' (1:1)
export function UnreadProvider({ children }) {
  const { user, member, isTeacher } = useSession()
  const [state, setState] = useState({ classCount: 0, dm: {} })
  const reads = useRef(null) // room -> last_id, null = 아직 / DB 업데이트(010) 전
  const timer = useRef(null)

  const refresh = useCallback(async () => {
    if (!member) return
    const { data, error } = await supabase.from('chat_reads').select('room, last_id')
    if (error) { reads.current = null; return }
    reads.current = Object.fromEntries(data.map((r) => [r.room, r.last_id]))
    const last = (room) => reads.current[room] ?? 0

    const cls = await supabase.from('chat_messages').select('id', { count: 'exact', head: true })
      .eq('class_id', member.class_id).neq('user_id', user.id).gt('id', last('class'))
    const dm = {}
    if (isTeacher) {
      const { data: rows } = await supabase.from('direct_messages').select('id, student_id')
        .eq('class_id', member.class_id).neq('sender_id', user.id).order('id', { ascending: false }).limit(500)
      for (const r of rows ?? []) if (r.id > last(`dm:${r.student_id}`)) dm[r.student_id] = (dm[r.student_id] ?? 0) + 1
    } else {
      const res = await supabase.from('direct_messages').select('id', { count: 'exact', head: true })
        .eq('student_id', user.id).neq('sender_id', user.id).gt('id', last(`dm:${user.id}`))
      if (res.count) dm[user.id] = res.count
    }
    setState({ classCount: cls.count ?? 0, dm })
  }, [user?.id, member?.class_id, isTeacher]) // eslint-disable-line react-hooks/exhaustive-deps

  // 새 메시지가 몰려 와도 한 번만 다시 셈
  const soon = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(refresh, 400)
  }, [refresh])

  useEffect(() => {
    if (!member) return
    refresh()
    const channel = supabase.channel(`unread:${user.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `class_id=eq.${member.class_id}` }, soon)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'direct_messages',
        filter: isTeacher ? `class_id=eq.${member.class_id}` : `student_id=eq.${user.id}`
      }, soon)
      .subscribe()
    const onShow = () => document.visibilityState === 'visible' && soon()
    document.addEventListener('visibilitychange', onShow)
    return () => {
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onShow)
      clearTimeout(timer.current)
    }
  }, [user?.id, member?.class_id, isTeacher, refresh, soon]) // eslint-disable-line react-hooks/exhaustive-deps

  // 그 방을 lastId 까지 읽었다고 남김 (앞으로만 감)
  const markRead = useCallback(async (room, lastId) => {
    if (!reads.current || !lastId || lastId <= (reads.current[room] ?? 0)) return
    reads.current[room] = lastId
    setState((s) => room === 'class'
      ? { ...s, classCount: 0 }
      : { ...s, dm: { ...s.dm, [room.slice(3)]: 0 } })
    await supabase.from('chat_reads').upsert({ room, last_id: lastId, updated_at: new Date().toISOString() })
  }, [])

  const total = state.classCount + Object.values(state.dm).reduce((a, b) => a + b, 0)
  return <UnreadContext.Provider value={{ ...state, total, markRead }}>{children}</UnreadContext.Provider>
}

export const useUnread = () => useContext(UnreadContext)

// 숫자 배지 (0이면 안 보임)
export function Badge({ n, label }) {
  if (!n) return null
  return <span className="badge" aria-label={label ?? `안 읽은 메시지 ${n}개`}>{n > 99 ? '99+' : n}</span>
}
