import type { DateStr } from '../types'

/**
 * 이 기기에서만 집계하는 사용 지표. 외부로 전송하지 않는다.
 * 앱 데이터(coffee-duty:v1)와 키를 분리해, 내보내기/가져오기/초기화에 섞이지 않는다.
 */
export interface Metrics {
  copyCount: number // 주문표 복사 횟수
  editCount: number // 당일 변경 횟수 (오늘만 바꾼 저장)
  usedDates: DateStr[] // 주문표를 쓴 날짜 (복사 또는 당일 변경이 있었던 날)
}

const KEY = 'coffee-duty:metrics'
const MAX_DATES = 400
export const EMPTY_METRICS: Metrics = { copyCount: 0, editCount: 0, usedDates: [] }

export type MetricEvent = 'copy' | 'edit'

export function applyMetric(m: Metrics, event: MetricEvent, date: DateStr): Metrics {
  return {
    copyCount: m.copyCount + (event === 'copy' ? 1 : 0),
    editCount: m.editCount + (event === 'edit' ? 1 : 0),
    usedDates: m.usedDates.includes(date) ? m.usedDates : [...m.usedDates, date].sort().slice(-MAX_DATES),
  }
}

export function parseMetrics(raw: string | null): Metrics {
  try {
    const v = raw ? JSON.parse(raw) : null
    if (v && typeof v === 'object') {
      return {
        copyCount: Number.isFinite(v.copyCount) ? v.copyCount : 0,
        editCount: Number.isFinite(v.editCount) ? v.editCount : 0,
        usedDates: Array.isArray(v.usedDates) ? v.usedDates.filter((d: unknown) => typeof d === 'string') : [],
      }
    }
  } catch {
    /* 깨진 값은 0부터 */
  }
  return EMPTY_METRICS
}

export function readMetrics(): Metrics {
  try {
    return parseMetrics(localStorage.getItem(KEY))
  } catch {
    return EMPTY_METRICS
  }
}

export function recordMetric(event: MetricEvent, date: DateStr) {
  try {
    localStorage.setItem(KEY, JSON.stringify(applyMetric(readMetrics(), event, date)))
  } catch {
    /* 저장 불가: 지표는 없어도 앱은 동작 */
  }
}
