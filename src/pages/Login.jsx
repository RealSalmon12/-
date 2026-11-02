import { supabase } from '../supabase.js'
import Baco from '../components/Baco.jsx'

export default function Login() {
  const signIn = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    })

  return (
    <div className="floe-page">
      <div className="floe-sky">
        <h1 className="floe-title">BacoClass</h1>
        <p className="floe-sub">수행평가 마감, 가정통신문, 오늘 급식을<br />우리 반 친구들과 같이 봐요.</p>
      </div>
      <div className="floe-scene" aria-hidden="true">
        <div className="floe-bob">
          <Baco className="floe-baco" size={224} />
          <svg className="floe-ice" viewBox="0 0 320 70" preserveAspectRatio="none">
            <path d="M14 22L46 8L118 12L170 4L238 10L300 18L310 30L6 30Z" fill="#fffdf9" />
            <path d="M6 30L310 30L296 52L218 64L120 60L36 50Z" fill="#e6d4c4" />
          </svg>
        </div>
        <svg className="floe-wave" viewBox="0 0 400 24" preserveAspectRatio="none">
          <path d="M0 12C34 2 66 2 100 12S166 22 200 12S266 2 300 12S366 22 400 12V24H0Z" fill="#5b3a2e" />
        </svg>
      </div>
      <div className="floe-sea">
        <button className="btn-ice" onClick={signIn}>Google 계정으로 로그인</button>
        <p className="floe-note">우리 학교 급식과 시간표는 NEIS에서 자동으로 불러와요</p>
        <p className="floe-note"><a href="/privacy.html">개인정보처리방침</a></p>
      </div>
    </div>
  )
}
