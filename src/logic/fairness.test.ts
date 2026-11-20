import { describe, expect, it } from 'vitest'
import { signedWon, won } from '../lib/format'
import type { Member, PriceEntry, Pricing, Purchase } from '../types'
import {
  allocate,
  allowedModes,
  applySettingsPatch,
  balanceWindow,
  computeFairness,
  countUnpriced,
  defaultModeFor,
  diffPrices,
  lookupPrice,
  needsPriceSheet,
  nextSettlementDate,
  reenablePlan,
  upsertPrices,
  warnsOnClear,
} from './fairness'
import { forecastBuyers, getNextBuyer, type BuyerContext } from './nextBuyer'

const mk = (id: string, order: number): Member => ({ id, name: id.toUpperCase(), order })
const members = [mk('a', 1), mk('b', 2), mk('c', 3), mk('d', 4)]

const detail = (total: number, prices: Record<string, number>): Pricing => ({
  mode: 'detail',
  total,
  lines: Object.entries(prices).map(([memberId, price]) => ({ memberId, menu: '아메리카노', temp: 'ice' as const, price })),
})
const simple = (total: number, participants: string[]): Pricing => ({ mode: 'simple', total, participants })
const buy = (date: string, memberId: string, pricing?: Pricing): Purchase => ({ date, memberId, ...(pricing ? { pricing } : {}) })

const rowOf = (r: ReturnType<typeof computeFairness>, id: string | null) => r.rows.find((x) => x.memberId === id)!
const sumBalances = (r: ReturnType<typeof computeFairness>) => r.rows.reduce((s, x) => s + x.balance, 0)

describe('allocate', () => {
  it('할인: 총액이 메뉴 합계보다 작으면 가격 비율대로 줄어든다', () => {
    expect(allocate(9000, [4500, 4500, 4500])).toEqual({ shares: [3000, 3000, 3000], remainder: 0 })
    expect(allocate(9000, [4000, 6000])).toEqual({ shares: [3600, 5400], remainder: 0 })
  })
  it('추가요금: 총액이 더 크면 비율대로 늘어난다', () => {
    expect(allocate(15000, [4500, 4500, 4500]).shares).toEqual([5000, 5000, 5000])
  })
  it('끝전은 remainder로 돌려준다 (부호 포함)', () => {
    expect(allocate(10000, [1, 1, 1])).toEqual({ shares: [3333, 3333, 3333], remainder: 1 })
    expect(allocate(10, [1, 1, 1, 1, 1, 1])).toEqual({ shares: [2, 2, 2, 2, 2, 2], remainder: -2 })
  })
  it('가중치 합이 0이면 균등 배분, 대상이 없으면 전부 remainder', () => {
    expect(allocate(100, [0, 0]).shares).toEqual([50, 50])
    expect(allocate(100, [])).toEqual({ shares: [], remainder: 100 })
  })
})

