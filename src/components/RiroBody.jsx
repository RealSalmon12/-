// 리로스쿨에서 가져온 본문(표·굵게·목록). 서버에서 이미 걸렀지만, 여기서도 허용한 태그만 다시 만들어서 보여 줌
const KEEP = new Set(['p', 'br', 'strong', 'b', 'u', 'em', 'i', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'ul', 'ol', 'li', 'blockquote'])

function rebuild(node, out) {
  if (node.nodeType === Node.TEXT_NODE) {
    out.append(document.createTextNode(node.textContent))
    return
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return
  const tag = node.tagName.toLowerCase()
  if (!KEEP.has(tag)) {
    // 모르는 태그는 버리고 글자만 (script 등은 서버에서 이미 빠짐)
    if (!['script', 'style', 'iframe', 'object', 'embed'].includes(tag)) node.childNodes.forEach((c) => rebuild(c, out))
    return
  }
  const el = document.createElement(tag)
  if (tag === 'td' || tag === 'th') {
    for (const name of ['colspan', 'rowspan']) {
      const v = node.getAttribute(name)
      if (v && /^\d{1,2}$/.test(v)) el.setAttribute(name, v)
    }
  }
  node.childNodes.forEach((c) => rebuild(c, el))
  out.append(el)
}

export function cleanRiroHtml(html) {
  const parsed = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html').body.firstChild
  const box = document.createElement('div')
  parsed?.childNodes.forEach((c) => rebuild(c, box))
  return box.innerHTML
}

// 리로스쿨 글의 content/memo 맨 앞 "담당: … / 제출: … / 작성: …" 줄
export const riroHead = (text) => (text ?? '').split('\n\n')[0]
  .split('\n').filter((l) => /^(담당|제출|작성): /.test(l)).join('\n')

export default function RiroBody({ html }) {
  return <div className="riro-body" dangerouslySetInnerHTML={{ __html: cleanRiroHtml(html) }} />
}
