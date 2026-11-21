import { describe, expect, it } from 'vitest'
import { migrate, serialize } from '../lib/migrate'
import { legacyGroup } from '../lib/testing'
import type { Group, Schedule } from '../types'
import { groupToView, newGroup, sharePrefix, termsOf, withGroupAdded, withGroupEdited } from './groups'
import { forecastBuyers, getNextBuyer, isBusinessDay, nextBusinessDay, type BuyerContext } from './nextBuyer'
import { isScheduledDay, normalizeSchedule, scheduleLabel } from './schedule'
import { buildShareText } from './shareText'
import { configOf, CUSTOM_PRESET_ID, PRESETS, presetById } from './templates'

const members = [
  { id: 'a', name: 'A', order: 1 },
  { id: 'b', name: 'B', order: 2 },
  { id: 'c', name: 'C', order: 3 },
]
const ctx = (schedule?: Schedule, extra: Partial<BuyerContext> = {}): BuyerContext => ({
  members,
  purchases: [],
  absences: [],
  skipDays: [],
  ...(schedule !== undefined ? { schedule } : {}),
  ...extra,
})

// 2026-11-16 = 월, 17 화, 18 수, 19 목, 20 금, 21 토, 22 일
describe('요일(schedule) 판정', () => {
  it('weekdays는 월~금, daily는 매일, 배열은 그 요일만', () => {
    expect(['2026-11-16', '2026-11-20', '2026-11-21', '2026-11-22'].map((d) => isScheduledDay(d, 'weekdays'))).toEqual([true, true, false, false])
    expect(['2026-11-21', '2026-11-22'].map((d) => isScheduledDay(d, 'daily'))).toEqual([true, true])
    expect(['2026-11-18', '2026-11-21', '2026-11-19'].map((d) => isScheduledDay(d, [3, 6]))).toEqual([true, true, false])
  })

  it('schedule이 없으면 평일(기존 동작)', () => {
    expect(isScheduledDay('2026-11-21')).toBe(false)
    expect(isBusinessDay('2026-11-21', [])).toBe(false)
    expect(isBusinessDay('2026-11-16', [])).toBe(true)
  })

  it('검증: 알 수 없는 값·빈 배열·범위 밖 숫자는 평일, 중복은 정리', () => {
    expect(normalizeSchedule(undefined)).toBe('weekdays')
    expect(normalizeSchedule([])).toBe('weekdays')
    expect(normalizeSchedule([9, -1, 'x'])).toBe('weekdays')
    expect(normalizeSchedule('mystery')).toBe('weekdays')
    expect(normalizeSchedule([6, 3, 3])).toEqual([3, 6])
    expect(normalizeSchedule('daily')).toBe('daily')
  })

  it('표기', () => {
    expect(scheduleLabel('weekdays')).toBe('평일')
    expect(scheduleLabel('daily')).toBe('매일')
    expect(scheduleLabel([6, 3])).toBe('수·토')
    expect(scheduleLabel([0, 1])).toBe('월·일')
  })
})

