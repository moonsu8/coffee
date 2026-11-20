import { describe, expect, it } from 'vitest'
import { digitsOnly, groupDigits } from '../lib/format'
import { diffPrices, upsertPrices } from './fairness'
import { buildPricing, initPricingForm, priceInputsOf, type LineBase } from './pricing-form'

const priceList = upsertPrices([], [{ menu: '아메리카노', temp: 'ice', price: 4500 }], 1)
const lines: LineBase[] = [
  { memberId: 'a', order: { menu: '아메리카노', temp: 'ice' } },
  { memberId: 'b', order: { menu: '카페라떼', temp: 'hot' } }, // 가격표에 없음
]
const settings = { buyerRule: 'count' as const, defaultPriceMode: 'detail' as const }
const init = (over = {}) => initPricingForm({ settings, lines, participantsDefault: ['a', 'b'], priceList, ...over })

describe('가격표 자동 채움 (주문 시)', () => {
  it('가격표에 있으면 채우고, 없으면 빈칸', () => {
    expect(init().prices).toEqual({ a: '4500', b: '' })
  })
  it('가격이 빈 줄이 있으면 저장할 수 없다', () => {
    const b = buildPricing(init(), lines)
    expect(b).toMatchObject({ missing: 1, ok: false, sum: 4500 })
  })
  it('빈칸을 채우면 합계가 총액이 되고 저장 가능', () => {
    const f = init()
    f.prices.b = '5000'
    const b = buildPricing(f, lines)
    expect(b.ok).toBe(true)
    expect(b.total).toBe(9500)
    expect(b.pricing).toMatchObject({ mode: 'detail', total: 9500 })
    expect(b.pricing!.lines!.map((l) => l.price)).toEqual([4500, 5000])
  })
  it('영수증 총액을 직접 고치면(할인) 그 값이 총액, 메뉴 가격은 그대로 남는다', () => {
    const f = init()
    f.prices.b = '5000'
    f.total = '9000'
    f.totalTouched = true
    const b = buildPricing(f, lines)
    expect(b.total).toBe(9000)
    expect(b.sum).toBe(9500)
    expect(b.pricing!.lines!.map((l) => l.price)).toEqual([4500, 5000])
  })
  it('총액을 지우면 다시 자동 합계를 따른다', () => {
    const f = init()
    f.prices.b = '5000'
    f.total = ''
    f.totalTouched = true
    expect(buildPricing(f, lines).total).toBe(9500)
  })
})

describe('가격표에도 저장', () => {
  it('새로 입력하거나 고친 줄만 저장 후보', () => {
    const f = init()
    f.prices.a = '4700' // 고침
    f.prices.b = '5000' // 새로 입력
    expect(diffPrices(priceList, priceInputsOf(f, lines)).map((x) => [x.menu, x.price])).toEqual([
      ['아메리카노', 4700],
      ['카페라떼', 5000],
    ])
  })
  it('가격표와 같은 값은 후보가 아니다', () => {
    const f = init()
    f.prices.b = ''
    expect(diffPrices(priceList, priceInputsOf(f, lines))).toEqual([])
  })
  it('기본값은 저장 체크', () => {
    expect(init().saveToList).toBe(true)
  })
})

describe('간단·없음 모드와 기본 모드', () => {
  it('간단: 총액과 마신 사람이 있어야 저장 가능', () => {
    const f = init({ startMode: 'simple' })
    expect(buildPricing(f, lines).ok).toBe(false)
    f.total = '12000'
    expect(buildPricing(f, lines)).toMatchObject({ ok: true, pricing: { mode: 'simple', total: 12000, participants: ['a', 'b'] } })
    f.participants = []
    expect(buildPricing(f, lines).ok).toBe(false)
  })
  it('금액 없음은 pricing 없이 저장 가능', () => {
    const b = buildPricing(init({ startMode: 'none' }), lines)
    expect(b.ok).toBe(true)
    expect(b.pricing).toBeUndefined()
  })
  it('차액 기준이면 시작 모드가 없음이 될 수 없다', () => {
    const f = initPricingForm({ settings: { buyerRule: 'balance', defaultPriceMode: 'none' }, lines, participantsDefault: [], priceList })
    expect(f.mode).toBe('detail')
  })
  it('기존 기록을 열면 저장된 값으로 시작', () => {
    const f = init({ existing: { mode: 'detail', total: 9000, lines: [{ memberId: 'a', menu: '아메리카노', temp: 'ice', price: 4000 }, { memberId: 'b', menu: '카페라떼', temp: 'hot', price: 5000 }] } })
    expect(f).toMatchObject({ mode: 'detail', total: '9000', totalTouched: true, prices: { a: '4000', b: '5000' } })
  })
})

describe('숫자 입력', () => {
  it('숫자만 남기고 천 단위 쉼표로 보여준다', () => {
    expect(digitsOnly('1a,2 3-4')).toBe('1234')
    expect(digitsOnly('00012')).toBe('12')
    expect(groupDigits('1234567')).toBe('1,234,567')
    expect(groupDigits('')).toBe('')
  })
})
