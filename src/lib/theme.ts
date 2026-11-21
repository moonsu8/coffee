import { THEME_IDS, type ThemeId } from '../types'
import { themeCss, themeOf } from '../logic/themes'

/** 마지막으로 본 그룹의 테마. 기기별 화면 상태라 데이터와 분리해 저장한다 (첫 화면이 깜빡이지 않게 React보다 먼저 적용) */
export const THEME_KEY = 'coffee-duty:theme'

const isThemeId = (v: unknown): v is ThemeId => (THEME_IDS as readonly unknown[]).includes(v)

export function readStoredTheme(): ThemeId {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return isThemeId(v) ? v : 'coffee'
  } catch {
    return 'coffee'
  }
}

/** 커피 외 테마의 CSS 변수 블록을 한 번 주입한다 (커피는 index.css가 기본값) */
export function installThemeStyles() {
  if (document.getElementById('theme-css')) return
  const el = document.createElement('style')
  el.id = 'theme-css'
  el.textContent = themeCss()
  document.head.appendChild(el)
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

let fadeTimer: number | undefined

/**
 * 앱 최상위(html)의 data-theme을 바꾸고 meta theme-color도 맞춘다.
 * animate이면 300ms 동안 색 전환을 켠다(prefers-reduced-motion이면 즉시).
 */
export function applyTheme(id: ThemeId, animate = true) {
  const root = document.documentElement
  if (root.dataset.theme === id) return
  if (animate && !reduced()) {
    root.classList.add('theme-fade')
    window.clearTimeout(fadeTimer)
    fadeTimer = window.setTimeout(() => root.classList.remove('theme-fade'), 380)
  }
  root.dataset.theme = id
  const t = themeOf(id)
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    const dark = (m.getAttribute('media') ?? '').includes('dark')
    m.setAttribute('content', (dark ? t.dark : t.light).bg)
  })
  try {
    localStorage.setItem(THEME_KEY, id)
  } catch {
    /* 저장 실패는 무시 */
  }
}
