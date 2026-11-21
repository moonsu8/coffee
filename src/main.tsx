import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './index.css'
import { applyTheme, installThemeStyles, readStoredTheme } from './lib/theme'

registerSW({ immediate: true })

// 마지막으로 본 그룹의 테마를 첫 화면부터 적용 (데이터를 읽기 전에 깜빡이지 않도록)
installThemeStyles()
applyTheme(readStoredTheme(), false)

const root = createRoot(document.getElementById('root')!)

// 개발 서버에서만: /design (또는 #/design) 은 모든 테마를 나란히 보여주는 확인용 페이지. 배포본에는 들어가지 않는다.
if (import.meta.env.DEV && (location.pathname.endsWith('/design') || location.hash === '#/design')) {
  import('./design/design-page').then(({ DesignPage }) => root.render(<DesignPage />))
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
