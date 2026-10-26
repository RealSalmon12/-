import { Link } from 'react-router-dom'
import { daysLeft, shortDate } from '../util.js'

// 수행평가 한 줄: 왼쪽에 남은 날, 오른쪽에 과목과 제목
export function DueMark({ date }) {
  const n = daysLeft(date)
  const label = n === 0 ? '오늘' : n > 0 ? `D-${n}` : `D+${-n}`
  const tone = n < 0 ? 'past' : n <= 1 ? 'urgent' : n <= 7 ? 'soon' : 'later'
  return <span className={`due due-${tone}`}>{label}</span>
}

export default function DueList({ items }) {
  return (
    <ul className="due-list">
      {items.map((a) => (
        <li key={a.id}>
          <Link to={`/assessments/${a.id}`} className="due-row">
            <span className="due-col">
              <DueMark date={a.due_date} />
              <span className="due-date">{shortDate(a.due_date)}</span>
            </span>
            <span className="due-body">
              <span className="due-subject">{a.subject}</span>
              <span className="due-title">{a.title}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
