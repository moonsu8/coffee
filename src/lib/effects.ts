import confetti from 'canvas-confetti'

import { themeOf } from '@/logic/themes'
import type { ThemeId } from '@/types'

let bean: confetti.Shape | undefined
function beanShape() {
  // 타원 + 가운데 홈 → 커피콩 모양
  bean ??= confetti.shapeFromPath({
    path: 'M12 0C19 0 24 7 24 16C24 26 18 32 12 32C6 32 0 26 0 16C0 7 5 0 12 0ZM11 4C8 10 14 14 11 20C9 24 12 28 13 28C15 22 9 18 12 12C13 9 12 6 11 4Z',
  })
  return bean
}

const textShapes = new Map<string, confetti.Shape>()
function emojiShape(text: string) {
  let s = textShapes.get(text)
  if (!s) {
    s = confetti.shapeFromText({ text, scalar: 2 })
    textShapes.set(text, s)
  }
  return s
}

/**
 * 요소 위치에서 테마별 컨페티 발사 (reduced-motion이면 아무것도 안 함).
 * 커피는 지금의 커피콩 그대로, 나머지는 테마의 색과 모양(+이모지).
 */
export function themeConfetti(themeId: ThemeId, el?: HTMLElement | null) {
  const t = themeOf(themeId).confetti
  const rect = el?.getBoundingClientRect()
  const origin = rect
    ? { x: (rect.left + rect.width / 2) / window.innerWidth, y: (rect.top + rect.height / 2) / window.innerHeight }
    : { x: 0.5, y: 0.7 }
  const shapes: confetti.Shape[] =
    t.shape === 'bean' ? [beanShape(), 'circle'] : t.text ? [emojiShape(t.text), t.shape] : [t.shape, 'circle']
  const base = {
    origin,
    colors: t.colors,
    shapes,
    scalar: 1.1,
    ticks: 140,
    zIndex: 100,
    disableForReducedMotion: true,
  }
  confetti({ ...base, particleCount: 36, spread: 70, startVelocity: 38, angle: 90 })
  confetti({ ...base, particleCount: 18, spread: 120, startVelocity: 24, angle: 90, gravity: 0.9, scalar: 0.8 })
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}
