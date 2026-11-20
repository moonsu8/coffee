import {
  DEFAULT_BRAND,
  type BuyerRule,
  type DateStr,
  type Member,
  type Order,
  type PriceEntry,
  type PriceMode,
  type Pricing,
  type Purchase,
  type Settings,
} from '../types'
import { addDays } from './dates'
import { normalizeTemp } from './menu'

/* ───────── 금액 배분 ───────── */

/**
 * 총액을 가중치 비율로 나눈다. 각자 원 단위로 반올림하고, 합이 총액과 어긋나는 끝전(remainder)은
 * 호출한 쪽이 결제한 사람(당번)에게 붙인다. 가중치 합이 0이면 균등 배분.
 */
export function allocate(total: number, weights: number[]): { shares: number[]; remainder: number } {
  if (weights.length === 0) return { shares: [], remainder: total }
  let w = weights
  let sum = w.reduce((a, b) => a + b, 0)
  if (sum <= 0) {
    w = weights.map(() => 1)
    sum = w.length
  }
  const shares = w.map((x) => Math.round((total * x) / sum))
  return { shares, remainder: total - shares.reduce((a, b) => a + b, 0) }
}

const isMoney = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0

/** 계산에 쓸 수 있는 완전한 금액 기록인지 */
export function isValidPricing(p: Pricing | undefined): p is Pricing {
  if (!p || !isMoney(p.total) || p.total <= 0) return false
  if (p.mode === 'detail') return !!p.lines && p.lines.length > 0 && p.lines.every((l) => isMoney(l.price))
  if (p.mode === 'simple') return !!p.participants && p.participants.length > 0
  return false
}

/* ───────── 멤버별 낸 돈 / 마신 돈 / 차액 ───────── */

export interface FairnessRow {
  memberId: string | null // null = 탈퇴한 멤버들의 합산
  paid: number
  consumed: number
  balance: number // 낸 돈 − 마신 돈 (+면 더 낸 것)
}
export interface FairnessResult {
  rows: FairnessRow[] // 현재 멤버(멤버 순서) + 필요하면 탈퇴 합산 행
  counted: number // 계산에 쓴 기록 수
  excluded: number // 금액 없음/불완전해서 빠진 기록 수
}

/**
 * 구매 기록들로 멤버별 수지를 계산한다.
 * - 상세: 영수증 총액을 메뉴 가격 비율로 배분(할인·추가요금 모두 반영)
 * - 간단: 총액을 마신 사람에게 균등 배분
 * - 끝전은 결제한 사람(기록의 memberId)의 '마신 돈'에 더해진다 → 모든 행의 차액 합은 항상 0
 * - 금액 없음/불완전 기록은 제외하고 건수만 센다
 * - 안 마심·휴가자는 기록 시점에 이미 줄/참가자에 없으므로 0원. 저장된 참가자는 이후 바뀌지 않는다
 */
export function computeFairness(
  members: Member[],
  purchases: Purchase[],
  include: (date: DateStr) => boolean = () => true,
): FairnessResult {
  const ids = new Set(members.map((m) => m.id))
  const slot = (id: string): string | null => (ids.has(id) ? id : null)
  const paid = new Map<string | null, number>()
  const consumed = new Map<string | null, number>()
  const add = (m: Map<string | null, number>, k: string | null, v: number) => m.set(k, (m.get(k) ?? 0) + v)
  let counted = 0
  let excluded = 0

  for (const p of purchases) {
    if (!include(p.date)) continue
    const pr = p.pricing
    if (!isValidPricing(pr)) {
      excluded++
      continue
    }
    counted++
    const people: string[] = []
    const weights: number[] = []
    if (pr.mode === 'detail') {
      for (const l of pr.lines!) {
        const i = people.indexOf(l.memberId)
        if (i >= 0) weights[i] += l.price
        else {
          people.push(l.memberId)
          weights.push(l.price)
        }
      }
    } else {
      for (const id of new Set(pr.participants!)) {
        people.push(id)
        weights.push(1)
      }
    }
    const { shares, remainder } = allocate(pr.total, weights)
    shares.forEach((s, i) => add(consumed, slot(people[i]), s))
    add(consumed, slot(p.memberId), remainder) // 끝전은 당번(결제자)에게
    add(paid, slot(p.memberId), pr.total)
  }

  const row = (memberId: string | null): FairnessRow => {
    const pd = paid.get(memberId) ?? 0
    const cs = consumed.get(memberId) ?? 0
    return { memberId, paid: pd, consumed: cs, balance: pd - cs }
  }
  const rows = [...members].sort((a, b) => a.order - b.order).map((m) => row(m.id))
  const gone = row(null)
  if (gone.paid || gone.consumed) rows.push(gone)
  return { rows, counted, excluded }
}

