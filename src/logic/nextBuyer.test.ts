import { describe, expect, it } from 'vitest'
import { countPurchases, forecastBuyers, getNextBuyer, isBusinessDay, rankMembers, type BuyerContext } from './nextBuyer'
import { buildShareText } from './shareText'
import type { Member } from '../types'

// 2026-11-16 = 월요일
const MON = '2026-11-16'
const TUE = '2026-11-17'
const WED = '2026-11-18'
const THU = '2026-11-19'
const FRI = '2026-11-20'
const SAT = '2026-11-21'
const SUN = '2026-11-22'
const NEXT_MON = '2026-11-23'

const mk = (id: string, order: number): Member => ({ id, name: id.toUpperCase(), order })
const members = [mk('a', 1), mk('b', 2), mk('c', 3), mk('d', 4)]

const ctx = (over: Partial<BuyerContext> = {}): BuyerContext => ({
  members,
  purchases: [],
  absences: [],
  skipDays: [],
  ...over,
})
const id = (m: Member | null) => m?.id ?? null

describe('getNextBuyer 기본 규칙', () => {
  it('아무도 안 샀다면 order가 가장 빠른 사람', () => {
    expect(id(getNextBuyer(MON, ctx()))).toBe('a')
  })

  it('마지막 구매일이 가장 오래된 사람이 당번', () => {
    const c = ctx({
      purchases: [
        { date: '2026-11-09', memberId: 'a' },
        { date: '2026-11-10', memberId: 'b' },
        { date: '2026-11-11', memberId: 'c' },
        { date: '2026-11-12', memberId: 'd' },
      ],
    })
    expect(id(getNextBuyer(MON, c))).toBe('a')
  })

  it('한 번도 안 산 사람이 최우선 (같으면 order 순)', () => {
    const c = ctx({
      purchases: [
        { date: '2026-11-09', memberId: 'a' },
        { date: '2026-11-10', memberId: 'c' },
      ],
    })
    expect(id(getNextBuyer(MON, c))).toBe('b') // b, d 미구매 → order가 빠른 b
  })

  it('계산 대상 날짜 당일 이후의 기록은 무시한다 (과거 날짜 계산)', () => {
    const c = ctx({ purchases: [{ date: WED, memberId: 'a' }] })
    expect(id(getNextBuyer(TUE, c))).toBe('a')
    expect(id(getNextBuyer(THU, c))).toBe('b')
  })
})

describe('휴가자 건너뛰기', () => {
  it('그날 휴가인 사람은 건너뛰고 다음 사람이 당번', () => {
    const c = ctx({ absences: [{ id: 'x', memberId: 'a', from: MON, to: WED }] })
    expect(id(getNextBuyer(TUE, c))).toBe('b')
  })

  it('휴가 시작일·종료일 당일도 휴가로 취급 (경계 포함)', () => {
    const c = ctx({ absences: [{ id: 'x', memberId: 'a', from: TUE, to: WED }] })
    expect(id(getNextBuyer(MON, c))).toBe('a')
    expect(id(getNextBuyer(TUE, c))).toBe('b')
    expect(id(getNextBuyer(WED, c))).toBe('b')
    expect(id(getNextBuyer(THU, c))).toBe('a')
  })

  it('여러 명이 동시에 휴가면 둘 다 건너뛴다', () => {
    const c = ctx({
      absences: [
        { id: '1', memberId: 'a', from: MON, to: MON },
        { id: '2', memberId: 'b', from: MON, to: MON },
      ],
    })
    expect(id(getNextBuyer(MON, c))).toBe('c')
  })

  it('전원이 휴가면 null', () => {
    const c = ctx({ absences: members.map((m) => ({ id: m.id, memberId: m.id, from: MON, to: MON })) })
    expect(getNextBuyer(MON, c)).toBeNull()
  })
})

