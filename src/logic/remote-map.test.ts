import { describe, expect, it } from 'vitest'
import type { Group } from '../types'
import { applyOps, diffGroups, groupToImport, groupToRows, payloadCodec, remapMemberIds, rowsToGroup } from './remote-map'
import { defaultCoffeeGroup } from './groups'
import { legacyGroup } from '../lib/testing'

/** 값이 풍부한 커피 그룹: 금액(상세·간단), 주문, 가격표, 휴가, 쉬는 날, 기본 메뉴, 탈퇴한 멤버의 기록 */
function coffeeFixture(): Group {
  const g = defaultCoffeeGroup()
  return {
    ...g,
    id: 'g-fix',
    name: '커피',
    emoji: '☕',
    schedule: [1, 2, 3, 4, 5],
    members: [
      { id: 'm1', name: '가람', order: 1, color: '#C8553D', emoji: '🐻', favorite: { menu: '아메리카노', temp: 'ice', size: 'M', shot: 1, memo: '연하게' } },
      { id: 'm2', name: '나래', order: 2 },
      { id: 'm3', name: '다온', order: 5, color: '#5F86A6' },
    ],
    records: [
      { date: '2026-11-16', memberId: 'm1', memo: '첫 기록' },
      {
        date: '2026-11-17',
        memberId: 'm2',
        pricing: {
          mode: 'detail',
          total: 9500,
          lines: [
            { memberId: 'm1', menu: '아메리카노', temp: 'ice', size: 'M', price: 4500 },
            { memberId: 'm2', menu: '라떼', temp: 'hot', price: 5000 },
          ],
        },
      },
      { date: '2026-11-18', memberId: 'gone', pricing: { mode: 'simple', total: 12000, participants: ['m1', 'gone', 'm3'] } }, // 탈퇴한 멤버
    ],
    absences: [{ id: 'a1', memberId: 'm3', from: '2026-11-19', to: '2026-11-20' }],
    skipDays: ['2026-12-25'],
    coffee: {
      orders: [
        {
          date: '2026-11-17',
          updatedAt: 1763000000000,
          items: [
            { memberId: 'm1', menu: '아메리카노', temp: 'ice', size: 'M' },
            { memberId: 'm2', menu: '안 마심', temp: 'ice', skipped: true },
          ],
        },
      ],
      customMenus: ['유자차'],
      priceList: [{ cafeBrandId: 'default', menu: '아메리카노', temp: 'ice', size: 'M', price: 4500, updatedAt: 1763000000000 }],
      settings: { buyerRule: 'balance', defaultPriceMode: 'detail', balanceSince: '2026-11-01' },
    },
  }
}

const generalFixture = (): Group => ({
  ...legacyGroup('g-gen', 'general', '청소', '🧹'),
  members: [{ id: 'x1', name: '라온', order: 1 }],
  records: [{ date: '2026-11-17', memberId: 'x1', memo: '화장실' }],
})

const roundTrip = (g: Group) => rowsToGroup(groupToRows(g))

describe('payload 코덱', () => {
  it('undefined 필드를 제거하고 평문 JSON으로 둔다', () => {
    expect(payloadCodec.encode({ a: 1, b: undefined })).toEqual({ a: 1 })
    expect(payloadCodec.decode(null, { x: 1 })).toEqual({ x: 1 })
  })
})

describe('Group ↔ 행 왕복', () => {
  it('커피 그룹의 모든 값이 그대로 돌아온다', () => {
    const g = coffeeFixture()
    expect(roundTrip(g)).toEqual(g)
  })
  it('일반 그룹은 coffee 없이 돌아오고 prices 행이 없다', () => {
    const g = generalFixture()
    expect(groupToRows(g).prices).toBeNull()
    expect(roundTrip(g)).toEqual(g)
    expect(roundTrip(g).coffee).toBeUndefined()
  })
  it('탈퇴한 멤버의 과거 기록과 금액 참여자가 보존된다', () => {
    const r = roundTrip(coffeeFixture())
    expect(r.records.find((x) => x.date === '2026-11-18')?.memberId).toBe('gone')
    expect(r.records.find((x) => x.date === '2026-11-18')?.pricing?.participants).toContain('gone')
  })
  it('멤버 order 값은 재번호하지 않는다', () => {
    expect(roundTrip(coffeeFixture()).members.map((m) => m.order)).toEqual([1, 2, 5])
  })
  it('가격표가 비어 있어도(행 없음) 기본값으로 읽는다', () => {
    const rows = groupToRows(coffeeFixture())
    const g = rowsToGroup({ ...rows, prices: null, orders: [] })
    expect(g.coffee?.settings).toEqual({ buyerRule: 'count', defaultPriceMode: 'none' })
    expect(g.coffee?.priceList).toEqual([])
  })
})

