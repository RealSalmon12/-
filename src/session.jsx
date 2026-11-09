import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from './supabase.js'

const SessionContext = createContext(null)

// 게스트(로그인 없이 둘러보기): 학교·학년·반만 이 기기에 저장
const GUEST_KEY = 'bacoclass-guest'
function readGuest() {
  try { return JSON.parse(localStorage.getItem(GUEST_KEY)) } catch { return null }
}
// 게스트도 화면 코드가 그대로 쓸 수 있게 반 정보 모양으로 바꿈
function guestMember(g) {
  return {
    guest: true, class_id: null, role: 'guest', display_name: '게스트',
    classes: {
      name: `${g.grade}학년 ${g.classNo}반`, grade: g.grade, class_no: g.classNo,
      office_code: g.office, school_code: g.code, school_name: g.name, school_kind: g.kind
    }
  }
}

export const POSTER_ROLES = ['teacher', 'president', 'vice']
export const ROLE_NAMES = { teacher: '선생님', president: '반장', vice: '부반장', student: '학생', guest: '게스트' }

export function SessionProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined = 아직 확인 중
  const [member, setMember] = useState(undefined)
  const [guest, setGuest] = useState(readGuest)

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
    // DB 업데이트(002, 003)를 아직 안 했으면 없는 칸을 빼고 다시 읽음
    const tries = [
      'name, invite_code, grade, class_no, office_code, school_code, school_name, school_kind',
      'name, invite_code, grade, class_no',
      'name, invite_code'
    ]
    let data = null
    for (const cols of tries) {
      const res = await query(cols)
      if (!res.error) { data = res.data; break }
    }
    setMember(data?.[0] ?? null)
  }, [user])

  useEffect(() => { loadMember() }, [loadMember])

  const startGuest = (g) => {
    try { localStorage.setItem(GUEST_KEY, JSON.stringify(g)) } catch { /* 이번만 */ }
    setGuest(g)
  }
  const endGuest = () => {
    try { localStorage.removeItem(GUEST_KEY) } catch { /* 무시 */ }
    setGuest(null)
  }
  const isGuest = user === null && !!guest
  // 로그인하면 게스트 설정은 지움 (로그아웃하면 처음 화면으로)
  useEffect(() => { if (user && guest) endGuest() }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  const value = {
    user,
    member: isGuest ? guestMember(guest) : member,
    isGuest,
    startGuest,
    endGuest,
    reloadMember: loadMember,
    canPost: !isGuest && !!member && POSTER_ROLES.includes(member.role),
    isTeacher: !isGuest && member?.role === 'teacher'
  }
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export const useSession = () => useContext(SessionContext)
