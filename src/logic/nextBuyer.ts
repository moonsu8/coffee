import type { Absence, BuyerRule, DateStr, Member, Purchase } from '../types'
import { addDays, isWeekend } from './dates'
import { balanceWindow, balancesOf, computeFairness, isValidPricing } from './fairness'

export interface BuyerContext {
  members: Member[]
  purchases: Purchase[]
  absences: Absence[]
  skipDays: DateStr[]
  /** 없으면 횟수 기준(기존 동작). 'balance'면 차액이 가장 작은 사람이 먼저 */
  settings?: { buyerRule: BuyerRule; balanceSince?: DateStr }
  /** 예상 순번 시뮬레이션용: 가상으로 산 사람을 뒤로 보내는 보정값 (직접 넘기지 않는다) */
  balanceBias?: ReadonlyMap<string, number>
}

/**
 * 차액 기준일 때 date의 순번에 쓰는 차액. date '이전'(당일 제외)이고 balanceSince 이후인 기록만 쓴다.
 * 통계 탭의 기간 토글과는 무관하다.
 */
export function effectiveBalances(date: DateStr, ctx: BuyerContext): Map<string, number> {
  const base = balancesOf(computeFairness(ctx.members, ctx.purchases, balanceWindow(ctx.settings, date)))
  for (const [id, b] of ctx.balanceBias ?? []) base.set(id, (base.get(id) ?? 0) + b)
  return base
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
  const balances = ctx.settings?.buyerRule === 'balance' ? effectiveBalances(date, ctx) : null
  ranked.sort((a, b) => {
    if (balances) {
      // 차액이 작은(덜 낸) 사람이 먼저. 같으면 아래의 횟수 기준 규칙으로
      const diff = (balances.get(a.member.id) ?? 0) - (balances.get(b.member.id) ?? 0)
      if (diff !== 0) return diff
    }
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
  const balanceMode = ctx.settings?.buyerRule === 'balance'
  const bias = new Map<string, number>(ctx.balanceBias ?? [])
  const run = (): BuyerContext => ({ ...ctx, purchases: simulated, balanceBias: bias })
  // 차액 기준의 예상: 가상 구매에는 금액이 없어 차액이 변하지 않으므로,
  // 산 것으로 가정한 사람을 가장 뒤로 보내 한 바퀴 도는 순서(추정)를 만든다
  const pushBack = (day: DateStr, id: string) => {
    const eff = effectiveBalances(day, run())
    const max = Math.max(0, ...ctx.members.map((m) => eff.get(m.id) ?? 0))
    bias.set(id, (bias.get(id) ?? 0) + (max - (eff.get(id) ?? 0)) + 1)
  }
  let date = nextBusinessDay(from, ctx.skipDays)
  while (result.length < count) {
    const recorded = ctx.purchases.find((p) => p.date === date)
    if (recorded) {
      result.push({ date, memberId: recorded.memberId, actual: true })
      // 금액이 기록된 날은 실제 차액에 이미 반영된다. 금액이 없을 때만 뒤로 보낸다
      if (balanceMode && !isValidPricing(recorded.pricing)) pushBack(date, recorded.memberId)
    } else {
      const buyer = getNextBuyer(date, run())
      result.push({ date, memberId: buyer?.id ?? null, actual: false })
      if (buyer) {
        simulated.push({ date, memberId: buyer.id })
        if (balanceMode) pushBack(date, buyer.id)
      }
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