describe('diffGroups', () => {
  const edit = (fn: (g: Group) => Group) => {
    const before = coffeeFixture()
    const after = fn(structuredClone(before))
    return { before, after, ops: diffGroups(before, after) }
  }
  /** diff를 행에 적용하면 변경 후 그룹이 되어야 한다 */
  const applied = (before: Group, after: Group) => rowsToGroup(applyOps(groupToRows(before), diffGroups(before, after)))

  it('달라진 것이 없으면 빈 목록', () => {
    const g = coffeeFixture()
    expect(diffGroups(g, structuredClone(g))).toEqual([])
    expect(diffGroups(generalFixture(), generalFixture())).toEqual([])
  })
  it('다른 그룹끼리 비교하면 거부한다', () => {
    expect(() => diffGroups(coffeeFixture(), generalFixture())).toThrow()
  })
  it('기록 추가는 records upsert 한 건만 만든다', () => {
    const { ops, before, after } = edit((g) => ({ ...g, records: [...g.records, { date: '2026-11-19', memberId: 'm3' }] }))
    expect(ops).toHaveLength(1)
    expect(ops[0]).toMatchObject({ kind: 'upsert', table: 'records', row: { date: '2026-11-19', member_id: 'm3' } })
    expect(applied(before, after)).toEqual(after)
  })
  it('기록 삭제와 수정', () => {
    const del = edit((g) => ({ ...g, records: g.records.filter((r) => r.date !== '2026-11-16') }))
    expect(del.ops).toEqual([{ kind: 'delete', table: 'records', groupId: 'g-fix', key: '2026-11-16' }])
    expect(applied(del.before, del.after)).toEqual(del.after)
    const mod = edit((g) => ({ ...g, records: g.records.map((r) => (r.date === '2026-11-16' ? { ...r, memo: '수정' } : r)) }))
    expect(mod.ops).toHaveLength(1)
    expect(applied(mod.before, mod.after)).toEqual(mod.after)
  })
  it('금액을 지우면 payload가 비워진다', () => {
    const { before, after, ops } = edit((g) => ({ ...g, records: g.records.map((r) => (r.date === '2026-11-17' ? { memberId: r.memberId, date: r.date } : r)) }))
    expect(ops).toHaveLength(1)
    expect(applied(before, after).records.find((r) => r.date === '2026-11-17')?.pricing).toBeUndefined()
  })
  it('멤버 추가·수정(기본 메뉴)·삭제', () => {
    const add = edit((g) => ({ ...g, members: [...g.members, { id: 'm4', name: '마루', order: 6 }] }))
    expect(add.ops).toHaveLength(1)
    expect(applied(add.before, add.after)).toEqual(add.after)
    const fav = edit((g) => ({ ...g, members: g.members.map((m) => (m.id === 'm2' ? { ...m, favorite: { menu: '라떼', temp: 'hot' as const } } : m)) }))
    expect(fav.ops).toHaveLength(1)
    expect(applied(fav.before, fav.after)).toEqual(fav.after)
    const del = edit((g) => ({ ...g, members: g.members.filter((m) => m.id !== 'm2') }))
    expect(del.ops).toEqual([{ kind: 'delete', table: 'members', groupId: 'g-fix', key: 'm2' }])
    expect(applied(del.before, del.after)).toEqual(del.after)
  })
  it('멤버 순서 바꾸기는 바뀐 멤버만 upsert한다', () => {
    const { ops, before, after } = edit((g) => ({ ...g, members: g.members.map((m) => (m.id === 'm1' ? { ...m, order: 9 } : m)).sort((a, b) => a.order - b.order) }))
    expect(ops).toHaveLength(1)
    expect(applied(before, after)).toEqual(after)
  })
  it('휴가 추가·삭제, 쉬는 날 추가·삭제', () => {
    const a = edit((g) => ({ ...g, absences: [...g.absences, { id: 'a2', memberId: 'm1', from: '2026-12-01', to: '2026-12-03' }], skipDays: [...g.skipDays, '2026-12-31'] }))
    expect(a.ops.map((o) => (o.kind === 'upsert' ? o.table : o.kind))).toEqual(['absences', 'skip_days'])
    expect(applied(a.before, a.after)).toEqual(a.after)
    const d = edit((g) => ({ ...g, absences: [], skipDays: [] }))
    expect(d.ops).toEqual([
      { kind: 'delete', table: 'absences', groupId: 'g-fix', key: 'a1' },
      { kind: 'delete', table: 'skip_days', groupId: 'g-fix', key: '2026-12-25' },
    ])
    expect(applied(d.before, d.after)).toEqual(d.after)
  })
  it('주문 저장·삭제, 가격표·설정·사용자 메뉴 변경', () => {
    const o = edit((g) => ({ ...g, coffee: { ...g.coffee!, orders: [...g.coffee!.orders, { date: '2026-11-18', updatedAt: 1, items: [{ memberId: 'm1', menu: '라떼', temp: 'hot' as const }] }] } }))
    expect(o.ops).toHaveLength(1)
    expect(applied(o.before, o.after)).toEqual(o.after)
    const od = edit((g) => ({ ...g, coffee: { ...g.coffee!, orders: [] } }))
    expect(od.ops).toEqual([{ kind: 'delete', table: 'orders', groupId: 'g-fix', key: '2026-11-17' }])
    const p = edit((g) => ({ ...g, coffee: { ...g.coffee!, customMenus: ['유자차', '식혜'], settings: { ...g.coffee!.settings, buyerRule: 'count' as const } } }))
    expect(p.ops).toHaveLength(1)
    expect(p.ops[0]).toMatchObject({ kind: 'upsert', table: 'prices' })
    expect(applied(p.before, p.after)).toEqual(p.after)
  })
  it('그룹 이름·이모지·요일 변경은 group 패치 한 건', () => {
    const { ops, before, after } = edit((g) => ({ ...g, name: '새 이름', emoji: '🍵', schedule: 'daily' as const }))
    expect(ops).toEqual([{ kind: 'group', id: 'g-fix', patch: { name: '새 이름', emoji: '🍵', schedule: 'daily' } }])
    expect(applied(before, after)).toEqual(after)
  })
  it('여러 변경을 한꺼번에 해도 적용 결과가 변경 후와 같다', () => {
    const { before, after } = edit((g) => ({
      ...g,
      name: '바뀜',
      members: g.members.filter((m) => m.id !== 'm3'),
      records: g.records.filter((r) => r.date !== '2026-11-17').concat({ date: '2026-11-20', memberId: 'm1', pricing: { mode: 'simple', total: 8000, participants: ['m1', 'm2'] } }),
      absences: [],
      skipDays: ['2026-12-25', '2027-01-01'],
      coffee: { ...g.coffee!, orders: [], priceList: [] },
    }))
    expect(applied(before, after)).toEqual(after)
  })
})

