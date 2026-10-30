import { useEffect, useState } from 'react'
import { isIos, isIosOtherBrowser, isMacSafari, standalone } from '../platform.js'

// 크롬/삼성 인터넷은 설치 이벤트를 앱 시작 때 한 번만 주므로 모듈이 읽힐 때 받아 둠
let deferred = null
const listeners = new Set()
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e
    listeners.forEach((fn) => fn())
  })
}

const KEY = 'install-hint-hidden'
const read = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }
const hide = () => { try { localStorage.setItem(KEY, '1') } catch { /* 저장 못 해도 이번엔 숨김 */ } }

// 기기마다 설치하는 방법
function howTo() {
  if (deferred) return { title: '앱으로 설치하기', text: '홈 화면(컴퓨터는 바탕화면)에 아이콘이 생기고 앱처럼 열려요.' }
  if (isIos()) {
    return {
      title: '아이폰·아이패드에 앱으로 설치하기',
      text: isIosOtherBrowser()
        ? '주소창 옆 공유 버튼을 누르고 "홈 화면에 추가"를 고르세요. 안 보이면 사파리로 열어서 해 주세요. 설치한 앱에서만 알림이 와요.'
        : '아래쪽 공유 버튼(네모에 위 화살표)을 누르고 "홈 화면에 추가"를 고르세요. 설치한 앱에서만 알림이 와요.'
    }
  }
  if (isMacSafari()) {
    return { title: '맥에 앱으로 설치하기', text: '메뉴 막대의 파일 → "Dock에 추가"를 고르면 Dock에서 앱처럼 열려요. (macOS 소노마 이상)' }
  }
  return null
}

// 앱으로 추가하라는 안내 (이미 앱으로 열었으면 안 보임). always 면 닫았어도 보여 줌 (내 계정 화면)
export default function InstallHint({ always = false }) {
  const [, rerender] = useState(0)
  const [hidden, setHidden] = useState(read)

  useEffect(() => {
    const fn = () => rerender((n) => n + 1)
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])

  if ((hidden && !always) || standalone()) return null
  const how = howTo()
  if (!how) return null

  async function install() {
    deferred.prompt()
    await deferred.userChoice
    deferred = null
    close()
  }
  function close() { hide(); setHidden(true) }

  return (
    <aside className="install">
      <div>
        <b>{how.title}</b>
        <p className="fine">{how.text}</p>
      </div>
      <div className="actions">
        {deferred && <button className="btn-chalk small" onClick={install}>설치</button>}
        {!always && <button className="btn-text quiet" onClick={close}>닫기</button>}
      </div>
    </aside>
  )
}
