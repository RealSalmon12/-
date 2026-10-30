// 반 채팅 @멘션: "@이름" 을 찾아 그 사람 id 로 바꾸고, 화면에서는 강조

// 입력칸 커서 바로 앞이 "@글자" 면 그 글자를 돌려줌 (자동 완성용)
export function mentionQuery(text, caret) {
  const m = text.slice(0, caret).match(/(?:^|\s)@([^\s@]{0,20})$/)
  return m ? m[1] : null
}

// 커서 앞의 "@글자" 를 "@이름 " 으로 바꿈
export function insertMention(text, caret, name) {
  const before = text.slice(0, caret).replace(/@([^\s@]{0,20})$/, `@${name} `)
  return { text: before + text.slice(caret), caret: before.length }
}

// 본문에 나온 "@이름" 중 반 멤버인 사람들 id (긴 이름부터 맞춰 봄)
export function findMentions(body, people) {
  const ids = []
  for (const p of Object.values(people).sort((a, b) => b.display_name.length - a.display_name.length)) {
    if (body.includes(`@${p.display_name}`) && !ids.includes(p.user_id)) ids.push(p.user_id)
  }
  return ids.slice(0, 20)
}

// 본문을 [글자, 멘션, 글자, ...] 조각으로 나눔
export function splitMentions(body, people) {
  const names = Object.values(people).map((p) => p.display_name).filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!names.length || !body.includes('@')) return [{ text: body }]
  const re = new RegExp(`@(${names.join('|')})`, 'g')
  const parts = []
  let last = 0
  for (const m of body.matchAll(re)) {
    if (m.index > last) parts.push({ text: body.slice(last, m.index) })
    parts.push({ text: m[0], name: m[1] })
    last = m.index + m[0].length
  }
  if (last < body.length) parts.push({ text: body.slice(last) })
  return parts
}