describe('groupToImport (기기 → 서버 옮기기)', () => {
  const seq = () => {
    let n = 0
    return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
  }
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

  it('멤버 id를 모두 uuid로 바꾸고 payload 안의 참조까지 같이 바꾼다', () => {
    const p = groupToImport(coffeeFixture(), 'key-1', seq())
    const text = JSON.stringify(p)
    for (const old of ['"m1"', '"m2"', '"m3"', '"gone"']) expect(text).not.toContain(old)
    expect(p.members.every((m) => UUID.test(m.ref))).toBe(true)
    expect(p.records.every((r) => UUID.test(r.member_ref))).toBe(true)
    // 같은 멤버는 어디서나 같은 uuid
    const m1 = p.members.find((m) => m.name === '가람')!.ref
    expect(p.records[0].member_ref).toBe(m1)
    const detail = p.records[1].payload.pricing!.lines!
    expect(detail[0].memberId).toBe(m1)
    expect(p.records[2].payload.pricing!.participants![0]).toBe(m1)
    expect(p.orders[0].payload.items[0].memberId).toBe(m1)
    expect(p.absences[0].member_ref).toBe(p.members.find((m) => m.name === '다온')!.ref)
  })
  it('탈퇴한 멤버(목록에 없는 id)도 같은 uuid로 일관되게 바뀐다', () => {
    const p = groupToImport(coffeeFixture(), 'k', seq())
    const gone = p.records[2].member_ref
    expect(UUID.test(gone)).toBe(true)
    expect(p.members.some((m) => m.ref === gone)).toBe(false)
    expect(p.records[2].payload.pricing!.participants![1]).toBe(gone)
  })
  it('원본 그룹은 바뀌지 않고, 나머지 값은 그대로다', () => {
    const g = coffeeFixture()
    const copy = structuredClone(g)
    const p = groupToImport(g, 'k', seq())
    expect(g).toEqual(copy)
    expect(p.import_key).toBe('k')
    expect(p.skip_days).toEqual(['2026-12-25'])
    expect(p.prices?.payload.settings.buyerRule).toBe('balance')
    expect(p.config.themeId).toBe(g.config.themeId)
  })
  it('서버 uuid로 바뀐 뒤에도 그룹 값은 id만 다르고 같다', () => {
    const g = coffeeFixture()
    const map = new Map<string, string>()
    const f = seq()
    const mapper = (id: string) => map.get(id) ?? (map.set(id, f()), map.get(id)!)
    expect(remapMemberIds(g, mapper).records.length).toBe(g.records.length)
    const back = remapMemberIds(remapMemberIds(g, mapper), (id) => [...map.entries()].find(([, v]) => v === id)![0])
    expect(back).toEqual(g)
  })
  it('일반 그룹은 prices를 보내지 않는다', () => {
    expect(groupToImport(generalFixture(), 'k', seq()).prices).toBeUndefined()
  })
})
