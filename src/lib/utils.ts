import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function uid(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID().slice(0, 8)
  } catch {
    /* 비보안 컨텍스트 */
  }
  return Math.random().toString(36).slice(2, 10)
}

export function haptic(ms: number | number[] = 20) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* 미지원 */
  }
}