describe('순번이 그룹의 요일을 따른다', () => {
  it('매일: 주말에도 당번이 있고, 순번이 이어진다', () => {
    expect(getNextBuyer('2026-11-21', ctx('daily'))?.id).toBe('a') // 토요일
    const f = forecastBuyers('2026-11-20', 4, ctx('daily'))
    expect(f.map((d) => d.date)).toEqual(['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23'])
    expect(f.map((d) => d.memberId)).toEqual(['a', 'b', 'c', 'a'])
  })

  it('특정 요일([3,6]): 그 요일만 당번, 나머지는 null이고 순번을 소모하지 않는다', () => {
    const c = ctx([3, 6])
    expect(getNextBuyer('2026-11-17', c)).toBeNull() // 화
    expect(getNextBuyer('2026-11-18', c)?.id).toBe('a') // 수
    expect(nextBusinessDay('2026-11-19', c.skipDays, c.schedule)).toBe('2026-11-21') // 목 → 토
    const f = forecastBuyers('2026-11-16', 4, c)
    expect(f.map((d) => d.date)).toEqual(['2026-11-18', '2026-11-21', '2026-11-25', '2026-11-28'])
    expect(f.map((d) => d.memberId)).toEqual(['a', 'b', 'c', 'a'])
  })

  it('요일 + 휴가: 휴가자는 건너뛰고, 요일이 아닌 날의 휴가는 순번에 영향이 없다', () => {
    const c = ctx([3, 6], { absences: [{ id: 'x', memberId: 'a', from: '2026-11-18', to: '2026-11-18' }] })
    expect(getNextBuyer('2026-11-18', c)?.id).toBe('b') // 수요일 a 휴가 → b
    const c2 = ctx([3, 6], { absences: [{ id: 'x', memberId: 'a', from: '2026-11-16', to: '2026-11-17' }] }) // 월·화 휴가(담당 요일 아님)
    expect(getNextBuyer('2026-11-18', c2)?.id).toBe('a')
  })

  it('요일 + 쉬는 날: 쉬는 날은 담당 요일이어도 건너뛴다', () => {
    const c = ctx([3], { skipDays: ['2026-11-18'] })
    expect(nextBusinessDay('2026-11-16', c.skipDays, c.schedule)).toBe('2026-11-25')
    expect(isBusinessDay('2026-11-18', c.skipDays, c.schedule)).toBe(false)
  })

  it('기록이 있는 날은 실제 구매자, 이후는 이어서 예측', () => {
    const c = ctx([3, 6], { purchases: [{ date: '2026-11-18', memberId: 'c' }] })
    const f = forecastBuyers('2026-11-18', 3, c)
    expect(f[0]).toMatchObject({ memberId: 'c', actual: true })
    expect(f[1].memberId).toBe('a') // c가 산 뒤 가장 오래 안 한 a
  })

  it('공유 텍스트도 요일을 따른다', () => {
    const t = buildShareText('2026-11-19', ctx([3, 6]), 1, '🧹 청소')
    expect(t).toBe('🧹 청소 11/21(토) 당번: A / 다음: B')
  })
})

describe('기존 커피 그룹 회귀 (schedule 없음 = 평일)', () => {
  it('schedule을 넘기지 않은 결과와 weekdays를 넘긴 결과가 같다', () => {
    const base = ctx(undefined, { purchases: [{ date: '2026-11-13', memberId: 'a' }] })
    const wk = { ...base, schedule: 'weekdays' as const }
    expect(forecastBuyers('2026-11-14', 8, base)).toEqual(forecastBuyers('2026-11-14', 8, wk))
    expect(getNextBuyer('2026-11-21', base)).toBeNull()
    expect(getNextBuyer('2026-11-21', wk)).toBeNull()
  })
})

