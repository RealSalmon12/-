// 리로스쿨에서 가져온 글이면 표시와 원문 링크
export default function RiroLink({ item }) {
  if (item.source !== 'riro') return null
  return (
    <p className="riro-from">
      <span className="chip">리로스쿨에서 가져옴</span>
      {item.source_url && <a href={item.source_url} target="_blank" rel="noreferrer">원문 보기 ›</a>}
    </p>
  )
}
