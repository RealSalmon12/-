import { parseDish } from '../util.js'

const RICE = /(밥|라이스|덮밥|볶음밥|죽)$/
const SOUP = /(국|찌개|탕|스프|수프|국수|우동|라면|짬뽕|전골)$/
const DESSERT = /(요구르트|요거트|요플레|플레인|우유|주스|쥬스|음료|과일|케이크|케익|푸딩|아이스|빵|쿠키|바나나|사과|귤|포도|수박|멜론|키위|딸기|파인애플|오렌지)/

// NEIS 메뉴 목록을 식판 칸(밥, 국, 반찬, 후식)으로 나눔
export function arrangeTray(dishes) {
  const items = dishes.map(parseDish)
  const take = (re) => {
    const i = items.findIndex((d) => re.test(d.name.replace(/\s/g, '')))
    return i < 0 ? null : items.splice(i, 1)[0]
  }
  const rice = take(RICE) ?? items.shift() ?? null
  const soup = take(SOUP)
  const desserts = []
  for (let d; (d = take(DESSERT)); ) desserts.push(d)
  return { rice, soup, sides: items, desserts }
}

function Dish({ dish, showAllergies }) {
  if (!dish) return null
  return (
    <>
      <span className="dish-name">{dish.name}</span>
      {showAllergies && dish.allergies && <span className="dish-allergy">{dish.allergies}</span>}
    </>
  )
}

export default function Tray({ dishes, showAllergies = false }) {
  const { rice, soup, sides, desserts } = arrangeTray(dishes)
  const top = sides.length ? sides : [null]
  return (
    <div className="tray-wrap">
      <div className="tray" role="list" aria-label="급식 메뉴">
        <div className="tray-row tray-sides">
          {top.map((d, i) => (
            <div key={i} className="well" role="listitem"><Dish dish={d} showAllergies={showAllergies} /></div>
          ))}
        </div>
        <div className={desserts.length ? 'tray-row tray-main has-dessert' : 'tray-row tray-main'}>
          <div className="well well-rice" role="listitem"><Dish dish={rice} showAllergies={showAllergies} /></div>
          <div className="well well-soup" role="listitem"><Dish dish={soup} showAllergies={showAllergies} /></div>
          {desserts.length > 0 && (
            <div className="tray-desserts">
              {desserts.map((d, i) => (
                <div key={i} className="well well-dessert" role="listitem"><Dish dish={d} showAllergies={showAllergies} /></div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
