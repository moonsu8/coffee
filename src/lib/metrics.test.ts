import { describe, expect, it } from 'vitest'
import { applyMetric, EMPTY_METRICS, parseMetrics } from './metrics'

describe('metrics', () => {
  it('복사·변경 횟수와 사용한 날짜를 센다 (같은 날은 한 번만)', () => {
    let m = applyMetric(EMPTY_METRICS, 'copy', '2026-11-20')
    m = applyMetric(m, 'edit', '2026-11-20')
    m = applyMetric(m, 'copy', '2026-11-20')
    m = applyMetric(m, 'copy', '2026-11-19')
    expect(m).toEqual({ copyCount: 3, editCount: 1, usedDates: ['2026-11-19', '2026-11-20'] })
  })
  it('깨진 저장값은 0부터', () => {
    expect(parseMetrics('not json')).toEqual(EMPTY_METRICS)
    expect(parseMetrics(null)).toEqual(EMPTY_METRICS)
    expect(parseMetrics('{"copyCount":"x"}')).toEqual(EMPTY_METRICS)
  })
})
