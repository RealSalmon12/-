import { usePush } from '../push.js'
import { useSession } from '../session.jsx'

const NOTES = {
  on: '마감 전날 저녁 6시에 알려 드려요. "다 했어요"를 누른 수행평가는 빼고 보내요.',
  off: '수행평가 마감 전날 저녁 6시에 휴대폰으로 알려 드려요.',
  denied: '이 브라우저에서 알림이 막혀 있어요. 브라우저 설정 > 사이트 설정 > 알림에서 허용해 주세요.',
  'ios-install': '아이폰은 홈 화면에 추가한 앱에서만 알림을 받을 수 있어요. 공유 > 홈 화면에 추가 후 앱에서 켜 주세요.',
  unsupported: '이 브라우저는 알림을 지원하지 않아요. 크롬이나 삼성 인터넷에서 열어 주세요.'
}

// 마감 하루 전 알림 켜기/끄기 (내 계정, 홈)
export default function PushToggle({ compact = false }) {
  const { status, busy, error, enable, disable } = usePush()
  const { canPost } = useSession()
  if (status === 'loading') return null
  if (compact && status !== 'off') return null

  return (
    <div className={compact ? 'push-card' : 'section'}>
      <div className="section-head">
        <b>마감 하루 전 알림</b>
        {status === 'on' && <button className="btn-text quiet" onClick={disable} disabled={busy}>끄기</button>}
        {status === 'off' && <button className="btn-quiet" onClick={enable} disabled={busy}>{busy ? '켜는 중…' : '알림 켜기'}</button>}
      </div>
      <p className="fine">{NOTES[status]}</p>
      {canPost && (status === 'on' || status === 'off') && <p className="fine">관리자 호출도 이 알림으로 받아요.</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  )
}
