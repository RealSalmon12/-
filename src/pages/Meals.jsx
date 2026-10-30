import { useState } from 'react'
import { useNeis } from '../neis.js'
import { today, addDays, formatDate } from '../util.js'
import Tray from '../components/Tray.jsx'
import NeisCredit from '../components/NeisCredit.jsx'
import MealRating, { useTopMeals } from '../components/MealRating.jsx'
import { useSession } from '../session.jsx'

const ORDER = { 조식: 0, 중식: 1, 석식: 2 }

export function useMeals(from, to) {
  const { loading, data, error } = useNeis('meals', { from, to })
  const list = [...data].sort((a, b) => ORDER[a.meal_type] - ORDER[b.meal_type])
  return { loading, list, error: error && '급식을 불러오지 못했어요.' }
}

export default function Meals() {
  const [date, setDate] = useState(today())
  const { loading, list, error } = useMeals(date, date)
  const { member } = useSession()
  const top = useTopMeals(member.class_id, today().slice(0, 7))

  return (
    <div className="page">
      <header className="page-head">
        <h1>급식</h1>
      </header>
      <div className="stepper">
        <button className="step" onClick={() => setDate(addDays(date, -1))} aria-label="전날">‹</button>
        <button className="btn-text" onClick={() => setDate(today())}>
          {formatDate(date)}{date === today() && ' 오늘'}
        </button>
        <button className="step" onClick={() => setDate(addDays(date, 1))} aria-label="다음날">›</button>
      </div>
      {loading ? <div className="tray tray-ghost" />
        : error ? <p className="error">{error} 잠시 뒤 다시 열어 주세요.</p>
        : list.length ? list.map((m) => (
          <section key={m.meal_type} className="section">
            <div className="section-head">
              <h2>{m.meal_type}</h2>
              {m.calories && <span className="fine">{m.calories.replace(' Kcal', ' kcal')}</span>}
            </div>
            <Tray dishes={m.dishes} showAllergies />
            <MealRating date={date} type={m.meal_type} />
          </section>
        ))
        : <p className="empty">이 날은 급식이 없어요.</p>}
      {top?.length > 0 && (
        <section className="section">
          <h2>이번 달 우리 반 인기 급식</h2>
          <ol className="top-meals">
            {top.map((g) => (
              <li key={g.date + g.type}>
                <button className="plain-row" onClick={() => setDate(g.date)}>
                  <span>{formatDate(g.date)} {g.type}</span>
                  <span className="fine">★{g.avg.toFixed(1)} · {g.scores.length}명</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
      <details className="legend">
        <summary>알레르기 번호 보기</summary>
        <p>1 난류, 2 우유, 3 메밀, 4 땅콩, 5 대두, 6 밀, 7 고등어, 8 게, 9 새우, 10 돼지고기, 11 복숭아,
          12 토마토, 13 아황산류, 14 호두, 15 닭고기, 16 쇠고기, 17 오징어, 18 조개류, 19 잣</p>
      </details>
      <NeisCredit what="급식" />
    </div>
  )
}
