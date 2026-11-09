import { parseDish } from '../util.js'

const RICE = /(밥|라이스|덮밥|볶음밥|죽)$/
const SOUP = /(국|찌개|탕|스프|수프|국수|우동|라면|짬뽕|전골)$/

// 급식 메뉴를 한 줄씩. 밥·국은 굵게, 알레르기 번호는 원할 때만 작게
export default function Tray({ dishes, showAllergies = false }) {
  const items = dishes.map(parseDish)
  return (
    <ul className="menu" aria-label="급식 메뉴">
      {items.map((d, i) => {
        const key = d.name.replace(/\s/g, '')
        return (
          <li key={i} className={RICE.test(key) || SOUP.test(key) ? 'main' : ''}>
            {d.name}
            {showAllergies && d.allergies && <span className="dish-allergy">{d.allergies}</span>}
          </li>
        )
      })}
    </ul>
  )
}
