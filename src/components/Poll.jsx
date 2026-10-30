import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { useSession } from '../session.jsx'

// 채팅 메시지에 붙은 투표들과 표. 누가 투표하면 실시간으로 다시 셈
export function usePolls(pollIds) {
  const [polls, setPolls] = useState({})
  const [votes, setVotes] = useState({}) // poll_id -> [{ user_id, choice }]
  const key = [...new Set(pollIds.filter(Boolean))].sort((a, b) => a - b).join(',')

  const loadVotes = useCallback(async (ids) => {
    if (!ids.length) return
    const { data } = await supabase.from('poll_votes').select('poll_id, user_id, choice').in('poll_id', ids)
    setVotes((old) => {
      const next = { ...old }
      for (const id of ids) next[id] = []
      for (const v of data ?? []) next[v.poll_id].push(v)
      return next
    })
  }, [])

  useEffect(() => {
    const ids = key ? key.split(',').map(Number) : []
    if (!ids.length) return
    supabase.from('polls').select('*').in('id', ids)
      .then(({ data }) => setPolls((old) => ({ ...old, ...Object.fromEntries((data ?? []).map((p) => [p.id, p])) })))
    loadVotes(ids)
    const channel = supabase.channel(`polls:${key}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes' }, ({ new: n, old: o }) => {
        const id = n?.poll_id ?? o?.poll_id
        if (ids.includes(id)) loadVotes([id])
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [key, loadVotes])

  return { polls, votes, reloadVotes: loadVotes }
}

// 투표 카드: 누르면 그걸로 투표, 내가 고른 걸 다시 누르면 취소
export function PollCard({ poll, votes = [], mine, people, onChanged }) {
  const { user, isTeacher } = useSession()
  const [busy, setBusy] = useState(false)
  const [showWho, setShowWho] = useState(false)
  if (!poll) return <div className="poll poll-ghost" />
  const myChoice = votes.find((v) => v.user_id === user.id)?.choice
  const total = votes.length

  async function vote(i) {
    setBusy(true)
    if (myChoice === i) {
      await supabase.from('poll_votes').delete().eq('poll_id', poll.id).eq('user_id', user.id)
    } else {
      await supabase.from('poll_votes').upsert({ poll_id: poll.id, user_id: user.id, choice: i })
    }
    setBusy(false)
    onChanged([poll.id])
  }

  return (
    <div className={`poll${mine ? ' mine' : ''}`}>
      <p className="poll-q"><span className="poll-tag">투표</span>{poll.question}</p>
      <ul>
        {poll.options.map((opt, i) => {
          const n = votes.filter((v) => v.choice === i).length
          const pct = total ? Math.round((n / total) * 100) : 0
          return (
            <li key={i}>
              <button className={`poll-opt${myChoice === i ? ' on' : ''}`} onClick={() => vote(i)} disabled={busy}
                aria-pressed={myChoice === i}>
                <span className="poll-bar" style={{ width: `${pct}%` }} />
                <span className="poll-label">{opt}</span>
                <span className="poll-n">{n}</span>
              </button>
              {showWho && n > 0 && (
                <p className="fine poll-who">{votes.filter((v) => v.choice === i).map((v) => people[v.user_id]?.display_name ?? '?').join(', ')}</p>
              )}
            </li>
          )
        })}
      </ul>
      <p className="fine">
        {total}명 참여{myChoice !== undefined && ' · 다시 누르면 취소'}
        {(isTeacher || poll.user_id === user.id) && total > 0 && (
          <> · <button className="btn-text poll-who-btn" onClick={() => setShowWho(!showWho)}>{showWho ? '이름 숨기기' : '누가 골랐나 보기'}</button></>
        )}
      </p>
    </div>
  )
}

// 투표 만들기 (채팅 입력창 위에 펼쳐짐)
export function PollForm({ onCreate, onCancel, busy }) {
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState(['', ''])
  const filled = options.map((o) => o.trim()).filter(Boolean)

  return (
    <form className="poll-form" onSubmit={(e) => { e.preventDefault(); onCreate(question.trim(), filled) }}>
      <div className="section-head">
        <b>투표 만들기</b>
        <button type="button" className="btn-text quiet" onClick={onCancel}>닫기</button>
      </div>
      <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={100} placeholder="질문 (예: 반 티 색깔은?)" aria-label="질문" autoFocus />
      {options.map((o, i) => (
        <input key={i} value={o} maxLength={40} placeholder={`보기 ${i + 1}`} aria-label={`보기 ${i + 1}`}
          onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />
      ))}
      <div className="actions">
        {options.length < 6 && <button type="button" className="btn-quiet" onClick={() => setOptions([...options, ''])}>보기 더하기</button>}
        <button className="btn-quiet poll-submit" disabled={busy || !question.trim() || filled.length < 2}>{busy ? '올리는 중…' : '투표 올리기'}</button>
      </div>
    </form>
  )
}
