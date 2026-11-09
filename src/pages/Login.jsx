import { useState } from 'react'
import { supabase } from '../supabase.js'
import { useSession } from '../session.jsx'
import SchoolPicker, { gradesFor } from '../components/SchoolPicker.jsx'

const GoogleMark = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
)

export default function Login() {
  const [guest, setGuest] = useState(false)
  const signIn = () =>
    supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    })

  if (guest) return <GuestSetup onBack={() => setGuest(false)} />

  return (
    <div className="login">
      <img className="login-logo" src="/icon-192.png" alt="" />
      <h1>BacoClass</h1>
      <p className="login-sub">수행평가, 가정통신문, 급식과 시간표를<br />우리 반이 한곳에서 봐요.</p>
      <div className="login-actions">
        <button className="btn-google" onClick={signIn}><GoogleMark />Google 계정으로 시작하기</button>
        <button className="btn-secondary" onClick={() => setGuest(true)}>로그인 없이 둘러보기</button>
        <p className="login-note">둘러보기는 급식·시간표·학사일정만 볼 수 있어요 · <a href="/privacy.html">개인정보처리방침</a></p>
      </div>
    </div>
  )
}

// 게스트: 학교와 학년·반만 골라서 급식·시간표 보기 (이 기기에만 저장)
function GuestSetup({ onBack }) {
  const { startGuest } = useSession()
  const [school, setSchool] = useState(null)
  const [grade, setGrade] = useState('')
  const [classNo, setClassNo] = useState('')

  function submit(e) {
    e.preventDefault()
    if (!school) return
    startGuest({ ...school, grade: Number(grade), classNo: Number(classNo) })
  }

  return (
    <form className="page form" onSubmit={submit}>
      <button type="button" className="back" onClick={onBack}>‹ 뒤로</button>
      <h1>둘러보기</h1>
      <p className="fine">학교와 반을 고르면 급식, 시간표, 학사일정을 바로 볼 수 있어요. 수행평가·통신문·채팅은 로그인하고 반에 들어가야 보여요.</p>
      <SchoolPicker value={school} onChange={setSchool} />
      <div className="field-row">
        <label>
          학년
          <select value={grade} onChange={(e) => setGrade(e.target.value)} required>
            <option value="" disabled>고르기</option>
            {gradesFor(school?.kind).map((g) => <option key={g} value={g}>{g}학년</option>)}
          </select>
        </label>
        <label>
          반
          <input type="number" inputMode="numeric" min="1" max="20" value={classNo}
            onChange={(e) => setClassNo(e.target.value)} placeholder="예: 3" required />
        </label>
      </div>
      <button className="btn-primary" disabled={!school}>시작하기</button>
    </form>
  )
}
