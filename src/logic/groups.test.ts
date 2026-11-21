import { describe, expect, it } from 'vitest'
import { migrate, serialize } from '../lib/migrate'
import type { AppData, Group } from '../types'
import {
  applyView,
  COFFEE_GROUP_ID,
  groupToView,
  normalizeName,
  planAbsenceAll,
  sharePrefix,
  TERMS,
  updateGroupView,
  withAbsencesAdded,
  withAbsencesRemoved,
  withGroupAdded,
  withGroupEdited,
  withGroupRemoved,
  withGroupRestored,
} from './groups'
import { legacyGroup } from '../lib/testing'
import { getNextBuyer } from './nextBuyer'
import { buildShareText } from './shareText'

/* ───────── 이전 버전(v1, v2) 데이터 ───────── */
const v1 = () => ({
  members: [
    { id: 'm1', name: '가', order: 1, color: '#C8553D', emoji: '☕' },
    { id: 'm2', name: '나', order: 3 },
  ],
  purchases: [
    { date: '2026-11-02', memberId: 'm1' },
    { date: '2026-11-03', memberId: 'gone', memo: '탈퇴한 멤버의 기록' },
  ],
  absences: [
    { id: 'a1', memberId: 'm1', from: '2026-11-10', to: '2026-11-12' },
    { id: 'a2', memberId: 'gone', from: '2026-11-05', to: '2026-11-05' },
  ],
  skipDays: ['2026-12-25', '2026-11-26'],
})
const v2 = () => ({
  schemaVersion: 2,
  members: [
    { id: 'm1', name: '가', order: 1, color: '#C8553D', emoji: '☕', favorite: { menu: '아메리카노', temp: 'ice', size: 'L', shot: 1, memo: '연하게' } },
    { id: 'm2', name: '나', order: 2 },
  ],
  purchases: [
    { date: '2026-11-02', memberId: 'm1', pricing: { mode: 'detail', total: 9000, lines: [{ memberId: 'm1', menu: '아메리카노', temp: 'ice', size: 'L', price: 4500 }] } },
    { date: '2026-11-03', memberId: 'm2', memo: '메모', pricing: { mode: 'simple', total: 6000, participants: ['m1', 'm2'] } },
    { date: '2026-11-04', memberId: 'm1' }, // 금액 없음
  ],
  absences: [{ id: 'a1', memberId: 'm2', from: '2026-11-10', to: '2026-11-11' }],
  skipDays: ['2026-11-26'],
  orders: [{ date: '2026-11-02', items: [{ memberId: 'm1', menu: '아메리카노', temp: 'ice' }, { memberId: 'm2', menu: '안 마심', temp: 'ice', skipped: true }], updatedAt: 7 }],
  customMenus: ['유자차'],
  priceList: [{ cafeBrandId: 'default', menu: '아메리카노', temp: 'ice', size: 'L', price: 4500, updatedAt: 3 }],
  settings: { buyerRule: 'balance', defaultPriceMode: 'simple', balanceSince: '2026-11-01' },
  updatedAt: 4242,
})

const coffeeOf = (d: AppData) => d.groups[0]

describe('v1 → v3: 기존 데이터는 "커피" 그룹 하나로', () => {
  it('멤버·기록·휴가·쉬는 날이 값 그대로 커피 그룹에 들어간다', () => {
    const raw = v1()
    const out = migrate(raw, 99)
    expect(out.schemaVersion).toBe(4)
    expect(out.groups).toHaveLength(1)
    const g = coffeeOf(out)
    expect(g).toMatchObject({ id: COFFEE_GROUP_ID, name: '커피', emoji: '☕', schedule: 'weekdays' })
    expect(g.config).toMatchObject({ presetId: 'coffee', fairness: 'money', orders: true, actionLabel: '샀어요', themeId: 'coffee' })
    expect(g.members).toEqual(raw.members) // 순서 값(1, 3)도 그대로
    expect(g.records).toEqual(raw.purchases) // 탈퇴한 멤버의 기록도 보존
    expect(g.absences).toEqual(raw.absences) // 탈퇴한 멤버의 휴가도 보존
    expect(g.skipDays).toEqual(['2026-11-26', '2026-12-25'])
    expect(g.coffee).toEqual({ orders: [], customMenus: [], priceList: [], settings: { buyerRule: 'count', defaultPriceMode: 'none' } })
    expect(out.updatedAt).toBe(99)
  })
})