describe('computeFairness', () => {
  it('상세: 할인된 영수증은 메뉴 가격 비율로 배분하고 낸 돈은 결제자에게', () => {
    const r = computeFairness(members, [buy('2026-11-02', 'a', detail(9000, { a: 4500, b: 4500, c: 4500 }))])
    expect(rowOf(r, 'a')).toMatchObject({ paid: 9000, consumed: 3000, balance: 6000 })
    expect(rowOf(r, 'b')).toMatchObject({ paid: 0, consumed: 3000, balance: -3000 })
    expect(rowOf(r, 'd')).toMatchObject({ paid: 0, consumed: 0, balance: 0 })
    expect(sumBalances(r)).toBe(0)
  })

  it('상세: 영수증 총액 ≠ 합계면 가격이 다른 사람에게 비율로 배분', () => {
    const r = computeFairness(members, [buy('2026-11-02', 'a', detail(9000, { a: 4000, b: 6000 }))])
    expect(rowOf(r, 'a').consumed).toBe(3600)
    expect(rowOf(r, 'b').consumed).toBe(5400)
  })

  it('끝전은 당번(결제자)에게: 상세', () => {
    const r = computeFairness(members, [buy('2026-11-02', 'a', detail(10000, { a: 4500, b: 4500, c: 4500 }))])
    expect(rowOf(r, 'a').consumed).toBe(3334) // 3333 + 끝전 1
    expect(rowOf(r, 'b').consumed).toBe(3333)
    expect(rowOf(r, 'c').consumed).toBe(3333)
    expect(sumBalances(r)).toBe(0)
  })

  it('끝전은 당번(결제자)에게: 간단 (결제자가 마신 사람이 아니어도 끝전만 떠안는다)', () => {
    const r1 = computeFairness(members, [buy('2026-11-02', 'c', simple(10000, ['a', 'b', 'c']))])
    expect(rowOf(r1, 'c').consumed).toBe(3334)
    const r2 = computeFairness(members, [buy('2026-11-02', 'd', simple(10000, ['a', 'b', 'c']))])
    expect(rowOf(r2, 'd').consumed).toBe(1) // 마시지 않은 d는 끝전 1원만
    expect(rowOf(r2, 'd').paid).toBe(10000)
    expect(sumBalances(r2)).toBe(0)
  })

  it('간단: 총액을 마신 사람 수로 균등 배분', () => {
    const r = computeFairness(members, [buy('2026-11-02', 'b', simple(12000, ['a', 'b', 'c', 'd']))])
    expect(r.rows.map((x) => x.consumed)).toEqual([3000, 3000, 3000, 3000])
    expect(rowOf(r, 'b').balance).toBe(9000)
  })

  it('간단과 상세가 섞여도 합산된다', () => {
    const r = computeFairness(members, [
      buy('2026-11-02', 'a', detail(10000, { a: 5000, b: 5000 })),
      buy('2026-11-03', 'b', simple(6000, ['a', 'b'])),
    ])
    expect(rowOf(r, 'a')).toMatchObject({ paid: 10000, consumed: 8000, balance: 2000 })
    expect(rowOf(r, 'b')).toMatchObject({ paid: 6000, consumed: 8000, balance: -2000 })
    expect(r.counted).toBe(2)
  })

  it('금액 없음·불완전 기록은 계산에서 빼고 건수를 센다', () => {
    const r = computeFairness(members, [
      buy('2026-11-02', 'a'), // 금액 없음
      buy('2026-11-03', 'b', simple(6000, ['a', 'b'])),
      buy('2026-11-04', 'c', { mode: 'detail', total: 5000, lines: [{ memberId: 'a', menu: '아메리카노', temp: 'ice', price: -1 }] }), // 불완전
      buy('2026-11-05', 'd', { mode: 'simple', total: 0, participants: ['a'] }), // 총액 0
    ])
    expect(r.counted).toBe(1)
    expect(r.excluded).toBe(3)
    expect(rowOf(r, 'a').consumed).toBe(3000)
  })

  it('탈퇴한 멤버는 한 행으로 합산하고 합계 0이 유지된다', () => {
    const only = [mk('a', 1), mk('b', 2)]
    const r = computeFairness(only, [buy('2026-11-02', 'gone', detail(10000, { gone: 5000, a: 5000 }))])
    expect(rowOf(r, null)).toMatchObject({ paid: 10000, consumed: 5000, balance: 5000 })
    expect(rowOf(r, 'a').balance).toBe(-5000)
    expect(sumBalances(r)).toBe(0)
    // 탈퇴 관련 활동이 없으면 행 자체가 없다
    expect(computeFairness(only, []).rows.some((x) => x.memberId === null)).toBe(false)
  })

  it('안 마심: 줄·참가자에 없는 사람은 0원', () => {
    const r = computeFairness(members, [buy('2026-11-02', 'a', detail(6000, { a: 3000, b: 3000 }))])
    expect(rowOf(r, 'c')).toMatchObject({ paid: 0, consumed: 0 })
    expect(rowOf(r, 'd')).toMatchObject({ paid: 0, consumed: 0 })
  })

  it('저장된 참가자는 이후 휴가·탈퇴 같은 변화와 무관하게 그대로 계산된다', () => {
    // 계산은 기록에 굳어 있는 줄/참가자만 쓰므로 같은 입력이면 항상 같은 결과
    const p = [buy('2026-11-02', 'a', simple(9000, ['a', 'b', 'c']))]
    expect(computeFairness(members, p)).toEqual(computeFairness([...members].reverse(), p))
  })

  it('어떤 조합이든 모든 행의 차액 합은 0', () => {
    const cases: [number, Record<string, number>][] = [
      [10, { a: 1, b: 1, c: 1, d: 1 }],
      [9999, { a: 1234, b: 4321, c: 777 }],
      [1, { a: 100, b: 100 }],
      [123457, { a: 4500, b: 5000, c: 5500, d: 4800 }],
    ]
    for (const [t, prices] of cases) {
      expect(sumBalances(computeFairness(members, [buy('2026-11-02', 'b', detail(t, prices))]))).toBe(0)
    }
  })

  it('include로 기간을 거른다', () => {
    const p = [buy('2026-11-01', 'a', simple(3000, ['a'])), buy('2026-11-10', 'b', simple(4000, ['b']))]
    const r = computeFairness(members, p, (d) => d.startsWith('2026-11-1'))
    expect(r.counted).toBe(1)
    expect(rowOf(r, 'a').paid).toBe(0)
  })
})

