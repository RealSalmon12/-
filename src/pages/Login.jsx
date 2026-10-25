import { supabase } from '../supabase.js'

export default function Login() {
  const signIn = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    })

  return (
    <div className="center stack">
      <img src="/icon.svg" alt="" width="88" height="88" />
      <h1>학급정리기</h1>
      <p className="muted">수행평가, 가정통신문, 급식을 한눈에</p>
      <button className="primary big" onClick={signIn}>Google 계정으로 시작하기</button>
    </div>
  )
}
