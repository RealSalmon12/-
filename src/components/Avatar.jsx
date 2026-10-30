// 프로필 사진. 없으면 이름 첫 글자를 동그라미에
export default function Avatar({ url, name, size = 32 }) {
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">
      {url ? <img src={url} alt="" /> : (name ?? '?').trim().slice(0, 1)}
    </span>
  )
}
