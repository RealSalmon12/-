import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { SessionProvider } from './session.jsx'
import App from './App.jsx'
import 'pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css'
import './styles.css'
import { applyTheme, getTheme } from './theme.js'

applyTheme(getTheme())

// 새 버전이 배포되면 바로 받아서 페이지를 새로 고침 (예전 화면이 남아 있지 않게)
registerSW({ immediate: true })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <App />
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>
)