describe('v2 → v3: 기록·주문·금액·가격표·설정이 하나도 사라지지 않는다', () => {
  it('v2의 모든 필드가 커피 그룹으로 값까지 그대로 이동한다', () => {
    const raw = v2()
    const out = migrate(raw)
    const g = coffeeOf(out)
    expect(out.groups).toHaveLength(1)
    expect(g.id).toBe(COFFEE_GROUP_ID)
    expect(g.members).toEqual(raw.members) // favorite 포함
    expect(g.records).toEqual(raw.purchases) // pricing 포함
    expect(g.records.filter((r) => r.pricing)).toHaveLength(2)
    expect(g.records.filter((r) => !r.pricing)).toHaveLength(1) // 금액 없음은 그대로
    expect(g.absences).toEqual(raw.absences)
    expect(g.skipDays).toEqual(raw.skipDays)
    expect(g.coffee!.orders).toEqual(raw.orders)
    expect(g.coffee!.customMenus).toEqual(raw.customMenus)
    expect(g.coffee!.priceList).toEqual(raw.priceList)
    expect(g.coffee!.settings).toEqual(raw.settings) // balanceSince 포함
    expect(out.updatedAt).toBe(4242)
  })

  it('몇 번을 옮기고 직렬화해도 결과가 같다 (멱등, 고정 그룹 id)', () => {
    const once = migrate(v2())
    expect(migrate(JSON.parse(serialize(once)))).toEqual(once)
    expect(migrate(v2())).toEqual(once) // 같은 입력은 항상 같은 그룹 id
    expect(coffeeOf(migrate(v1())).id).toBe(coffeeOf(once).id) // v1·v2 모두 같은 id
  })

  it('입력 객체를 변경하지 않는다', () => {
    const raw = v2()
    const snap = JSON.stringify(raw)
    migrate(raw)
    expect(JSON.stringify(raw)).toBe(snap)
  })
})

describe('v3 검증', () => {
  const g = (over: Record<string, unknown> = {}) => ({
    id: 'g1',
    name: '청소',
    config: { presetId: 'custom', actionLabel: '했어요', fairness: 'count', orders: false, themeId: 'coffee' },
    schedule: 'weekdays',
    emoji: '🧹',
    members: [{ id: 'a', name: '가', order: 1 }],
    records: [{ date: '2026-11-02', memberId: 'a' }],
    absences: [],
    skipDays: [],
    ...over,
  })
  const root = (groups: unknown[]) => ({ schemaVersion: 4, groups, updatedAt: 1 })

  it('여러 그룹을 읽고 멤버·기록은 그룹마다 따로 유지된다', () => {
    const out = migrate(root([g(), g({ id: 'g2', name: '점심', members: [{ id: 'a', name: '다', order: 1 }], records: [] })]))
    expect(out.groups.map((x) => x.name)).toEqual(['청소', '점심'])
    expect(out.groups[0].members[0].name).toBe('가')
    expect(out.groups[1].members[0].name).toBe('다') // 같은 멤버 id여도 그룹마다 별개
    expect(out.groups[0].records).toHaveLength(1)
    expect(out.groups[1].records).toHaveLength(0)
  })

  it('일반 그룹에는 커피 전용 데이터가 없다', () => {
    const out = migrate(root([g({ coffee: { orders: [{ date: '2026-11-02', items: [] }], priceList: [{ menu: 'x', price: 1 }] } })]))
    expect(out.groups[0].coffee).toBeUndefined()
  })

  it('알려지지 않은 설정은 순번만 쓰는 기본값으로, 이름·이모지가 없으면 기본값', () => {
    const out = migrate(root([g({ config: { fairness: 'mystery', orders: true, themeId: 'neon' }, schedule: 'mystery', name: undefined, emoji: undefined })]))
    expect(out.groups[0]).toMatchObject({ name: '그룹', emoji: '✨', schedule: 'weekdays' })
    expect(out.groups[0].config).toMatchObject({ fairness: 'count', orders: false, themeId: 'coffee', actionLabel: '했어요' })
    expect(out.groups[0].coffee).toBeUndefined()
  })

  it('그룹 id가 겹치거나 없으면 새로 만들어 서로 구분한다', () => {
    const out = migrate(root([g(), g({ name: '점심' }), g({ id: undefined, name: '발표' })]))
    expect(new Set(out.groups.map((x) => x.id)).size).toBe(3)
  })

  it('그룹이 하나도 없거나 형식이 틀리면 오류, 미래 버전은 FutureVersionError', () => {
    expect(() => migrate(root([]))).toThrow()
    expect(() => migrate(root([null, 5]))).toThrow()
    expect(() => migrate({ schemaVersion: 4 })).toThrow()
    expect(() => migrate({ schemaVersion: 5, groups: [] })).toThrow(/업데이트/)
  })

  it('직렬화한 결과를 다시 읽으면 같다 (표식 members는 읽지 않는다)', () => {
    const data = migrate(root([g(), g({ id: 'g2', name: '점심' })]))
    const text = serialize(data)
    expect(JSON.parse(text).members).toEqual([])
    expect(migrate(JSON.parse(text))).toEqual(data)
  })
})

