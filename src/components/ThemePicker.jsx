import { useState } from 'react'
import { SEASONS, getSeason, setSeason } from '../theme.js'

// 내 계정: 계절 테마 고르기
export default function ThemePicker() {
  const [season, pick] = useState(getSeason)
  return (
    <section className="section" id="theme">
      <h2>테마</h2>
      <div className="season-grid" role="radiogroup" aria-label="계절 테마">
        {SEASONS.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={season === s.id}
            className={`season season-${s.id}${season === s.id ? ' on' : ''}`}
            onClick={() => { setSeason(s.id); pick(s.id) }}>
            <span className="season-swatch" aria-hidden="true" />
            <b>{s.name}</b>
            <span className="fine">{s.note}</span>
          </button>
        ))}
      </div>
      <p className="fine">이 기기에서만 바뀌어요.</p>
    </section>
  )
}
