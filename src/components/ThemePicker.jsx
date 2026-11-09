import { useState } from 'react'
import { ACCENTS, getAccent, setAccent } from '../theme.js'

// 내 계정: 강조색 고르기
export default function ThemePicker() {
  const [accent, pick] = useState(getAccent)
  return (
    <section className="section" id="theme">
      <h2>강조색</h2>
      <div className="accent-row" role="radiogroup" aria-label="강조색">
        {ACCENTS.map((a) => (
          <button key={a.id} type="button" role="radio" aria-checked={accent === a.id}
            className={`accent-opt${accent === a.id ? ' on' : ''}`}
            onClick={() => { setAccent(a.id); pick(a.id) }}>
            <span className="accent-dot" style={{ background: a.color }} aria-hidden="true" />
            {a.name}
          </button>
        ))}
      </div>
      <p className="fine">이 기기에서만 바뀌어요. 어두운 화면은 휴대폰 설정을 따라가요.</p>
    </section>
  )
}