describe('그룹 보기 (groupToView / applyView)', () => {
  const coffee = (): Group => coffeeOf(migrate(v2()))
  const general = (): Group => ({ ...legacyGroup('g2', 'general', '청소', '🧹'), members: [{ id: 'x', name: '가', order: 1 }] })

  it('커피 그룹의 보기는 v2까지의 데이터와 같은 모양이다', () => {
    const v = groupToView(coffee())
    expect(v.purchases).toEqual(v2().purchases)
    expect(v.orders).toEqual(v2().orders)
    expect(v.priceList).toEqual(v2().priceList)
    expect(v.settings).toEqual(v2().settings)
    expect(v.template).toBe('coffee')
  })

  it('보기를 되돌려 써도 그룹이 그대로다 (이름·이모지·템플릿은 보기로 바뀌지 않는다)', () => {
    expect(applyView(coffee(), groupToView(coffee()))).toEqual(coffee())
    expect(applyView(general(), groupToView(general()))).toEqual(general())
    const renamed = applyView(coffee(), { ...groupToView(coffee()), name: '해킹', template: 'general', emoji: 'X' })
    expect(renamed).toMatchObject({ name: '커피', emoji: '☕' })
    expect(renamed.config.fairness).toBe('money')
  })

  it('일반 그룹: 주문·금액·가격표는 빈 기본값이고, 보기를 써도 커피 데이터가 생기지 않는다', () => {
    const v = groupToView(general())
    expect(v).toMatchObject({ orders: [], customMenus: [], priceList: [], settings: { buyerRule: 'count', defaultPriceMode: 'none' } })
    const written = applyView(general(), { ...v, orders: [{ date: '2026-11-02', items: [], updatedAt: 1 }], priceList: [{ cafeBrandId: 'default', menu: 'x', temp: 'ice', size: '', price: 1, updatedAt: 1 }] })
    expect(written.coffee).toBeUndefined()
  })

  it('일반 그룹도 순번 로직(nextBuyer)을 그대로 쓴다 — 횟수 기준으로만 동작', () => {
    const g: Group = {
      ...general(),
      members: [
        { id: 'a', name: 'A', order: 1 },
        { id: 'b', name: 'B', order: 2 },
        { id: 'c', name: 'C', order: 3 },
      ],
      records: [
        { date: '2026-11-02', memberId: 'a' },
        { date: '2026-11-03', memberId: 'b' },
      ],
    }
    expect(getNextBuyer('2026-11-04', groupToView(g))?.id).toBe('c') // 한 번도 안 한 사람
    expect(getNextBuyer('2026-11-04', groupToView({ ...g, absences: [{ id: 'x', memberId: 'c', from: '2026-11-04', to: '2026-11-04' }] }))?.id).toBe('a')
  })

  it('한 그룹의 변경은 다른 그룹에 영향을 주지 않는다', () => {
    let r: AppData = withGroupAdded(migrate(v2()), general(), 1)
    r = updateGroupView(r, 'g2', (v) => ({ ...v, purchases: [{ date: '2026-11-09', memberId: 'x' }] }), 2)
    expect(r.groups[1].records).toHaveLength(1)
    expect(r.groups[0].records).toEqual(v2().purchases)
    expect(r.updatedAt).toBe(2)
    // 존재하지 않는 그룹(이미 삭제됨)에 대한 지연된 변경(되돌리기 등)은 아무 일도 하지 않는다
    expect(updateGroupView(r, 'gone', (v) => ({ ...v, purchases: [] }), 3)).toBe(r)
  })
})