describe('휴가 복귀 후 우선순위', () => {
  it('휴가 중 구매 기록이 없으므로 복귀하면 가장 오래 안 산 사람으로 최우선이 된다', () => {
    const c = ctx({
      purchases: [
        { date: '2026-11-02', memberId: 'a' },
        { date: '2026-11-03', memberId: 'b' },
        { date: '2026-11-04', memberId: 'c' },
        { date: '2026-11-05', memberId: 'd' },
        { date: '2026-11-09', memberId: 'b' },
        { date: '2026-11-10', memberId: 'c' },
        { date: '2026-11-11', memberId: 'd' },
      ],
      absences: [{ id: 'x', memberId: 'a', from: '2026-11-06', to: '2026-11-13' }],
    })
    // 휴가 중(11/9~11/13)엔 건너뛰지만 복귀한 월요일엔 a가 가장 오래 안 샀으므로 바로 당번
    expect(id(getNextBuyer('2026-11-12', c))).toBe('b') // 아직 휴가 중 → a 제외, 마지막이 가장 오래된 b
    expect(id(getNextBuyer(MON, c))).toBe('a')
  })

  it('휴가자는 순번이 "밀리지" 않고 복귀 즉시 원래 우선순위 그대로 회복', () => {
    const c = ctx({
      purchases: [
        { date: '2026-11-09', memberId: 'b' },
        { date: '2026-11-10', memberId: 'c' },
        { date: '2026-11-11', memberId: 'd' },
      ],
      absences: [{ id: 'x', memberId: 'a', from: '2026-11-12', to: '2026-11-13' }],
    })
    expect(id(getNextBuyer(MON, c))).toBe('a')
  })
})

describe('대신 산 경우', () => {
  it('당번이 아닌 사람이 대신 샀다면 그 사람이 산 날짜로 순서가 갱신된다', () => {
    // a가 당번이었지만 c가 대신 구매
    const c = ctx({ purchases: [{ date: MON, memberId: 'c' }] })
    expect(id(getNextBuyer(TUE, c))).toBe('a') // a는 여전히 미구매 → 우선
    const c2 = ctx({
      purchases: [
        { date: MON, memberId: 'c' },
        { date: TUE, memberId: 'a' },
      ],
    })
    expect(id(getNextBuyer(WED, c2))).toBe('b')
    expect(id(getNextBuyer(THU, { ...c2, purchases: [...c2.purchases, { date: WED, memberId: 'b' }] }))).toBe('d')
  })

  it('대신 사준 사람은 순서가 뒤로 밀리고, 대신 사게 만든 당번은 다음 날 바로 당번', () => {
    const c = ctx({
      purchases: [
        { date: '2026-11-12', memberId: 'a' },
        { date: '2026-11-13', memberId: 'b' },
        { date: '2026-11-14', memberId: 'c' }, // (주말이라도 기록은 기록)
        { date: '2026-11-15', memberId: 'd' },
        { date: MON, memberId: 'b' }, // a 대신 b가 삼
      ],
    })
    expect(id(getNextBuyer(TUE, c))).toBe('a')
  })
})

describe('신규 멤버', () => {
  it('기존 멤버가 모두 구매 이력이 있으면 신규 멤버가 즉시 최우선', () => {
    const withNew = [...members, mk('e', 5)]
    const c = ctx({
      members: withNew,
      purchases: [
        { date: '2026-11-09', memberId: 'a' },
        { date: '2026-11-10', memberId: 'b' },
        { date: '2026-11-11', memberId: 'c' },
        { date: '2026-11-12', memberId: 'd' },
      ],
    })
    expect(id(getNextBuyer(MON, c))).toBe('e')
  })

  it('신규 멤버가 여러 명이면 그들끼리는 order 순', () => {
    const withNew = [...members, mk('f', 7), mk('e', 6)]
    const c = ctx({
      members: withNew,
      purchases: members.map((m, i) => ({ date: `2026-11-0${i + 2}`, memberId: m.id })),
    })
    const ranked = rankMembers(MON, c).map((r) => r.member.id)
    expect(ranked.slice(0, 2)).toEqual(['e', 'f'])
  })

  it('신규 멤버가 휴가 중이면 건너뛰고 복귀 후 당번', () => {
    const withNew = [...members, mk('e', 5)]
    const base = members.map((m, i) => ({ date: `2026-11-0${i + 2}`, memberId: m.id }))
    const c = ctx({
      members: withNew,
      purchases: base,
      absences: [{ id: 'x', memberId: 'e', from: MON, to: MON }],
    })
    expect(id(getNextBuyer(MON, c))).toBe('a')
    expect(id(getNextBuyer(TUE, c))).toBe('e')
  })
})

