import type { DateStr, Schedule } from '../types'
import { parseDate, WEEKDAYS_KO } from './dates'

/** 요일 번호(0=일 … 6=토)를 순서대로 */
export const WEEKDAY_NUMS = [1, 2, 3, 4, 5, 6, 0] // 월~일 순으로 보여줄 때

export function scheduleDays(schedule: Schedule = 'weekdays'): number[] {
  if (schedule === 'weekdays') return [1, 2, 3, 4, 5]
  if (schedule === 'daily') return [0, 1, 2, 3, 4, 5, 6]
  return schedule
}

/** date가 담당하는 요일인가 (쉬는 날 skipDays는 따로 본다) */
export function isScheduledDay(date: DateStr, schedule: Schedule = 'weekdays'): boolean {
  if (schedule === 'daily') return true
  const day = parseDate(date).getDay()
  if (schedule === 'weekdays') return day >= 1 && day <= 5
  return schedule.includes(day)
}

/** 저장값 검증: 알 수 없는 값·빈 배열은 평일로 */
export function normalizeSchedule(v: unknown): Schedule {
  if (v === 'daily') return 'daily'
  if (Array.isArray(v)) {
    const days = [...new Set(v.filter((x): x is number => Number.isInteger(x) && x >= 0 && x <= 6))].sort((a, b) => a - b)
    if (days.length > 0) return days
  }
  return 'weekdays'
}

/** 화면용 표기: 평일 / 매일 / 수·토 */
export function scheduleLabel(schedule: Schedule = 'weekdays'): string {
  if (schedule === 'weekdays') return '평일'
  if (schedule === 'daily') return '매일'
  const days = normalizeSchedule(schedule)
  if (days === 'weekdays') return '평일'
  const nums = days as number[]
  if (nums.length === 7) return '매일'
  if (nums.join() === '1,2,3,4,5') return '평일'
  return [...nums].sort((a, b) => (a || 7) - (b || 7)).map((d) => WEEKDAYS_KO[d]).join('·')
}