describe('가격표', () => {
  const list: PriceEntry[] = upsertPrices(
    [],
    [
      { menu: '아메리카노', temp: 'ice', price: 4500 },
      { menu: '아메리카노', temp: 'ice', size: 'L', price: 5000 },
      { menu: '콜드브루', temp: 'ice', price: 5500 },
    ],
    1,
  )

  it('가격표에 있으면 자동 채움, 없으면 undefined(빈칸)', () => {
    expect(lookupPrice(list, { menu: '아메리카노', temp: 'ice' })).toBe(4500)
    expect(lookupPrice(list, { menu: '아메리카노', temp: 'ice', size: 'L' })).toBe(5000)
    expect(lookupPrice(list, { menu: '아메리카노', temp: 'hot' })).toBeUndefined()
    expect(lookupPrice(list, { menu: '카페라떼', temp: 'ice' })).toBeUndefined()
  })
  it('온도가 고정인 메뉴는 hot으로 와도 같은 항목', () => {
    expect(lookupPrice(list, { menu: '콜드브루', temp: 'hot' })).toBe(5500)
  })
  it('다른 브랜드의 가격은 섞이지 않는다', () => {
    expect(lookupPrice(list, { menu: '아메리카노', temp: 'ice' }, 'other')).toBeUndefined()
  })
  it('새 값·바뀐 값만 저장 후보가 된다', () => {
    const d = diffPrices(list, [
      { menu: '아메리카노', temp: 'ice', price: 4500 }, // 같음
      { menu: '아메리카노', temp: 'ice', size: 'L', price: 5200 }, // 바뀜
      { menu: '카페라떼', temp: 'hot', price: 5000 }, // 새 항목
    ])
    expect(d.map((x) => x.menu + (x.size ?? ''))).toEqual(['아메리카노L', '카페라떼'])
  })
  it('upsert는 같은 항목의 가격을 갱신하고 시각을 남긴다', () => {
    const next = upsertPrices(list, [{ menu: '아메리카노', temp: 'ice', price: 4700 }], 99)
    expect(next).toHaveLength(list.length)
    expect(next.find((e) => e.menu === '아메리카노' && e.size === '')).toMatchObject({ price: 4700, updatedAt: 99, cafeBrandId: 'default' })
  })
})