describe('주말/휴일 제외', () => {
  it('주말에는 당번이 없다', () => {
    expect(getNextBuyer(SAT, ctx())).toBeNull()
    expect(getNextBuyer(SUN, ctx())).toBeNull()
  })

  it('skipDays(공휴일 등)에는 당번이 없다', () => {
    const c = ctx({ skipDays: [WED] })
    expect(getNextBuyer(WED, c)).toBeNull()
    expect(isBusinessDay(WED, c.skipDays)).toBe(false)
    expect(isBusinessDay(THU, c.skipDays)).toBe(true)
  })

  it('휴일이 끼어도 순번이 소모되지 않는다', () => {
    const c = ctx({ skipDays: [TUE], purchases: [{ date: MON, memberId: 'a' }] })
    expect(id(getNextBuyer(WED, c))).toBe('b')
  })
})

describe('forecastBuyers (앞으로 5영업일)', () => {
  it('주말을 건너뛰고 5영업일, 순번대로 돌아간다', () => {
    const f = forecastBuyers(THU, 5, ctx())
    expect(f.map((d) => d.date)).toEqual([THU, FRI, NEXT_MON, '2026-11-24', '2026-11-25'])
    expect(f.map((d) => d.memberId)).toEqual(['a', 'b', 'c', 'd', 'a'])
  })

  it('시작일이 주말이면 다음 영업일부터', () => {
    const f = forecastBuyers(SAT, 2, ctx())
    expect(f.map((d) => d.date)).toEqual([NEXT_MON, '2026-11-24'])
  })

  it('skipDays를 건너뛴다', () => {
    const f = forecastBuyers(MON, 3, ctx({ skipDays: [TUE] }))
    expect(f.map((d) => d.date)).toEqual([MON, WED, THU])
  })

  it('등록된 휴가를 반영한다', () => {
    const f = forecastBuyers(MON, 5, ctx({ absences: [{ id: 'x', memberId: 'b', from: TUE, to: WED }] }))
    // 월:a, 화:b휴가→c, 수:b휴가→d, 목:b, 금:a
    expect(f.map((d) => d.memberId)).toEqual(['a', 'c', 'd', 'b', 'a'])
  })

  it('이미 기록된 날은 실제 구매자를 쓰고 이후 예측에 반영한다', () => {
    const f = forecastBuyers(MON, 3, ctx({ purchases: [{ date: MON, memberId: 'c' }] }))
    expect(f[0]).toEqual({ date: MON, memberId: 'c', actual: true })
    expect(f.map((d) => d.memberId)).toEqual(['c', 'a', 'b'])
  })

  it('전원 휴가인 날은 null이고 순번을 소모하지 않는다', () => {
    const all = members.map((m) => ({ id: m.id, memberId: m.id, from: TUE, to: TUE }))
    const f = forecastBuyers(MON, 3, ctx({ absences: all }))
    expect(f.map((d) => d.memberId)).toEqual(['a', null, 'b'])
  })
})

describe('countPurchases', () => {
  it('1인당 횟수와 월별 필터', () => {
    const purchases = [
      { date: '2026-10-30', memberId: 'a' },
      { date: '2026-11-02', memberId: 'a' },
      { date: '2026-11-03', memberId: 'b' },
    ]
    expect(Object.fromEntries(countPurchases(members, purchases))).toEqual({ a: 2, b: 1, c: 0, d: 0 })
    expect(Object.fromEntries(countPurchases(members, purchases, '2026-11'))).toEqual({ a: 1, b: 1, c: 0, d: 0 })
  })
})

describe('buildShareText', () => {
  it('"☕ 11/17(화) 당번: A / 다음: B, C" 형식', () => {
    expect(buildShareText(TUE, ctx())).toBe('☕ 11/17(화) 당번: A / 다음: B, C')
  })
  it('주말에 호출하면 다음 영업일 기준', () => {
    expect(buildShareText(SAT, ctx())).toBe('☕ 11/23(월) 당번: A / 다음: B, C')
  })
})
