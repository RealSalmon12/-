import { useState } from 'react'
import { THEMES, getTheme, setTheme } from '../theme.js'

// 내 계정: 화면 밝기 고르기
export default function ThemePicker() {
  const [theme, pick] = useState(getTheme)
  return (
    <section className="section" id="theme">
      <h2>화면</h2>
      <div className="theme-row" role="radiogroup" aria-label="화면 밝기">
        {THEMES.map((t) => (
          <button key={t.id} type="button" role="radio" aria-checked={theme === t.id}
            className={`theme-opt${theme === t.id ? ' on' : ''}`}
            onClick={() => { setTheme(t.id); pick(t.id) }}>
            {t.name}
          </button>
        ))}
      </div>
      <p className="fine">이 기기에서만 바뀌어요.</p>
    </section>
  )
}
