import { useCallback, useMemo, useState, useSyncExternalStore } from 'react'

/* ───────── 환경 판별 (순수 함수 → 테스트 가능) ───────── */

export type EnvKind = 'standalone' | 'inapp' | 'ios' | 'other'
export interface Env {
  kind: EnvKind
  android: boolean
  kakao: boolean
}

// 카카오톡·네이버·인스타 등 앱 안에서 뜨는 브라우저(WebView)
const INAPP_RE = /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|FB_IAB|\bLine\/|DaumApps|Snapchat|; wv\)/i

export function detectEnv(input: { ua: string; standalone: boolean; touchPoints?: number }): Env {
  const { ua, standalone, touchPoints = 0 } = input
  const android = /Android/i.test(ua)
  const kakao = /KAKAOTALK/i.test(ua)
  if (standalone) return { kind: 'standalone', android, kakao }
  // iPadOS는 데스크탑 Safari로 위장하므로 터치 포인트로 구분
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)
  // iOS WebView는 UA에 "Safari/"가 없다 (Safari·Chrome iOS는 있음)
  const inapp = INAPP_RE.test(ua) || (ios && !/Safari\//.test(ua))
  return { kind: inapp ? 'inapp' : ios ? 'ios' : 'other', android, kakao }
}

/* ───────── "다음에 하기" 7일 숨김 ───────── */

const DISMISS_KEY = 'coffee-duty:install-dismissed'
export const DISMISS_DAYS = 7
const DAY = 86_400_000

export function isDismissed(raw: string | null, now: number): boolean {
  if (!raw) return false
  const t = Number(raw)
  // 시계가 되감겨 미래 값이 저장된 경우엔 숨기지 않는다
  return Number.isFinite(t) && t <= now && now - t < DISMISS_DAYS * DAY
}

function readDismissed(): boolean {
  try {
    return isDismissed(localStorage.getItem(DISMISS_KEY), Date.now())
  } catch {
    return false
  }
}
function writeDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {
    /* 저장 불가 시 이번 세션에서만 숨김 */
  }
}

/* ───────── beforeinstallprompt 보관 ───────── */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// React가 마운트(데이터 로딩 대기)되기 전에 이벤트가 올 수 있어 모듈 로드 시점에 잡아둔다
let deferred: BeforeInstallPromptEvent | null = null
let installed = false
let snapshot = { canPrompt: false, installed: false }
const listeners = new Set<() => void>()

function emit() {
  snapshot = { canPrompt: deferred !== null, installed }
  listeners.forEach((l) => l())
}
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // 브라우저 기본 미니 배너 대신 우리 배너를 쓴다
    deferred = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    deferred = null
    emit()
  })
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const getSnapshot = () => snapshot

function currentEnv(): Env {
  const standalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  return detectEnv({ ua: navigator.userAgent, standalone, touchPoints: navigator.maxTouchPoints })
}

export type BannerKind = 'prompt' | 'ios' | 'inapp' | null

export function useInstall() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const env = useMemo(currentEnv, [])
  const [dismissed, setDismissed] = useState(readDismissed)

  const dismiss = useCallback(() => {
    writeDismissed()
    setDismissed(true)
  }, [])

  /** Android/Chrome 설치 창 띄우기 */
  const install = useCallback(async () => {
    const ev = deferred
    if (!ev) return
    deferred = null // 이벤트는 한 번만 쓸 수 있다
    emit()
    await ev.prompt()
    const { outcome } = await ev.userChoice
    if (outcome === 'dismissed') dismiss()
  }, [dismiss])

  const standalone = env.kind === 'standalone' || snap.installed
  let banner: BannerKind = null
  if (!standalone && !dismissed) {
    if (env.kind === 'inapp') banner = 'inapp'
    else if (snap.canPrompt) banner = 'prompt'
    else if (env.kind === 'ios') banner = 'ios'
  }

  return { env, standalone, canPrompt: snap.canPrompt, banner, install, dismiss }
}
