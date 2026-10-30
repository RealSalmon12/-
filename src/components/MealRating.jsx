import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { useSession } from '../session.jsx'
import { today } from '../util.js'

// 급식 별점: 내 별점을 누르고, 반 평균을 봄. 아직 안 먹은 날(미래)은 못 매김
export default function MealRating({ date, type }) {
  const { user, member } = useSession()
  const [rows, setRows] = useState(null) // null = 읽는 중 / DB 업데이트 전
  const [busy, setBusy] = useState(false)

  const load = () => supabase.from('meal_ratings').select('user_id, score')
    .eq('class_id', member.class_id).eq('meal_date', date).eq('meal_type', type)
    .then(({ data, error }) => setRows(error ? null : data))

  useEffect(() => { load() }, [member.class_id, date, type]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!rows) return null
  const mine = rows.find((r) => r.user_id === user.id)?.score ?? 0
  const avg = rows.length ? rows.reduce((a, r) => a + r.score, 0) / rows.length : 0
  const canRate = date <= today()

  async function rate(score) {
    setBusy(true)
    if (score === mine) {
      await supabase.from('meal_ratings').delete()
        .eq('class_id', member.class_id).eq('meal_date', date).eq('meal_type', type).eq('user_id', user.id)
    } else {
      await supabase.from('meal_ratings').upsert({
        class_id: member.class_id, meal_date: date, meal_type: type, user_id: user.id, score, updated_at: new Date().toISOString()
      })
    }
    await load()
    setBusy(false)
  }

  return (
    <div className="meal-rating">
      {canRate && (
        <div className="stars" role="radiogroup" aria-label="내 별점">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} role="radio" aria-checked={mine === n} aria-label={`${n}점`} disabled={busy}
              className={n <= mine ? 'on' : ''} onClick={() => rate(n)}>★</button>
          ))}
        </div>
      )}
      <span className="fine">
        {rows.length ? `반 평균 ★${avg.toFixed(1)} · ${rows.length}명` : canRate ? '맛있었나요? 별점을 남겨 주세요' : '먹고 나서 별점을 남길 수 있어요'}
      </span>
    </div>
  )
}

// '2026-10' -> '2026-11-01'
const nextMonth = (month) => {
  const [y, m] = month.split('-').map(Number)
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`
}

// 이번 달 반에서 별점이 높은 급식 (2명 이상 매긴 것만)
export function useTopMeals(classId, month) {
  const [top, setTop] = useState(null)
  useEffect(() => {
    supabase.from('meal_ratings').select('meal_date, meal_type, score')
      .eq('class_id', classId).gte('meal_date', `${month}-01`).lt('meal_date', nextMonth(month))
      .then(({ data, error }) => {
        if (error) return setTop(null)
        const groups = {}
        for (const r of data) {
          const k = `${r.meal_date}|${r.meal_type}`
          ;(groups[k] ??= { date: r.meal_date, type: r.meal_type, scores: [] }).scores.push(r.score)
        }
        setTop(Object.values(groups)
          .filter((g) => g.scores.length >= 2)
          .map((g) => ({ ...g, avg: g.scores.reduce((a, b) => a + b, 0) / g.scores.length }))
          .sort((a, b) => b.avg - a.avg || b.scores.length - a.scores.length)
          .slice(0, 3))
      })
  }, [classId, month])
  return top
}
