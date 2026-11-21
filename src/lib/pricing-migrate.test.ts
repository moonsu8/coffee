import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { migrate } from './migrate'
import { migrateView } from './testing'

const base = () => ({
  members: [{ id: 'm1', name: '가', order: 1 }],
  purchases: [
    { date: '2026-11-02', memberId: 'm1' },
    { date: '2026-11-03', memberId: 'm1', memo: '메모' },
  ],
  absences: [],
  skipDays: [],
})

describe('금액 필드 마이그레이션 (v1/v2 → v3 커피 그룹)', () => {
  it('v1: 기존 구매 기록은 금액 없음 그대로, 새 필드는 기본값', () => {
    const out = migrateView(base())
    expect(out.purchases).toEqual(base().purchases)
    expect(out.purchases.every((p) => p.pricing === undefined)).toBe(true)
    expect(out.priceList).toEqual([])
    expect(out.settings).toEqual({ buyerRule: 'count', defaultPriceMode: 'none' })
  })

  it('금액 필드가 없는 v2(이전에 저장된 v2)도 정상으로 읽는다', () => {
    const v2 = { ...base(), schemaVersion: 2, orders: [], customMenus: [], updatedAt: 5 }
    const out = migrateView(v2)
    expect(out.purchases).toHaveLength(2)
    expect(out.priceList).toEqual([])
    expect(out.settings.buyerRule).toBe('count')
  })

  it('금액·가격표·설정을 검증해서 읽는다', () => {
    const out = migrateView({
      ...base(),
      schemaVersion: 2,
      purchases: [
        {
          date: '2026-11-02',
          memberId: 'm1',
          pricing: { mode: 'detail', total: 9000, lines: [{ memberId: 'm1', menu: '아메리카노', temp: 'ice', size: 'L', price: 4500 }] },
        },
        { date: '2026-11-03', memberId: 'm1', pricing: { mode: 'simple', total: 6000, participants: ['m1', 'm1', 'x'] } },
      ],
      priceList: [
        { menu: '아메리카노', temp: 'ice', size: '', price: 4500, updatedAt: 3 },
        { menu: '아메리카노', temp: 'ice', size: '', price: 4800, updatedAt: 4 }, // 같은 키는 마지막 값
        { menu: '', price: 1 },
        { menu: '라떼', price: -5 },
      ],
      settings: { buyerRule: 'balance', defaultPriceMode: 'simple', balanceSince: '2026-11-01' },
    })
    expect(out.purchases[0].pricing).toMatchObject({ mode: 'detail', total: 9000 })
    expect(out.purchases[1].pricing).toEqual({ mode: 'simple', total: 6000, participants: ['m1', 'x'] })
    expect(out.priceList).toHaveLength(1)
    expect(out.priceList[0]).toMatchObject({ cafeBrandId: 'default', price: 4800 })
    expect(out.settings).toEqual({ buyerRule: 'balance', defaultPriceMode: 'simple', balanceSince: '2026-11-01' })
  })

  it('형식이 틀린 금액은 기록은 남기고 금액만 없음으로 취급', () => {
    const out = migrateView({
      ...base(),
      schemaVersion: 2,
      purchases: [
        { date: '2026-11-02', memberId: 'm1', pricing: { mode: 'detail', total: -1, lines: [] } },
        { date: '2026-11-03', memberId: 'm1', pricing: { mode: 'weird', total: 1000 } },
        { date: '2026-11-04', memberId: 'm1', pricing: 'x' },
      ],
      settings: { buyerRule: 'nope', defaultPriceMode: 'zzz', balanceSince: 'bad' },
    })
    expect(out.purchases).toHaveLength(3)
    expect(out.purchases.every((p) => p.pricing === undefined)).toBe(true)
    expect(out.settings).toEqual({ buyerRule: 'count', defaultPriceMode: 'none' })
  })

  it('다시 옮겨도 같다 (멱등)', () => {
    const once = migrate({ ...base(), schemaVersion: 2, settings: { buyerRule: 'balance', defaultPriceMode: 'detail', balanceSince: '2026-11-01' } })
    expect(migrate(JSON.parse(JSON.stringify(once)))).toEqual(once)
  })
})

describe('public/data.json', () => {
  const raw = JSON.parse(readFileSync(new URL('../../public/data.json', import.meta.url), 'utf8'))
  it('앱이 가격을 미리 제공하지 않는다 (가격표·금액 모두 비어 있음)', () => {
    expect(raw.groups[0].coffee.priceList).toEqual([])
    expect(JSON.stringify(raw)).not.toContain('"price"')
    expect(JSON.stringify(raw)).not.toContain('"pricing"')
    expect(JSON.stringify(raw)).not.toContain('"total"')
  })
  it('최신 구조로 읽힌다', () => {
    expect(migrateView(raw).settings.buyerRule).toBe('count')
  })
})