describe('템플릿 프리셋', () => {
  it('요청한 9개 프리셋이 있고 id가 겹치지 않는다', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(['coffee', 'lunch', 'notes', 'stage', 'clean', 'recycle', 'dishes', 'walk', CUSTOM_PRESET_ID])
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length)
  })

  it('커피·점심은 money, 나머지는 count. 주문은 커피만', () => {
    expect(PRESETS.filter((p) => p.fairness === 'money').map((p) => p.id)).toEqual(['coffee', 'lunch'])
    expect(PRESETS.filter((p) => p.orders).map((p) => p.id)).toEqual(['coffee'])
  })

  it('점심(money, 주문 없음): 금액 기능은 켜지고 주문 카드는 없다', () => {
    const p = presetById('lunch')
    const g = newGroup('g', { name: p.name, emoji: p.emoji, config: configOf(p), schedule: p.schedule })
    const v = groupToView(g)
    expect(v.template).toBe('coffee') // 금액 기능
    expect(v.hasOrders).toBe(false)
    expect(g.coffee).toBeDefined()
  })

  it('count 템플릿은 금액·주문 데이터가 없다', () => {
    const p = presetById('clean')
    const g = newGroup('g', { name: p.name, emoji: p.emoji, config: configOf(p), schedule: p.schedule })
    expect(g.coffee).toBeUndefined()
    expect(groupToView(g)).toMatchObject({ template: 'general', hasOrders: false })
  })

  it('orders는 money일 때만 켜진다 (직접 만들기에서 count + orders 불가)', () => {
    expect(configOf({ ...presetById('clean'), orders: true }).orders).toBe(false)
  })

  it('그룹에는 복사된 값이 저장된다: 프리셋 객체를 바꿔도 만든 그룹은 변하지 않는다', () => {
    const p = { ...presetById('clean') }
    const g = newGroup('g', { name: p.name, emoji: p.emoji, config: configOf(p), schedule: p.schedule })
    const before = JSON.stringify(g)
    ;(presetById('clean') as { actionLabel: string }).actionLabel = '바뀜' // 상수를 (테스트에서만) 바꿔 본다
    try {
      expect(JSON.stringify(g)).toBe(before)
      expect(g.config.actionLabel).toBe('청소했어요')
    } finally {
      ;(presetById('clean') as { actionLabel: string }).actionLabel = '청소했어요'
    }
  })

  it('버튼 문구가 용어에 반영되고, 커피·기본("했어요")은 지금 문구 그대로', () => {
    expect(termsOf(configOf(presetById('coffee'))).doneBtn).toBe('샀어요')
    expect(termsOf(configOf(presetById('coffee'))).whoSheet).toBe('누가 샀어요?')
    expect(termsOf(configOf(presetById(CUSTOM_PRESET_ID))).whoField).toBe('누가 했나요?')
    const t = termsOf(configOf(presetById('lunch')))
    expect(t.doneBtn).toBe('쐈어요')
    expect(t.otherBtn).toBe('다른 사람이 쐈어요')
    expect(t.whoSheet).toBe('누가 쐈어요?')
  })

  it('공유 머리말: 커피는 ☕, 그 외는 {이모지} {이름}', () => {
    expect(sharePrefix({ config: configOf(presetById('coffee')), emoji: '☕', name: '우리 커피' })).toBe('☕')
    expect(sharePrefix({ config: configOf(presetById('lunch')), emoji: '🍱', name: '점심' })).toBe('🍱 점심')
  })
})

describe('그룹 편집: 요일 변경', () => {
  const root = () => ({ schemaVersion: 4, groups: [legacyGroup('g1', 'general', '청소', '🧹')], updatedAt: 0 })
  it('요일을 바꾸고, 잘못된 값은 평일로 정리한다', () => {
    expect(withGroupEdited(root(), 'g1', { schedule: [5] }, 1).groups[0].schedule).toEqual([5])
    expect(withGroupEdited(root(), 'g1', { schedule: [] }, 1).groups[0].schedule).toBe('weekdays')
    expect(withGroupEdited(root(), 'g1', { name: '새 이름' }, 1).groups[0].schedule).toBe('weekdays') // 안 건드리면 그대로
  })
  it('요일을 바꿔도 기록은 지워지지 않는다', () => {
    const r = root()
    r.groups[0].records = [{ date: '2026-11-21', memberId: 'x' }] // 토요일 기록
    const e = withGroupEdited(r, 'g1', { schedule: [3] }, 1)
    expect(e.groups[0].records).toHaveLength(1)
  })
  it('그룹 추가 후 저장→읽기 왕복이 같다 (요일 배열 포함)', () => {
    const g: Group = { ...legacyGroup('g2', 'general', '발표', '🎤'), schedule: [3, 6] }
    const data = withGroupAdded(root(), g, 2)
    expect(migrate(JSON.parse(serialize(data))).groups[1]).toEqual(g)
  })
})

