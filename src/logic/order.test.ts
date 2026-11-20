import { describe, expect, it } from 'vitest'
import type { DayOrder, Member, Order } from '../types'
import { aggregate, aggregateLabel, buildDraft, buildOrderText, compactLabel, resolveOrder, snapshotItems, type OrderContext } from './order'

const FRI = '2026-11-20' // 금요일
const iceAmericano: Order = { menu: '아메리카노', temp: 'ice' }
const hotLatte: Order = { menu: '카페라떼', temp: 'hot' }

const mk = (id: string, order: number, favorite?: Order): Member => ({ id, name: id.toUpperCase(), order, favorite })

const ctx = (over: Partial<OrderContext> = {}): OrderContext => ({
  members: [
    mk('a', 1, iceAmericano),
    mk('b', 2, iceAmericano),
    mk('c', 3, hotLatte),
    mk('d', 4, { menu: '디카페인 아메리카노', temp: 'ice' }),
  ],
  purchases: [],
  absences: [],
  skipDays: [],
  orders: [],
  ...over,
})
const day = (items: DayOrder['items']): DayOrder => ({ date: FRI, items, updatedAt: 1 })

describe('buildDraft', () => {
  it('휴가인 멤버는 제외하고 나머지는 favorite으로 초안을 만든다', () => {
    const c = ctx({ absences: [{ id: 'x', memberId: 'b', from: FRI, to: FRI }] })
    const d = buildDraft(FRI, c)
    expect(d.map((l) => l.memberId)).toEqual(['a', 'c', 'd'])
    expect(d[0]).toMatchObject({ status: 'order', order: iceAmericano, edited: false })
  })

  it('favorite이 없는 멤버는 "메뉴 미정"', () => {
    const c = ctx({ members: [mk('a', 1, iceAmericano), mk('b', 2)] })
    expect(buildDraft(FRI, c)[1]).toMatchObject({ memberId: 'b', status: 'undecided' })
  })

  it('favorite이 "안 마심"이면 skipped', () => {
    const c = ctx({ members: [mk('a', 1, { menu: '안 마심', temp: 'ice' })] })
    expect(buildDraft(FRI, c)[0].status).toBe('skipped')
  })
})

describe('aggregate (집계 묶음)', () => {
  it('같은 메뉴+온도끼리 묶고 많은 순으로 정렬', () => {
    const agg = aggregate(resolveOrder(FRI, ctx()))
    expect(agg.map((a) => [aggregateLabel(a.order), a.count])).toEqual([
      ['아이스 아메리카노', 2],
      ['따뜻한 라떼', 1],
      ['아이스 디카페인 아메리카노', 1],
    ])
  })

  it('같은 메뉴라도 온도·사이즈·샷이 다르면 따로 센다', () => {
    const c = ctx({
      members: [
        mk('a', 1, { menu: '아메리카노', temp: 'ice' }),
        mk('b', 2, { menu: '아메리카노', temp: 'hot' }),
        mk('c', 3, { menu: '아메리카노', temp: 'ice', size: 'L' }),
        mk('d', 4, { menu: '아메리카노', temp: 'ice', shot: 1 }),
      ],
    })
    expect(aggregate(resolveOrder(FRI, c))).toHaveLength(4)
  })

  it('메모만 다르면 같은 묶음이다', () => {
    const c = ctx({
      members: [mk('a', 1, { ...iceAmericano, memo: '연하게' }), mk('b', 2, iceAmericano)],
    })
    const agg = aggregate(resolveOrder(FRI, c))
    expect(agg).toHaveLength(1)
    expect(agg[0].count).toBe(2)
  })

  it('콜드브루는 온도가 고정이라 hot으로 저장돼 있어도 한 묶음', () => {
    const c = ctx({
      members: [mk('a', 1, { menu: '콜드브루', temp: 'ice' }), mk('b', 2, { menu: '콜드브루', temp: 'hot' })],
    })
    expect(aggregate(resolveOrder(FRI, c))).toHaveLength(1)
  })

  it('"안 마심"과 메뉴 미정은 집계에서 제외', () => {
    const c = ctx({ members: [mk('a', 1, iceAmericano), mk('b', 2, { menu: '안 마심', temp: 'ice' }), mk('c', 3)] })
    const agg = aggregate(resolveOrder(FRI, c))
    expect(agg).toHaveLength(1)
    expect(agg[0].count).toBe(1)
  })
})