describe('차액 기준 당번 (balanceSince)', () => {
  // a: +2000, b: −7000, c: +5000 (전체 기간)
  const history: Purchase[] = [
    buy('2026-11-02', 'a', detail(9000, { a: 3000, b: 3000, c: 3000 })),
    buy('2026-11-03', 'b', simple(3000, ['b'])),
    buy('2026-11-04', 'c', simple(12000, ['a', 'b', 'c'])),
  ]
  const ctx = (over: Partial<BuyerContext> = {}): BuyerContext => ({
    members: members.slice(0, 3),
    purchases: history,
    absences: [],
    skipDays: [],
    ...over,
  })
  const DAY = '2026-11-10'
  const balance = (since?: string): BuyerContext['settings'] => ({ buyerRule: 'balance', ...(since ? { balanceSince: since } : {}) })

  it('횟수 기준(기본)은 마지막 구매가 가장 오래된 사람, 차액 기준은 차액이 가장 작은 사람', () => {
    expect(getNextBuyer(DAY, ctx())?.id).toBe('a')
    expect(getNextBuyer(DAY, ctx({ settings: { buyerRule: 'count' } }))?.id).toBe('a')
    expect(getNextBuyer(DAY, ctx({ settings: balance() }))?.id).toBe('b')
  })

  it('balanceSince 이전 기록은 당번 계산에서 제외 (시작일 당일은 포함)', () => {
    // 11-04 기록만 반영: a −4000, b −4000, c +8000 → 동률이면 마지막 구매가 오래된 a
    expect(getNextBuyer(DAY, ctx({ settings: balance('2026-11-04') }))?.id).toBe('a')
    // 11-05부터면 반영되는 기록이 없다
    const r = computeFairness(members.slice(0, 3), history, balanceWindow({ balanceSince: '2026-11-05' }, DAY))
    expect(r.counted).toBe(0)
  })

  it('정산 후 다시 시작하면 차액이 모두 0', () => {
    // 오늘(11-04) 이미 기록이 있으므로 다음 날부터 센다
    const since = nextSettlementDate('2026-11-04', history)
    expect(since).toBe('2026-11-05')
    const r = computeFairness(members.slice(0, 3), history, balanceWindow({ balanceSince: since }, DAY))
    expect(r.rows.every((x) => x.balance === 0 && x.paid === 0 && x.consumed === 0)).toBe(true)
    // 정산 이후에는 횟수 기준과 같은 순서로 시작
    expect(getNextBuyer(DAY, ctx({ settings: balance(since) }))?.id).toBe('a')
  })

  it('오늘 아직 기록이 없으면 정산 시작일은 오늘', () => {
    expect(nextSettlementDate('2026-11-05', history)).toBe('2026-11-05')
  })

  it('정산 후 새로 쌓인 기록만 반영된다', () => {
    const since = nextSettlementDate('2026-11-04', history)
    const more = [...history, buy('2026-11-05', 'a', simple(6000, ['a', 'b', 'c']))]
    const r = computeFairness(members.slice(0, 3), more, balanceWindow({ balanceSince: since }, DAY))
    expect(r.rows.map((x) => x.balance)).toEqual([4000, -2000, -2000]) // 이전 차액(+2000/−7000/+5000)은 영향 없음
  })

  it('당번 날짜 당일·이후의 기록은 순번에 반영하지 않는다', () => {
    const future = [...history, buy(DAY, 'b', simple(90000, ['a', 'c']))]
    expect(getNextBuyer(DAY, ctx({ purchases: future, settings: balance() }))?.id).toBe('b')
  })

  it('금액 기록이 없으면 횟수 기준과 같은 순서 (전원 차액 0)', () => {
    const noMoney = history.map((p) => ({ date: p.date, memberId: p.memberId }))
    expect(getNextBuyer(DAY, ctx({ purchases: noMoney, settings: balance() }))?.id).toBe('a')
  })

  it('예상 순번: 같은 사람이 반복되지 않고 차액 순위대로 한 바퀴 돈다', () => {
    const f = forecastBuyers(DAY, 4, ctx({ settings: balance() }))
    expect(f.map((d) => d.memberId)).toEqual(['b', 'a', 'c', 'b'])
  })

  it('휴가자는 차액이 가장 작아도 건너뛴다', () => {
    const c = ctx({ settings: balance(), absences: [{ id: 'x', memberId: 'b', from: DAY, to: DAY }] })
    expect(getNextBuyer(DAY, c)?.id).toBe('a')
  })

  it('balanceSince 이후 금액 없는 기록 수를 센다 (통계 경고용)', () => {
    const mixed = [...history, buy('2026-11-06', 'a'), buy('2026-11-07', 'b'), buy('2026-10-01', 'c')]
    expect(countUnpriced(mixed, balanceWindow({ balanceSince: '2026-11-05' }))).toBe(2)
    expect(countUnpriced(mixed, balanceWindow({ balanceSince: '2026-11-08' }))).toBe(0)
  })
})

describe('금액 입력 규칙', () => {
  it('차액 기준에서는 "금액 없음"을 고를 수 없다', () => {
    expect(allowedModes('balance')).toEqual(['detail', 'simple'])
    expect(allowedModes('balance')).not.toContain('none')
    expect(allowedModes('count')).toContain('none')
  })
  it('차액 기준이면 기본값이 없음이어도 시트를 열고 상세로 시작한다', () => {
    expect(needsPriceSheet({ buyerRule: 'balance', defaultPriceMode: 'none' })).toBe(true)
    expect(defaultModeFor({ buyerRule: 'balance', defaultPriceMode: 'none' }, true)).toBe('detail')
  })
  it('횟수 기준 + 금액 기본값 없음이면 예전처럼 한 번 탭으로 기록', () => {
    expect(needsPriceSheet({ buyerRule: 'count', defaultPriceMode: 'none' })).toBe(false)
    expect(needsPriceSheet({ buyerRule: 'count', defaultPriceMode: 'simple' })).toBe(true)
  })
  it('주문이 없으면 상세 대신 간단으로 시작', () => {
    expect(defaultModeFor({ buyerRule: 'count', defaultPriceMode: 'detail' }, false)).toBe('simple')
  })

  it('차액 기준에서 balanceSince 이후 기록의 금액을 지우면 경고', () => {
    const before = simple(6000, ['a'])
    const base = { rule: 'balance' as const, since: '2026-11-05', date: '2026-11-06', before }
    expect(warnsOnClear({ ...base, after: undefined })).toBe(true)
    expect(warnsOnClear({ ...base, after: simple(7000, ['a']) })).toBe(false) // 금액을 고치는 것은 경고 대상 아님
    expect(warnsOnClear({ ...base, date: '2026-11-01', after: undefined })).toBe(false) // 정산 이전 기록
    expect(warnsOnClear({ ...base, rule: 'count', after: undefined })).toBe(false)
    expect(warnsOnClear({ ...base, before: undefined, after: undefined })).toBe(false) // 원래 금액이 없던 기록
  })
})

