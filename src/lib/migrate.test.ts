import { describe, expect, it } from 'vitest'
import { FutureVersionError, migrate, versionOf } from './migrate'
import { migrateView } from './testing'
import { SCHEMA_VERSION } from '../types'

// 배포된 v1 앱이 내보내던 형태 (schemaVersion 없음)
const v1 = () => ({
  members: [
    { id: 'm1', name: '가', order: 1, color: '#C8553D', emoji: '☕' },
    { id: 'm2', name: '나', order: 3, color: '#D9A93B', emoji: '🥐' }, // 순서 값에 빈틈이 있어도 보존
    { id: 'm3', name: '다', order: 4 }, // color/emoji 없음
  ],
  purchases: [
    { date: '2026-11-02', memberId: 'm1' },
    { date: '2026-11-03', memberId: 'm2', memo: '아아 3잔' },
    { date: '2026-11-04', memberId: 'gone' }, // 탈퇴한 멤버의 기록
  ],
  absences: [
    { id: 'a1', memberId: 'm1', from: '2026-11-10', to: '2026-11-12' },
    { id: 'a2', memberId: 'gone', from: '2026-11-05', to: '2026-11-05' }, // 탈퇴한 멤버의 휴가도 버리지 않는다
  ],
  skipDays: ['2026-12-25', '2026-11-26'],
})

describe('migrate v1 → v3 (v2 시절의 보존 단언이 그대로 성립)', () => {
  it('기존 members·purchases·absences·skipDays를 값까지 그대로 보존한다', () => {
    const old = v1()
    const out = migrateView(old, 123)
    expect(out.members).toEqual(old.members.map((m) => ({ ...m, color: m.color, emoji: m.emoji })))
    expect(out.members.map((m) => m.order)).toEqual([1, 3, 4])
    expect(out.purchases).toEqual(old.purchases)
    expect(out.absences).toEqual(old.absences)
    expect(out.skipDays).toEqual(['2026-11-26', '2026-12-25']) // 정렬만 달라짐, 개수 동일
  })

  it('새 필드는 기본값으로 채운다', () => {
    const out = migrateView(v1(), 123)
    expect(out.schemaVersion).toBe(SCHEMA_VERSION)
    expect(out.orders).toEqual([])
    expect(out.customMenus).toEqual([])
    expect(out.updatedAt).toBe(123)
    expect(out.members.every((m) => m.favorite === undefined)).toBe(true)
  })

  it('입력 객체를 변경하지 않는다', () => {
    const old = v1()
    const snap = JSON.stringify(old)
    migrateView(old)
    expect(JSON.stringify(old)).toBe(snap)
  })

  it('이미 최신인 데이터를 다시 옮겨도 같다 (멱등)', () => {
    const once = migrate(v1(), 1)
    const twice = migrate(JSON.parse(JSON.stringify(once)), 2)
    expect(twice).toEqual(once)
  })

  it('JSON 직렬화/역직렬화(내보내기→가져오기)를 거쳐도 보존된다', () => {
    const out = migrateView(JSON.parse(JSON.stringify(v1())))
    expect(out.purchases).toHaveLength(3)
    expect(out.absences).toHaveLength(2)
  })

  it('휴가 from/to를 뒤집지 않고 그대로 둔다', () => {
    const old = { ...v1(), absences: [{ id: 'z', memberId: 'm1', from: '2026-11-12', to: '2026-11-10' }] }
    expect(migrateView(old).absences[0]).toEqual(old.absences[0])
  })
})

describe('migrate 검증', () => {
  it('형식이 틀리면 오류', () => {
    expect(() => migrateView(null)).toThrow()
    expect(() => migrateView({})).toThrow()
    expect(() => migrateView({ members: 'x' })).toThrow()
  })

  it('앱보다 새로운 버전은 읽지 않는다 (덮어써서 잃지 않도록)', () => {
    expect(() => migrateView({ ...v1(), schemaVersion: SCHEMA_VERSION + 1 })).toThrow(FutureVersionError)
  })

  it('schemaVersion이 없으면 v1', () => {
    expect(versionOf(v1())).toBe(1)
    expect(versionOf({ schemaVersion: 2 })).toBe(2)
  })

  it('일부 항목이 깨져 있어도 나머지는 살린다', () => {
    const out = migrateView({
      ...v1(),
      purchases: [...v1().purchases, { date: 'bad', memberId: 'm1' }, null, { date: '2026-11-09' }],
    })
    expect(out.purchases).toHaveLength(3)
  })

  it('v2의 주문·기본 메뉴·사용자 메뉴를 검증해서 읽는다', () => {
    const out = migrateView({
      ...v1(),
      schemaVersion: 2,
      members: [{ id: 'm1', name: '가', order: 1, favorite: { menu: '아메리카노', temp: 'hot', size: 'L', shot: 1, memo: '연하게' } }],
      orders: [
        { date: '2026-11-20', updatedAt: 5, items: [{ memberId: 'm1', menu: '카페라떼', temp: 'weird' }, { memberId: 'm1' }, { menu: 'x' }] },
        { date: 'bad', items: [] },
      ],
      customMenus: ['유자차', '유자차', '', 3],
    })
    expect(out.members[0].favorite).toEqual({ menu: '아메리카노', temp: 'hot', size: 'L', shot: 1, memo: '연하게' })
    expect(out.orders).toHaveLength(1)
    expect(out.orders[0].items).toEqual([{ memberId: 'm1', menu: '카페라떼', temp: 'ice' }])
    expect(out.customMenus).toEqual(['유자차'])
  })
})
