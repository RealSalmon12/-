import { supabase } from '../supabase.js'

export default function Login() {
  const signIn = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    })

  return (
    <div className="board">
      <div className="board-inner">
        <h1 className="board-title">학급정리기</h1>
        <p className="board-sub">수행평가 마감, 가정통신문, 오늘 급식을<br />우리 반 친구들과 같이 봐요.</p>
      </div>
      <div className="board-ledge">
        <button className="btn-chalk" onClick={signIn}>Google 계정으로 로그인</button>
        <p className="board-note">우리 학교 급식과 시간표는 NEIS에서 자동으로 불러와요</p>
      </div>
    </div>
  )
}
