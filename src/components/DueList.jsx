import { Link } from 'react-router-dom'
import { daysLeft, shortDate } from '../util.js'

// 남은 날: 내일까지 빨간펜, 일주일 안 형광펜, 그 뒤 연하게
export function DueMark({ date, done }) {
  const n = daysLeft(date)
  const label = n === 0 ? '오늘' : n > 0 ? `D-${n}` : `D+${-n}`
  const tone = done || n < 0 ? 'past' : n <= 1 ? 'urgent' : n <= 7 ? 'soon' : 'later'
  return <span className={`due due-${tone}`}>{label}</span>
}

export function DoneButton({ checked, onToggle, title }) {
  return (
    <button
      type="button"
      className={checked ? 'check on' : 'check'}
      aria-pressed={checked}
      aria-label={checked ? `${title} 다 했어요 표시 빼기` : `${title} 다 했어요`}
      onClick={onToggle}
    >
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
}

// 수행평가 한 줄: 남은 날 | 과목, 평가 방식, 평가 주제 | 완료 체크
export default function DueList({ items, done, onToggle }) {
  return (
    <ul className="due-list">
      {items.map((a) => {
        const isDone = done?.has(a.id)
        return (
          <li key={a.id} className={isDone ? 'is-done' : ''}>
            <Link to={`/assessments/${a.id}`} className="due-row">
              <span className="due-col">
                <DueMark date={a.due_date} done={isDone} />
                <span className="due-date">{shortDate(a.due_date)}</span>
              </span>
              <span className="due-body">
                <span className="due-meta">
                  <span className="due-subject">{a.subject}</span>
                  {a.kind && <span className="due-kind">{a.kind}</span>}
                  {a.weight != null && <span className="due-kind">{a.weight}%</span>}
                </span>
                <span className="due-title">{a.title}</span>
              </span>
            </Link>
            {onToggle && <DoneButton checked={isDone} title={a.title} onToggle={() => onToggle(a.id)} />}
          </li>
        )
      })}
    </ul>
  )
}
