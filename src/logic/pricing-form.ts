import type { Order, PriceEntry, PriceMode, Pricing, Settings } from '../types'
import { defaultModeFor, lookupPrice, type PriceInput } from './fairness'
import { normalizeTemp } from './menu'

/** 금액 입력 폼의 순수 로직 (컴포넌트와 분리해 테스트 가능) */

export interface LineBase {
  memberId: string
  order: Order
}

export interface PricingForm {
  mode: PriceMode
  prices: Record<string, string> // memberId → 숫자 문자열 (상세)
  total: string // 영수증 총액 숫자 문자열
  totalTouched: boolean // false면 총액은 자동 합계를 따라간다
  participants: string[] // 간단: 마신 사람
  saveToList: boolean // "가격표에도 저장"
}

export function initPricingForm(args: {
  settings: Pick<Settings, 'buyerRule' | 'defaultPriceMode'>
  lines: LineBase[]
  participantsDefault: string[]
  priceList: PriceEntry[]
  existing?: Pricing
  startMode?: PriceMode
}): PricingForm {
  const { settings, lines, participantsDefault, priceList, existing, startMode } = args
  const fromExisting = new Map((existing?.lines ?? []).map((l) => [l.memberId, l.price]))
  const prices: Record<string, string> = {}
  for (const l of lines) {
    // 이미 저장된 가격이 있으면 그대로, 없으면 가격표에서 자동 채움, 가격표에도 없으면 빈칸
    const saved = fromExisting.get(l.memberId)
    const listed = lookupPrice(priceList, l.order)
    const v = saved ?? listed
    prices[l.memberId] = v === undefined ? '' : String(v)
  }
  if (existing) {
    return {
      mode: existing.mode,
      prices,
      total: String(existing.total),
      totalTouched: true,
      participants: existing.participants ? [...existing.participants] : participantsDefault,
      saveToList: true,
    }
  }
  return {
    mode: startMode ?? defaultModeFor(settings, lines.length > 0),
    prices,
    total: '',
    totalTouched: false,
    participants: participantsDefault,
    saveToList: true, // 가격을 입력하거나 고치면 가격표에도 저장 (기본 체크)
  }
}

export interface PricingBuild {
  pricing?: Pricing
  sum: number // 메뉴 가격 자동 합계
  total: number // 영수증 총액 (직접 안 고치면 합계)
  missing: number // 가격이 빈 줄 수 (상세)
  ok: boolean // 저장 가능한지
}

const num = (s: string | undefined) => (s ? Number(s) : 0)

export function buildPricing(form: PricingForm, lines: LineBase[]): PricingBuild {
  if (form.mode === 'none') return { sum: 0, total: 0, missing: 0, ok: true }

  if (form.mode === 'simple') {
    const total = num(form.total)
    const ok = total > 0 && form.participants.length > 0
    return {
      sum: 0,
      total,
      missing: 0,
      ok,
      pricing: ok ? { mode: 'simple', total, participants: [...form.participants] } : undefined,
    }
  }

  const sum = lines.reduce((a, l) => a + num(form.prices[l.memberId]), 0)
  const missing = lines.filter((l) => !form.prices[l.memberId]).length
  const total = form.totalTouched && form.total !== '' ? num(form.total) : sum
  const ok = lines.length > 0 && missing === 0 && total > 0
  return {
    sum,
    total,
    missing,
    ok,
    pricing: ok
      ? {
          mode: 'detail',
          total,
          lines: lines.map((l) => ({
            memberId: l.memberId,
            menu: l.order.menu,
            temp: normalizeTemp(l.order.menu, l.order.temp),
            ...(l.order.size ? { size: l.order.size } : {}),
            price: num(form.prices[l.memberId]),
          })),
        }
      : undefined,
  }
}

/** 입력된 줄의 (메뉴, 온도, 사이즈, 가격) — 가격표 저장 후보 */
export function priceInputsOf(form: PricingForm, lines: LineBase[]): PriceInput[] {
  if (form.mode !== 'detail') return []
  return lines
    .filter((l) => form.prices[l.memberId])
    .map((l) => ({ menu: l.order.menu, temp: l.order.temp, size: l.order.size, price: num(form.prices[l.memberId]) }))
}
