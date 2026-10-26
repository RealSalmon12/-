import { useEffect, useState } from 'react'

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

const standalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

// 홈 화면에 앱으로 추가하라는 안내 (이미 앱으로 열었으면 안 보임)
export default function InstallHint() {
  const [, rerender] = useState(0)
  const [hidden, setHidden] = useState(read)

  useEffect(() => {
    const fn = () => rerender((n) => n + 1)
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])

  if (hidden || standalone()) return null
  if (!deferred && !isIos()) return null

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
        <b>휴대폰에 앱으로 설치하기</b>
        <p className="fine">
          {deferred
            ? '홈 화면에 아이콘이 생기고 앱처럼 열려요.'
            : '아래쪽 공유 버튼을 누르고 "홈 화면에 추가"를 고르면 앱처럼 쓸 수 있어요.'}
        </p>
      </div>
      <div className="actions">
        {deferred && <button className="btn-chalk small" onClick={install}>설치</button>}
        <button className="btn-text quiet" onClick={close}>닫기</button>
      </div>
    </aside>
  )
}
