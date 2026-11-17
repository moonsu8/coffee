import { describe, expect, it } from 'vitest'
import { detectEnv, isDismissed } from './install'

const UA = {
  kakaoAndroid:
    'Mozilla/5.0 (Linux; Android 13; SM-S918N Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36 KAKAOTALK 2510130',
  kakaoIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.5.0',
  naverIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 NAVER(inapp; search; 1000; 12.0.0; 15)',
  naverAndroid:
    'Mozilla/5.0 (Linux; Android 13; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 NAVER(inapp; search; 1000; 12.0.0)',
  iosSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  iosChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 13; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  samsung:
    'Mozilla/5.0 (Linux; Android 13; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
  ipadDesktop:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
}
const env = (ua: string, standalone = false, touchPoints = 0) => detectEnv({ ua, standalone, touchPoints })

describe('detectEnv', () => {
  it('설치된 앱(standalone)으로 실행 중이면 어떤 UA여도 standalone', () => {
    expect(env(UA.iosSafari, true).kind).toBe('standalone')
    expect(env(UA.kakaoAndroid, true).kind).toBe('standalone')
  })
  it('카카오톡 인앱 (Android는 외부 브라우저 링크 대상)', () => {
    expect(env(UA.kakaoAndroid)).toEqual({ kind: 'inapp', android: true, kakao: true })
    expect(env(UA.kakaoIos)).toMatchObject({ kind: 'inapp', android: false, kakao: true })
  })
  it('네이버 인앱', () => {
    expect(env(UA.naverIos).kind).toBe('inapp')
    expect(env(UA.naverAndroid)).toMatchObject({ kind: 'inapp', kakao: false })
  })
  it('iOS Safari / iOS Chrome은 일반 iOS', () => {
    expect(env(UA.iosSafari).kind).toBe('ios')
    expect(env(UA.iosChrome).kind).toBe('ios')
  })
  it('Android Chrome / 삼성 인터넷은 other (설치 창 지원 브라우저)', () => {
    expect(env(UA.androidChrome)).toMatchObject({ kind: 'other', android: true })
    expect(env(UA.samsung).kind).toBe('other')
  })
  it('iPadOS(데스크탑 UA)는 터치 포인트로 iOS 판별, 일반 Mac은 other', () => {
    expect(env(UA.ipadDesktop, false, 5).kind).toBe('ios')
    expect(env(UA.ipadDesktop, false, 0).kind).toBe('other')
  })
})

describe('isDismissed (7일)', () => {
  const now = Date.UTC(2026, 10, 20)
  const day = 86_400_000
  it('값이 없거나 깨졌으면 숨기지 않음', () => {
    expect(isDismissed(null, now)).toBe(false)
    expect(isDismissed('abc', now)).toBe(false)
  })
  it('7일 이내면 숨김, 7일이 지나면 다시 표시', () => {
    expect(isDismissed(String(now - 6 * day), now)).toBe(true)
    expect(isDismissed(String(now - 7 * day), now)).toBe(false)
    expect(isDismissed(String(now - 30 * day), now)).toBe(false)
  })
  it('미래 시각(시계 오류)이 저장돼 있어도 영구히 숨기지 않음', () => {
    expect(isDismissed(String(now + 3 * day), now)).toBe(false)
  })
})