describe('그룹 추가 · 이름 변경 · 삭제', () => {
  const base = (): AppData => migrate(v2())
  const clean = () => legacyGroup('g2', 'general', '청소', '🧹')

  it('추가: 기존 그룹은 그대로, 새 그룹은 빈 상태 (일반은 커피 데이터 없음, 커피는 빈 기본값)', () => {
    const r = withGroupAdded(base(), clean(), 5)
    expect(r.groups.map((g) => g.name)).toEqual(['커피', '청소'])
    expect(r.groups[1]).toMatchObject({ members: [], records: [], absences: [], skipDays: [] })
    expect(r.groups[1].coffee).toBeUndefined()
    expect(r.groups[0]).toEqual(base().groups[0])
    expect(legacyGroup('g3', 'coffee', '팀 커피', '☕').coffee).toEqual({ orders: [], customMenus: [], priceList: [], settings: { buyerRule: 'count', defaultPriceMode: 'none' } })
  })

  it('이름·이모지 변경: 빈 이름은 무시하고 템플릿·내용은 그대로', () => {
    const r = withGroupAdded(base(), clean(), 1)
    const edited = withGroupEdited(r, 'g2', { name: '  회의록  ', emoji: '📝' }, 2)
    expect(edited.groups[1]).toMatchObject({ name: '회의록', emoji: '📝' })
    expect(edited.groups[1].config.fairness).toBe('count')
    expect(withGroupEdited(edited, 'g2', { name: '   ' }, 3).groups[1].name).toBe('회의록')
    expect(withGroupEdited(edited, 'g2', { emoji: '' }, 3).groups[1].emoji).toBe('📝')
    expect(edited.groups[0]).toEqual(base().groups[0])
  })

  it('삭제: 해당 그룹만 사라지고 되돌리면 원래 자리로 돌아온다', () => {
    let r = withGroupAdded(base(), clean(), 1)
    r = withGroupAdded(r, legacyGroup('g3', 'general', '점심', '🍱'), 1)
    const res = withGroupRemoved(r, 'g2', 2)!
    expect(res.root.groups.map((g) => g.name)).toEqual(['커피', '점심'])
    expect(res.index).toBe(1)
    const back = withGroupRestored(res.root, res.removed, res.index, 3)
    expect(back.groups.map((g) => g.name)).toEqual(['커피', '청소', '점심'])
    expect(withGroupRestored(back, res.removed, res.index)).toBe(back) // 이미 있으면 그대로
  })

  it('마지막 그룹과 없는 그룹은 삭제할 수 없다', () => {
    expect(withGroupRemoved(base(), COFFEE_GROUP_ID)).toBeNull()
    expect(withGroupRemoved(withGroupAdded(base(), clean()), 'nope')).toBeNull()
  })

  it('커피 그룹을 삭제해도 다른 그룹은 영향 없고, 되돌리면 기록·주문·가격표가 그대로 돌아온다', () => {
    const r = withGroupAdded(base(), clean(), 1)
    const res = withGroupRemoved(r, COFFEE_GROUP_ID, 2)!
    expect(res.root.groups).toHaveLength(1)
    const back = withGroupRestored(res.root, res.removed, res.index, 3)
    expect(back.groups[0]).toEqual(base().groups[0])
  })
})

