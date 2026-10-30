// 나이스 교육정보 개방 포털 이용약관: 받아 온 자료에는 출처를 밝혀야 함
export default function NeisCredit({ what = '급식' }) {
  return (
    <p className="neis-credit">
      {what} 자료 출처: <a href="https://open.neis.go.kr" target="_blank" rel="noreferrer">나이스 교육정보 개방 포털</a>
    </p>
  )
}
