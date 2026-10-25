import { useEffect, useState } from 'react'
import { supabase } from '../supabase.js'
import { today, addDays, formatDate, parseDish } from '../util.js'

const ORDER = { 조식: 0, 중식: 1, 석식: 2 }

export function useMeals(from, to) {
  const [state, setState] = useState({ loading: true, list: [], error: '' })
  useEffect(() => {
    setState((s) => ({ ...s, loading: true }))
    supabase.functions.invoke('meals', { body: { from, to } }).then(({ data, error }) => {
      const list = Array.isArray(data) ? [...data].sort((a, b) => ORDER[a.meal_type] - ORDER[b.meal_type]) : []
      setState({ loading: false, list, error: error ? '급식을 불러오지 못했어요' : '' })
    })
  }, [from, to])
  return state
}

export function MealCard({ meal, compact }) {
  return (
    <div className="meal">
      <div className="row between">
        <b>{meal.meal_type}</b>
        {meal.calories && <span className="muted small">{meal.calories}</span>}
      </div>
      <ul className={compact ? 'dishes inline' : 'dishes'}>
        {meal.dishes.map((d) => {
          const { name, allergies } = parseDish(d)
          return <li key={d}>{name}{!compact && allergies && <sup className="muted">{allergies}</sup>}</li>
        })}
      </ul>
    </div>
  )
}

export default function Meals() {
  const [date, setDate] = useState(today())
  const { loading, list, error } = useMeals(date, date)

  return (
    <div className="page stack">
      <h1>급식</h1>
      <div className="row between card">
        <button className="chip" onClick={() => setDate(addDays(date, -1))}>‹</button>
        <button className="link" onClick={() => setDate(today())}>{formatDate(date)}</button>
        <button className="chip" onClick={() => setDate(addDays(date, 1))}>›</button>
      </div>
      {loading ? <p className="muted">불러오는 중…</p>
        : error ? <p className="error">{error}</p>
        : list.length ? list.map((m) => <section key={m.meal_type} className="card"><MealCard meal={m} /></section>)
        : <p className="muted">이 날은 급식이 없어요</p>}
      <p className="muted small">
        알레르기: 1 난류 2 우유 3 메밀 4 땅콩 5 대두 6 밀 7 고등어 8 게 9 새우 10 돼지고기 11 복숭아
        12 토마토 13 아황산류 14 호두 15 닭고기 16 쇠고기 17 오징어 18 조개류 19 잣
      </p>
    </div>
  )
}
