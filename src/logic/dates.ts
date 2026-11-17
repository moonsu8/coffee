import type { DateStr } from '../types'

const pad = (n: number) => String(n).padStart(2, '0')

export function toDateStr(d: Date): DateStr {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export function parseDate(s: DateStr): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function today(): DateStr {
  return toDateStr(new Date())
}
export function addDays(s: DateStr, n: number): DateStr {
  const d = parseDate(s)
  d.setDate(d.getDate() + n)
  return toDateStr(d)
}
/** a - b (일). DST 영향을 피하려고 UTC로 계산 */
export function diffDays(a: DateStr, b: DateStr): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86400000)
}
export function isWeekend(s: DateStr): boolean {
  const day = parseDate(s).getDay()
  return day === 0 || day === 6
}
export const WEEKDAYS_KO = ['일', '월', '화', '수', '목', '금', '토']
export function weekdayKo(s: DateStr): string {
  return WEEKDAYS_KO[parseDate(s).getDay()]
}
/** '11/17(월)' */
export function formatShort(s: DateStr): string {
  const d = parseDate(s)
  return `${d.getMonth() + 1}/${d.getDate()}(${WEEKDAYS_KO[d.getDay()]})`
}
/** '11/17' */
export function formatMD(s: DateStr): string {
  const d = parseDate(s)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
export function monthKey(s: DateStr): string {
  return s.slice(0, 7)
}
