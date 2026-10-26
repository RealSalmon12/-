import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase.js'

const SessionContext = createContext(null)

export const POSTER_ROLES = ['teacher', 'president', 'vice']
export const ROLE_NAMES = { teacher: '선생님', president: '반장', vice: '부반장', student: '학생' }

export function SessionProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined = 아직 확인 중
  const [member, setMember] = useState(undefined)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null))
    return () => data.subscription.unsubscribe()
  }, [])

  const loadMember = useCallback(async () => {
    if (!user) return setMember(user === null ? null : undefined)
    // 1차 버전은 한 사람이 한 반에만 속한다고 보고 첫 번째 반을 씀
    const query = (cols) => supabase
      .from('members')
      .select(`class_id, display_name, role, classes(${cols})`)
      .eq('user_id', user.id)
      .order('joined_at')
      .limit(1)
    let { data, error } = await query('name, invite_code, grade, class_no')
    // 2차 DB 업데이트(002_real_use.sql) 전이면 학년/반 칸이 없으니 빼고 다시 읽음
    if (error) ({ data } = await query('name, invite_code'))
    setMember(data?.[0] ?? null)
  }, [user])

  useEffect(() => { loadMember() }, [loadMember])

  const value = {
    user,
    member,
    reloadMember: loadMember,
    canPost: !!member && POSTER_ROLES.includes(member.role),
    isTeacher: member?.role === 'teacher'
  }
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export const useSession = () => useContext(SessionContext)