describe('휴가 "모든 그룹에 적용" (이름 일치)', () => {
  let n = 0
  const mkId = () => `id${++n}`
  const grp = (id: string, names: string[], absences: Group['absences'] = []): Group => ({
    ...legacyGroup(id, 'general', id, '🧹'),
    members: names.map((name, i) => ({ id: `${id}-${i}`, name, order: i + 1 })),
    absences,
  })
  const root = (...groups: Group[]): AppData => ({ schemaVersion: 3, groups, updatedAt: 0 })

  it('이름이 같은 멤버가 있는 모든 그룹에 등록하고, 없는 그룹은 건너뛴다', () => {
    const r = root(grp('a', ['김철수', '이영희']), grp('b', ['이영희', '박민수']), grp('c', ['박민수']))
    const plan = planAbsenceAll(r, 'a', 'a-1', '2026-11-10', '2026-11-12', mkId)
    expect(plan.items.map((i) => [i.groupId, i.absence.memberId])).toEqual([['a', 'a-1'], ['b', 'b-0']])
    expect(plan.noMatch).toBe(1) // c에는 이영희가 없다
    expect(plan.ambiguous).toBe(0)
    expect(plan.items.every((i) => i.absence.from === '2026-11-10' && i.absence.to === '2026-11-12')).toBe(true)
  })

  it('앞뒤 공백은 무시하고 비교한다', () => {
    const r = root(grp('a', ['김철수']), grp('b', ['  김철수 ']))
    expect(planAbsenceAll(r, 'a', 'a-0', '2026-11-10', '2026-11-10', mkId).items).toHaveLength(2)
    expect(normalizeName(' 가 ')).toBe('가')
  })

  it('같은 이름이 한 그룹에 둘 이상이면 오적용을 막으려고 건너뛴다', () => {
    const r = root(grp('a', ['김철수']), grp('b', ['김철수', '김철수']))
    const plan = planAbsenceAll(r, 'a', 'a-0', '2026-11-10', '2026-11-10', mkId)
    expect(plan.items.map((i) => i.groupId)).toEqual(['a'])
    expect(plan.ambiguous).toBe(1)
  })

  it('이미 같은 휴가가 있으면 중복으로 만들지 않고, 시작·종료가 뒤집혀도 정규화', () => {
    const exists = [{ id: 'x', memberId: 'b-0', from: '2026-11-10', to: '2026-11-12' }]
    const r = root(grp('a', ['가']), grp('b', ['가'], exists))
    const plan = planAbsenceAll(r, 'a', 'a-0', '2026-11-12', '2026-11-10', mkId)
    expect(plan.items.map((i) => i.groupId)).toEqual(['a'])
    expect(plan.items[0].absence).toMatchObject({ from: '2026-11-10', to: '2026-11-12' })
  })

  it('적용과 되돌리기: 등록한 것만 정확히 지운다', () => {
    const own = [{ id: 'keep', memberId: 'b-0', from: '2026-10-01', to: '2026-10-02' }]
    const r = root(grp('a', ['가']), grp('b', ['가'], own))
    const plan = planAbsenceAll(r, 'a', 'a-0', '2026-11-10', '2026-11-10', mkId)
    const applied = withAbsencesAdded(r, plan.items, 1)
    expect(applied.groups[0].absences).toHaveLength(1)
    expect(applied.groups[1].absences).toHaveLength(2)
    const undone = withAbsencesRemoved(applied, new Set(plan.items.map((i) => i.absence.id)), 2)
    expect(undone.groups[0].absences).toEqual([])
    expect(undone.groups[1].absences).toEqual(own)
  })

  it('원본 멤버가 없으면 아무것도 만들지 않는다', () => {
    expect(planAbsenceAll(root(grp('a', ['가'])), 'a', 'nope', '2026-11-10', '2026-11-10', mkId).items).toEqual([])
  })
})

describe('용어와 공유 텍스트', () => {
  it('커피 그룹은 지금 문구 그대로 (그룹이 하나뿐이면 화면이 똑같다)', () => {
    const t = TERMS.coffee
    expect(t).toMatchObject({
      heroEyebrow: "TODAY'S BREW",
      doneBtn: '샀어요',
      otherBtn: '다른 사람이 샀어요',
      doneBadge: '오늘 구매 완료',
      lastLabel: '마지막 구매',
      never: '아직 한 번도 안 샀어요',
      changeBuyer: '구매자 변경',
      whoSheet: '누가 샀어요?',
      changeSheet: '구매자를 바꿀까요?',
      recordNoun: '구매 기록',
      kingTitle: '이번 달 커피왕 👑',
      countTitle: '1인당 구매 횟수',
    })
    expect(t.kingCount(3)).toBe('3번 샀어요')
  })

  it('일반 그룹은 [샀어요] 대신 [했어요]', () => {
    expect(TERMS.general.doneBtn).toBe('했어요')
    expect(TERMS.general.otherBtn).toBe('다른 사람이 했어요')
    expect(TERMS.general.kingCount(2)).toBe('2번 했어요')
  })

  it('공유 텍스트: 커피는 ☕ 그대로, 일반은 그룹 이모지와 이름', () => {
    const members = [
      { id: 'a', name: 'A', order: 1 },
      { id: 'b', name: 'B', order: 2 },
      { id: 'c', name: 'C', order: 3 },
    ]
    const ctx = { members, purchases: [], absences: [], skipDays: [] }
    expect(buildShareText('2026-11-17', ctx)).toBe('☕ 11/17(화) 당번: A / 다음: B, C')
    expect(sharePrefix({ config: legacyGroup('x', 'coffee', '커피', '☕').config, emoji: '☕', name: '커피' })).toBe('☕')
    const g = { config: legacyGroup('x', 'general', '청소', '🧹').config, emoji: '🧹', name: '청소' }
    expect(buildShareText('2026-11-17', ctx, 2, sharePrefix(g))).toBe('🧹 청소 11/17(화) 당번: A / 다음: B, C')
  })
})
