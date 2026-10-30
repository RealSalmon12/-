// 기기·브라우저 구분 (설치 안내와 알림에 씀)

// 아이패드는 iPadOS 13부터 맥처럼 보이므로 터치 지원으로 구분
export const isIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)

export const isMac = () => /Macintosh/.test(navigator.userAgent) && !isIos()

// 맥 사파리 (크롬·엣지·파이어폭스 제외)
export const isMacSafari = () =>
  isMac() && /Safari\//.test(navigator.userAgent) && !/Chrome|Chromium|CriOS|Edg|Firefox|FxiOS/.test(navigator.userAgent)

// 아이폰에서 사파리가 아닌 브라우저 (크롬·엣지·파이어폭스·네이버 앱 등)
export const isIosOtherBrowser = () => isIos() && /CriOS|EdgiOS|FxiOS|NAVER|KAKAOTALK/.test(navigator.userAgent)

// 홈 화면·Dock 에 추가한 앱으로 열었는지
export const standalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