describe('resolveOrder (당일 수정 반영)', () => {
  it('오늘만 바꾼 값이 favorite보다 우선하고 edited로 표시된다', () => {
    const c = ctx({ orders: [day([{ memberId: 'a', menu: '카페라떼', temp: 'hot' }])] })
    const a = resolveOrder(FRI, c).find((l) => l.memberId === 'a')!
    expect(a).toMatchObject({ status: 'order', edited: true, order: { menu: '카페라떼', temp: 'hot' } })
    // 다른 사람은 그대로, favorite 자체도 그대로
    expect(resolveOrder(FRI, c).find((l) => l.memberId === 'b')!.edited).toBe(false)
    expect(c.members[0].favorite).toEqual(iceAmericano)
  })

  it('오늘만 "안 마심"으로 바꾸면 집계에서 빠진다', () => {
    const c = ctx({ orders: [day([{ memberId: 'a', menu: '안 마심', temp: 'ice', skipped: true }])] })
    expect(aggregate(resolveOrder(FRI, c)).find((x) => x.order.menu === '아메리카노')!.count).toBe(1)
  })

  it('favorite이 없던 멤버도 오늘 값을 정하면 주문에 들어간다', () => {
    const c = ctx({ members: [mk('a', 1)], orders: [day([{ memberId: 'a', menu: '콜드브루', temp: 'ice' }])] })
    expect(resolveOrder(FRI, c)[0]).toMatchObject({ status: 'order', edited: true })
  })

  it('휴가자에게 저장된 값은 무시한다', () => {
    const c = ctx({
      absences: [{ id: 'x', memberId: 'a', from: FRI, to: FRI }],
      orders: [day([{ memberId: 'a', menu: '카페라떼', temp: 'hot' }])],
    })
    expect(resolveOrder(FRI, c).map((l) => l.memberId)).not.toContain('a')
  })

  it('다른 날짜의 저장값은 영향을 주지 않는다', () => {
    const c = ctx({ orders: [{ date: '2026-11-19', items: [{ memberId: 'a', menu: '안 마심', temp: 'ice', skipped: true }], updatedAt: 1 }] })
    expect(resolveOrder(FRI, c)[0].status).toBe('order')
  })
})

describe('공유 텍스트', () => {
  it('요청한 형식으로 만든다', () => {
    const c = ctx({
      members: [
        mk('철수', 1, iceAmericano),
        mk('영희', 2, hotLatte),
        mk('민수', 3, iceAmericano),
        mk('지은', 4, { menu: '디카페인 아메리카노', temp: 'ice' }),
      ],
    })
    expect(buildOrderText(FRI, c, () => '🐻')).toBe(
      [
        '☕ 11/20(금) 커피 주문 · 당번 🐻 철수',
        '아이스 아메리카노 2 / 따뜻한 라떼 1 / 아이스 디카페인 아메리카노 1',
        '─ 철수 아아, 영희 라떼(따뜻), 민수 아아, 지은 디카페인 아아',
        '바꿀 분만 답장 주세요!',
      ].join('\n'),
    )
  })

  it('안 마심은 목록에서 빠지고, 미정은 "메뉴 미정"으로 남는다', () => {
    const c = ctx({ members: [mk('a', 1, iceAmericano), mk('b', 2, { menu: '안 마심', temp: 'ice' }), mk('c', 3)] })
    const text = buildOrderText(FRI, c)
    expect(text).toContain('─ A 아아, C 메뉴 미정')
    expect(text).not.toContain('B ')
  })

  it('이미 산 사람이 기록돼 있으면 그 사람이 당번', () => {
    const c = ctx({ purchases: [{ date: FRI, memberId: 'c' }] })
    expect(buildOrderText(FRI, c).split('\n')[0]).toBe('☕ 11/20(금) 커피 주문 · 당번 C')
  })

  it('옵션과 메모는 개인별 줄에만 붙는다', () => {
    const c = ctx({ members: [mk('a', 1, { menu: '카페라떼', temp: 'ice', size: 'L', shot: 1, memo: '덜 달게' })] })
    const text = buildOrderText(FRI, c)
    expect(text).toContain('A 라떼(L·샷추가·덜 달게)')
    expect(text.split('\n')[1]).toBe('아이스 라떼 (L, 샷추가) 1')
  })

  it('모두 미정이면 안내 문구', () => {
    const c = ctx({ members: [mk('a', 1)] })
    expect(buildOrderText(FRI, c).split('\n')[1]).toBe('아직 정해진 주문이 없어요')
  })
})

describe('compactLabel', () => {
  it('아이스 아메리카노는 아아, 차는 따뜻함이 기본이라 괄호 없음', () => {
    expect(compactLabel(iceAmericano)).toBe('아아')
    expect(compactLabel({ menu: '차/티', temp: 'hot' })).toBe('차/티')
    expect(compactLabel({ menu: '차/티', temp: 'ice' })).toBe('차/티(아이스)')
    expect(compactLabel({ menu: '아메리카노', temp: 'hot' })).toBe('아메리카노(따뜻)')
  })
  it('사용자 추가 메뉴는 이름 그대로', () => {
    expect(compactLabel({ menu: '유자차', temp: 'hot' })).toBe('유자차(따뜻)')
  })
})

describe('snapshotItems', () => {
  it('복사 시점의 최종 주문을 굳히고(안 마심 포함) 미정은 넣지 않는다', () => {
    const c = ctx({ members: [mk('a', 1, iceAmericano), mk('b', 2, { menu: '안 마심', temp: 'ice' }), mk('c', 3)] })
    const items = snapshotItems(resolveOrder(FRI, c))
    expect(items.map((i) => [i.memberId, !!i.skipped])).toEqual([['a', false], ['b', true]])
    // 굳힌 뒤에는 favorite이 바뀌어도 그날 주문이 유지된다
    const later = ctx({ members: [mk('a', 1, hotLatte)], orders: [day(items)] })
    expect(resolveOrder(FRI, later)[0].order).toMatchObject({ menu: '아메리카노' })
  })
})

describe('edited 표시', () => {
  it('복사 시점에 굳힌 값이 기본 메뉴와 같으면 edited가 아니다', () => {
    const c = ctx()
    const items = snapshotItems(resolveOrder(FRI, c))
    const after = ctx({ orders: [day(items)] })
    expect(resolveOrder(FRI, after).every((l) => !l.edited)).toBe(true)
  })
})
