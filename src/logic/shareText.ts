import type { DateStr } from '../types'
import { formatShort } from './dates'
import { forecastBuyers, nextBusinessDay, type BuyerContext } from './nextBuyer'

/** "☕ 11/17(월) 당번: 김철수 / 다음: 이영희, 박민수" */
export function buildShareText(date: DateStr, ctx: BuyerContext, nextCount = 2, prefix = '☕'): string {
  const name = (id: string | null) => ctx.members.find((m) => m.id === id)?.name ?? '없음'
  const target = nextBusinessDay(date, ctx.skipDays)
  const days = forecastBuyers(target, nextCount + 1, ctx)
  const [current, ...rest] = days
  const next = rest.map((d) => name(d.memberId)).join(', ')
  return `${prefix} ${formatShort(target)} 당번: ${name(current.memberId)}${next ? ` / 다음: ${next}` : ''}`
}
