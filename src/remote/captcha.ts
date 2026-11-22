/**
 * 익명 로그인 CAPTCHA (Cloudflare Turnstile). 공개 사이트 키(VITE_TURNSTILE_SITE_KEY)가 있을 때만 켜진다.
 * 시크릿 키는 Supabase 대시보드에만 둔다(이 저장소·번들 어디에도 없음). 키가 없으면 CAPTCHA를 요구하지 않는다
 * (서버가 CAPTCHA를 켜 두었다면 참여가 막히므로, 운영 서버와 사이트 키는 항상 같이 켠다: docs/SUPABASE.md).
 */
export const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim() ?? ''
export const captchaEnabled = Boolean(TURNSTILE_SITE_KEY)

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

interface TurnstileApi {
  render: (el: HTMLElement, o: { sitekey: string; callback: (t: string) => void; 'error-callback'?: () => void; 'expired-callback'?: () => void; theme?: 'auto' | 'light' | 'dark' }) => string
  remove: (id: string) => void
  reset: (id: string) => void
}
declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let loading: Promise<TurnstileApi> | null = null

/** Turnstile 스크립트를 필요할 때만 불러온다 */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no_window'))
  if (window.turnstile) return Promise.resolve(window.turnstile)
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = SCRIPT_SRC
    s.async = true
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile_missing')))
    s.onerror = () => {
      loading = null
      reject(new Error('turnstile_load_failed'))
    }
    document.head.appendChild(s)
  })
  return loading
}