export function balancesOf(r: FairnessResult): Map<string, number> {
  const m = new Map<string, number>()
  for (const x of r.rows) if (x.memberId) m.set(x.memberId, x.balance)
  return m
}

/** 당번 계산용 기간: balanceSince(포함) 이후, before(제외) 이전. 통계 탭의 기간 토글과는 별개 */
export function balanceWindow(settings: Pick<Settings, 'balanceSince'> | undefined, before?: DateStr) {
  const since = settings?.balanceSince ?? ''
  return (date: DateStr) => date >= since && (before === undefined || date < before)
}

/** balanceSince 이후 금액이 없는(또는 불완전한) 기록 수 — 당번 순서에 반영되지 않는 기록 */
export function countUnpriced(purchases: Purchase[], include: (d: DateStr) => boolean): number {
  return purchases.filter((p) => include(p.date) && !isValidPricing(p.pricing)).length
}

/**
 * "정산 완료, 오늘부터 다시 계산"의 새 시작일.
 * 오늘 이미 기록된 구매는 정산에 포함된 것으로 보므로 다음 날부터, 아직 없으면 오늘부터 센다.
 */
export function nextSettlementDate(today: DateStr, purchases: Purchase[]): DateStr {
  return purchases.some((p) => p.date === today) ? addDays(today, 1) : today
}

/* ───────── 가격표 ───────── */

export type PriceKey = Pick<Order, 'menu' | 'temp'> & { size?: string }
export const priceKey = (e: { cafeBrandId?: string; menu: string; temp: PriceEntry['temp']; size?: string }) =>
  [e.cafeBrandId ?? DEFAULT_BRAND, e.menu, normalizeTemp(e.menu, e.temp), e.size ?? ''].join('|')

/** 가격표에 있으면 가격, 없으면 undefined (빈칸으로 둠) */
export function lookupPrice(list: PriceEntry[], k: PriceKey, brand = DEFAULT_BRAND): number | undefined {
  const key = priceKey({ cafeBrandId: brand, ...k })
  return list.find((e) => priceKey(e) === key)?.price
}

export interface PriceInput {
  menu: string
  temp: PriceEntry['temp']
  size?: string
  price: number
}

/** 가격표에 새로 넣거나 고쳐야 하는 항목만 (같은 값은 제외) */
export function diffPrices(list: PriceEntry[], lines: PriceInput[]): PriceInput[] {
  const out = new Map<string, PriceInput>()
  for (const l of lines) {
    if (lookupPrice(list, l) !== l.price) out.set(priceKey(l), l)
  }
  return [...out.values()]
}

export function upsertPrices(list: PriceEntry[], inputs: PriceInput[], now: number, brand = DEFAULT_BRAND): PriceEntry[] {
  const map = new Map(list.map((e) => [priceKey(e), e]))
  for (const i of inputs) {
    const entry: PriceEntry = {
      cafeBrandId: brand,
      menu: i.menu,
      temp: normalizeTemp(i.menu, i.temp),
      size: i.size ?? '',
      price: i.price,
      updatedAt: now,
    }
    map.set(priceKey(entry), entry)
  }
  return [...map.values()]
}

/* ───────── 금액 입력 모드 규칙 ───────── */

/** 차액 기준에서는 금액이 없으면 계산에서 빠지므로 '금액 없음'을 고를 수 없다 */
export function allowedModes(rule: BuyerRule): PriceMode[] {
  return rule === 'balance' ? ['detail', 'simple'] : ['detail', 'simple', 'none']
}

/** [샀어요]를 눌렀을 때 금액 시트를 열어야 하는지. 아니면 예전처럼 한 번 탭으로 기록 */
export function needsPriceSheet(s: Pick<Settings, 'buyerRule' | 'defaultPriceMode'>): boolean {
  return s.buyerRule === 'balance' || s.defaultPriceMode !== 'none'
}

/** 시트가 처음 보여줄 모드 (규칙과 주문 유무를 반영) */
export function defaultModeFor(s: Pick<Settings, 'buyerRule' | 'defaultPriceMode'>, hasLines: boolean): PriceMode {
  let m = s.defaultPriceMode
  if (!allowedModes(s.buyerRule).includes(m)) m = 'detail'
  if (m === 'detail' && !hasLines) m = 'simple'
  return m
}

/** 지난 기록의 금액을 지우면 차액 기준 당번 순서가 바뀔 수 있는지(경고 대상) */
export function warnsOnClear(args: {
  rule: BuyerRule
  since?: DateStr
  date: DateStr
  before?: Pricing
  after?: Pricing
}): boolean {
  return args.rule === 'balance' && isValidPricing(args.before) && !isValidPricing(args.after) && args.date >= (args.since ?? '')
}