describe('v3 → v4 마이그레이션', () => {
  const v3 = () => ({
    schemaVersion: 3,
    members: [],
    updatedAt: 777,
    groups: [
      {
        id: 'g-coffee',
        name: '커피',
        template: 'coffee',
        emoji: '☕',
        members: [{ id: 'm1', name: '가', order: 1, favorite: { menu: '라떼', temp: 'hot' } }],
        records: [{ date: '2026-11-02', memberId: 'm1', pricing: { mode: 'simple', total: 5000, participants: ['m1'] } }],
        absences: [{ id: 'a1', memberId: 'm1', from: '2026-11-03', to: '2026-11-04' }],
        skipDays: ['2026-11-05'],
        coffee: {
          orders: [{ date: '2026-11-02', items: [{ memberId: 'm1', menu: '라떼', temp: 'hot' }], updatedAt: 5 }],
          customMenus: ['말차'],
          priceList: [{ cafeBrandId: 'default', menu: '라떼', temp: 'hot', size: '', price: 5000, updatedAt: 1 }],
          settings: { buyerRule: 'balance', defaultPriceMode: 'simple', balanceSince: '2026-11-01' },
        },
      },
      {
        id: 'g-clean',
        name: '청소',
        template: 'general',
        emoji: '🧹',
        members: [{ id: 'x', name: '나', order: 1 }],
        records: [{ date: '2026-11-02', memberId: 'x' }],
        absences: [],
        skipDays: [],
      },
    ],
  })

  it('모든 그룹이 평일이 되고, 커피는 커피 설정·일반은 순번 기본 설정을 받는다 (template 필드는 사라짐)', () => {
    const out = migrate(v3(), 1)
    expect(out.schemaVersion).toBe(4)
    expect(out.groups.map((g) => g.schedule)).toEqual(['weekdays', 'weekdays'])
    expect(out.groups[0].config).toEqual({
      presetId: 'coffee',
      actionLabel: '샀어요',
      fairness: 'money',
      orders: true,
      memoPlaceholder: '예) 아아 6잔, 디저트 포함',
      shareFormat: '☕',
      themeId: 'coffee',
    })
    expect(out.groups[1].config).toMatchObject({ presetId: 'custom', actionLabel: '했어요', fairness: 'count', orders: false, themeId: 'coffee' })
    expect('template' in out.groups[0]).toBe(false)
    expect(out.updatedAt).toBe(777)
  })

  it('멤버·기록·금액·휴가·쉬는 날·주문·가격표·메뉴·설정이 값 그대로 보존된다', () => {
    const raw = v3()
    const snap = JSON.stringify(raw)
    const out = migrate(raw, 1)
    const [c, g] = out.groups
    expect(c.members).toEqual(raw.groups[0].members)
    expect(c.records).toEqual(raw.groups[0].records)
    expect(c.absences).toEqual(raw.groups[0].absences)
    expect(c.skipDays).toEqual(raw.groups[0].skipDays)
    expect(c.coffee).toEqual(raw.groups[0].coffee)
    expect(g.members).toEqual(raw.groups[1].members)
    expect(g.records).toEqual(raw.groups[1].records)
    expect(g.coffee).toBeUndefined()
    expect(JSON.stringify(raw)).toBe(snap) // 입력은 건드리지 않는다
  })

  it('몇 번을 옮겨도 결과가 같다 (멱등)', () => {
    const once = migrate(v3(), 1)
    const again = migrate(JSON.parse(serialize(once)), 2)
    expect(again).toEqual(once)
  })

  it('v1·v2 데이터도 단계를 거쳐 v4가 된다 (커피 그룹, 평일)', () => {
    const out = migrate({ members: [{ id: 'a', name: '가', order: 1 }], purchases: [{ date: '2026-11-02', memberId: 'a' }], absences: [], skipDays: [] }, 5)
    expect(out.schemaVersion).toBe(4)
    expect(out.groups[0]).toMatchObject({ id: 'g-coffee', schedule: 'weekdays' })
    expect(out.groups[0].config.presetId).toBe('coffee')
  })

  it('저장 JSON에는 옛 앱 보호용 빈 members 표식이 남는다', () => {
    expect(JSON.parse(serialize(migrate(v3(), 1))).members).toEqual([])
  })

  it('v5 이상은 읽지 않는다', () => {
    expect(() => migrate({ schemaVersion: 5, groups: [] })).toThrow(/업데이트/)
  })
})
