import { useEffect, useRef } from 'react'
import { captchaEnabled, loadTurnstile, TURNSTILE_SITE_KEY } from '@/remote/captcha'

/**
 * Turnstile 위젯. 사이트 키가 없는 빌드에서는 아무것도 그리지 않는다.
 * 토큰은 한 번만 쓸 수 있어서, 참여에 실패하면 `resetKey`를 바꿔 새로 받는다.
 */
export function CaptchaBox({ onToken, resetKey }: { onToken: (token: string | null) => void; resetKey: number }) {
  const host = useRef<HTMLDivElement>(null)
  const cb = useRef(onToken)
  cb.current = onToken

  useEffect(() => {
    if (!captchaEnabled || !host.current) return
    let id: string | null = null
    let cancelled = false
    cb.current(null)
    void loadTurnstile()
      .then((t) => {
        if (cancelled || !host.current) return
        id = t.render(host.current, {
          sitekey: TURNSTILE_SITE_KEY,
          callback: (token) => cb.current(token),
          'expired-callback': () => cb.current(null),
          'error-callback': () => cb.current(null),
        })
      })
      .catch(() => cb.current(null))
    return () => {
      cancelled = true
      if (id && window.turnstile) window.turnstile.remove(id)
    }
  }, [resetKey])

  if (!captchaEnabled) return null
  return <div ref={host} aria-label="사람 확인" className="flex min-h-[65px] justify-center" />
}
