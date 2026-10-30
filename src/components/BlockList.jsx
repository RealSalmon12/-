import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { useSession } from '../session.jsx'
import { loadClassPeople } from '../chatMedia.js'

// 내 계정: 반 채팅에서 차단한 사람 목록과 차단 풀기 (아무도 없으면 안 보임)
export default function BlockList() {
  const { member } = useSession()
  const [blocked, setBlocked] = useState([])
  const [people, setPeople] = useState({})

  const load = () => supabase.from('user_blocks').select('blocked_id')
    .then(({ data }) => setBlocked((data ?? []).map((b) => b.blocked_id)))
  useEffect(() => {
    load()
    loadClassPeople(member.class_id).then(setPeople)
  }, [member.class_id])

  if (!blocked.length) return null

  async function unblock(id) {
    await supabase.from('user_blocks').delete().eq('blocked_id', id)
    load()
  }

  return (
    <section className="section">
      <h2>차단한 사람</h2>
      <ul className="plain-list">
        {blocked.map((id) => (
          <li key={id} className="plain-row">
            <span>{people[id]?.display_name ?? '반을 나간 사람'}</span>
            <button className="btn-text" onClick={() => unblock(id)}>차단 풀기</button>
          </li>
        ))}
      </ul>
    </section>
  )
}