describe('금액 표시', () => {
  it('천 단위 쉼표와 부호', () => {
    expect(won(12345)).toBe('12,345원')
    expect(signedWon(3200)).toBe('+3,200원')
    expect(signedWon(-1500)).toBe('−1,500원')
    expect(signedWon(0)).toBe('0원')
  })
})

describe('차액 기준을 다시 켤 때 (reenablePlan)', () => {
  const settings = (since?: string) => ({ buyerRule: 'count' as const, defaultPriceMode: 'none' as const, ...(since ? { balanceSince: since } : {}) })
  const priced = (d: string) => buy(d, 'a', simple(3000, ['a']))

  it('처음 켜는 경우(balanceSince 없음)는 확인하지 않는다', () => {
    expect(reenablePlan(settings(), [buy('2026-11-02', 'a')], '2026-11-10')).toBeNull()
  })

  it('balanceSince 이후 금액 없는 기록이 없으면 확인하지 않는다', () => {
    expect(reenablePlan(settings('2026-11-01'), [priced('2026-11-02'), priced('2026-11-03')], '2026-11-10')).toBeNull()
  })

  it('balanceSince 이전의 금액 없는 기록은 세지 않는다', () => {
    expect(reenablePlan(settings('2026-11-05'), [buy('2026-11-02', 'a'), priced('2026-11-06')], '2026-11-10')).toBeNull()
  })

  it('금액 없는 기록 N건을 세고, 시작일은 정산과 같은 규칙', () => {
    const p = [priced('2026-11-02'), buy('2026-11-03', 'b'), buy('2026-11-04', 'c'), buy('2026-11-05', 'a')]
    // 오늘(11-10)에 기록이 없으면 오늘부터
    expect(reenablePlan(settings('2026-11-01'), p, '2026-11-10')).toEqual({ unpriced: 3, newSince: '2026-11-10' })
    // 오늘 이미 기록(금액 없음)이 있으면 내일부터 → 정산된 것으로 보고 다시 잡히지 않게
    const withToday = [...p, buy('2026-11-10', 'b')]
    expect(reenablePlan(settings('2026-11-01'), withToday, '2026-11-10')).toEqual({ unpriced: 4, newSince: '2026-11-11' })
  })

  it('"예"로 새 시작일을 쓰면 남은 금액 없는 기록이 모두 계산 범위 밖이 된다', () => {
    const p = [buy('2026-11-03', 'b'), buy('2026-11-10', 'c')]
    const plan = reenablePlan(settings('2026-11-01'), p, '2026-11-10')!
    const applied = applySettingsPatch(settings('2026-11-01'), { buyerRule: 'balance', balanceSince: plan.newSince }, '2026-11-10')
    expect(applied.balanceSince).toBe('2026-11-11')
    expect(countUnpriced(p, balanceWindow(applied))).toBe(0)
    expect(reenablePlan(applied, p, '2026-11-10')).toBeNull() // 같은 상태에서 또 묻지 않는다
  })

  it('"아니요"면 이전 시작일을 그대로 유지한다', () => {
    const kept = applySettingsPatch(settings('2026-11-01'), { buyerRule: 'balance' }, '2026-11-10')
    expect(kept.balanceSince).toBe('2026-11-01')
  })
})

describe('applySettingsPatch', () => {
  const base = { buyerRule: 'count' as const, defaultPriceMode: 'none' as const }
  it('차액 기준을 처음 켜면 시작일은 오늘, 금액 기본값 없음은 상세로', () => {
    expect(applySettingsPatch(base, { buyerRule: 'balance' }, '2026-11-10')).toEqual({
      buyerRule: 'balance',
      defaultPriceMode: 'detail',
      balanceSince: '2026-11-10',
    })
  })
  it('이미 시작일이 있으면 유지하고, 간단 모드 기본값도 유지', () => {
    const s = applySettingsPatch({ ...base, defaultPriceMode: 'simple', balanceSince: '2026-11-01' }, { buyerRule: 'balance' }, '2026-11-10')
    expect(s).toMatchObject({ balanceSince: '2026-11-01', defaultPriceMode: 'simple' })
  })
  it('횟수 기준으로 돌려도 시작일은 지우지 않는다', () => {
    expect(applySettingsPatch({ ...base, buyerRule: 'balance', balanceSince: '2026-11-01' }, { buyerRule: 'count' }, '2026-11-10').balanceSince).toBe('2026-11-01')
  })
})
