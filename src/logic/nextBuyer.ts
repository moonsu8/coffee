import type { Absence, DateStr, Member, Purchase } from '../types'
import { addDays, isWeekend } from './dates'

export interface BuyerContext {
  members: Member[]
  purchases: Purchase[]
  absences: Absence[]
  skipDays: DateStr[]
}

export interface RankedMember {
  member: Member
  lastPurchase: DateStr | null // 대상 날짜 이전의 마지막 구매일
  absent: boolean
}

export interface ForecastDay {
  date: DateStr
  memberId: string | null // 모두 휴가면 null
  actual: boolean // 이미 구매 기록이 있는 날
}

/** 주말·skipDays가 아닌 날 */
export function isBusinessDay(date: DateStr, skipDays: DateStr[]): boolean {
  return !isWeekend(date) && !skipDays.includes(date)
}

export function isAbsent(memberId: string, date: DateStr, absences: Absence[]): boolean {
  return absences.some((a) => a.memberId === memberId && a.from <= date && date <= a.to)
}

/** date '이전'(당일 제외)의 마지막 구매일. 없으면 null */
export function lastPurchaseDate(memberId: string, purchases: Purchase[], date: DateStr): DateStr | null {
  let last: DateStr | null = null
  for (const p of purchases) {
    if (p.memberId === memberId && p.date < date && (last === null || p.date > last)) last = p.date
  }
  return last
}

/**
 * date 기준 우선순위 목록 (휴가자 포함).
 * 한 번도 안 산 사람 → 마지막 구매일이 오래된 순 → 같으면 order.
 * 휴가자는 제 위치에 남고 absent 플래그만 붙는다 (UI에서 흐리게 표시).
 */
export function rankMembers(date: DateStr, ctx: BuyerContext): RankedMember[] {
  const ranked = ctx.members.map((member) => ({
    member,
    lastPurchase: lastPurchaseDate(member.id, ctx.purchases, date),
    absent: isAbsent(member.id, date, ctx.absences),
  }))
  ranked.sort((a, b) => {
    if (a.lastPurchase !== b.lastPurchase) {
      if (a.lastPurchase === null) return -1
      if (b.lastPurchase === null) return 1
      return a.lastPurchase < b.lastPurchase ? -1 : 1
    }
    return a.member.order - b.member.order
  })
  return ranked
}

/** 특정 날짜의 당번. 영업일이 아니거나 후보가 없으면 null (기록 유무와 무관한 '계산값') */
export function getNextBuyer(date: DateStr, ctx: BuyerContext): Member | null {
  if (!isBusinessDay(date, ctx.skipDays)) return null
  return rankMembers(date, ctx).find((r) => !r.absent)?.member ?? null
}

/** date 이후(포함) 첫 영업일 */
export function nextBusinessDay(date: DateStr, skipDays: DateStr[]): DateStr {
  let d = date
  for (let i = 0; i < 400 && !isBusinessDay(d, skipDays); i++) d = addDays(d, 1)
  return d
}

/**
 * from부터 앞으로 count영업일의 예상 당번.
 * 기록이 있는 날은 실제 구매자를 쓰고, 없는 날은 계산 결과가 '샀다'고 가정해 다음 날 계산에 반영한다.
 */
export function forecastBuyers(from: DateStr, count: number, ctx: BuyerContext): ForecastDay[] {
  const result: ForecastDay[] = []
  const simulated = [...ctx.purchases]
  let date = nextBusinessDay(from, ctx.skipDays)
  while (result.length < count) {
    const recorded = ctx.purchases.find((p) => p.date === date)
    if (recorded) {
      result.push({ date, memberId: recorded.memberId, actual: true })
    } else {
      const buyer = getNextBuyer(date, { ...ctx, purchases: simulated })
      result.push({ date, memberId: buyer?.id ?? null, actual: false })
      if (buyer) simulated.push({ date, memberId: buyer.id })
    }
    date = nextBusinessDay(addDays(date, 1), ctx.skipDays)
  }
  return result
}

/** 1인당 구매 횟수 (month: 'YYYY-MM' 지정 시 해당 월만) */
export function countPurchases(members: Member[], purchases: Purchase[], month?: string): Map<string, number> {
  const map = new Map(members.map((m) => [m.id, 0]))
  for (const p of purchases) {
    if (month && !p.date.startsWith(month)) continue
    if (map.has(p.memberId)) map.set(p.memberId, (map.get(p.memberId) ?? 0) + 1)
  }
  return map
}
