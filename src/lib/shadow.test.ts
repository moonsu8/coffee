import { describe, expect, it } from 'vitest'
import {
  applyRecovery,
  EMPTY_DATA,
  isOverwrittenByOldApp,
  KEY,
  loadInitialData,
  readShadow,
  restoreLastGood,
  RESTORE_BACKUP_KEY,
  saveData,
  SHADOW_KEY,
  SHADOW_PREV_KEY,
  type StorageLike,
} from './data'
import { formatSavedAt } from './format'
import { migrate } from './migrate'
import type { AppData } from '../types'

class MemoryStorage implements StorageLike {
  map = new Map<string, string>()
  getItem(k: string) {
    return this.map.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.map.set(k, v)
  }
  removeItem(k: string) {
    this.map.delete(k)
  }
}
/** 특정 키 쓰기가 실패하는 저장소 (공간 부족 흉내) */
class FailingStorage extends MemoryStorage {
  constructor(private failKey: string) {
    super()
  }
  setItem(k: string, v: string) {
    if (k === this.failKey) throw new Error('QuotaExceededError')
    super.setItem(k, v)
  }
}

// 새 버전이 저장하는 v2 데이터 (옛 앱이 모르는 필드를 모두 갖고 있음)
const v2 = (updatedAt = 1_000): AppData =>
  migrate({
    schemaVersion: 2,
    members: [
      { id: 'm1', name: '가', order: 1, color: '#C8553D', emoji: '☕', favorite: { menu: '아메리카노', temp: 'ice' } },
      { id: 'm2', name: '나', order: 2 },
    ],
    purchases: [
      { date: '2026-11-02', memberId: 'm1', pricing: { mode: 'simple', total: 6000, participants: ['m1', 'm2'] } },
      { date: '2026-11-03', memberId: 'm2', memo: '메모' },
    ],
    absences: [],
    skipDays: [],
    orders: [{ date: '2026-11-02', items: [{ memberId: 'm1', menu: '아메리카노', temp: 'ice' }], updatedAt: 1 }],
    customMenus: ['유자차'],
    priceList: [{ menu: '아메리카노', temp: 'ice', size: '', price: 4500, updatedAt: 1 }],
    settings: { buyerRule: 'balance', defaultPriceMode: 'detail', balanceSince: '2026-11-01' },
    updatedAt,
  })

/** 옛 버전 앱(42cb18e)이 하는 일: 아는 필드만 남기고 v1 모양으로 메인을 다시 쓴다 */
function oldAppRewrites(storage: MemoryStorage) {
  const j = JSON.parse(storage.getItem(KEY)!)
  storage.setItem(
    KEY,
    JSON.stringify({
      members: j.members.map((m: Record<string, unknown>) => ({ id: m.id, name: m.name, order: m.order, color: m.color, emoji: m.emoji })),
      purchases: j.purchases.map((p: Record<string, unknown>) => ({ date: p.date, memberId: p.memberId, memo: p.memo })),
      absences: j.absences,
      skipDays: j.skipDays,
    }),
  )
}

const initial = async () => EMPTY_DATA

describe('shadow 저장', () => {
  it('저장할 때마다 메인과 shadow에 같은 전체 데이터(updatedAt 포함)를 쓴다', () => {
    const st = new MemoryStorage()
    saveData(v2(1234), st)
    expect(st.getItem(SHADOW_KEY)).toBe(st.getItem(KEY))
    const shadow = readShadow(st)!
    expect(shadow.savedAt).toBe(1234)
    expect(shadow.data.priceList).toHaveLength(1)
    expect(shadow.data.purchases[0].pricing).toBeDefined()
  })

  it('저장 후 정상적으로 다시 열면 복구 질문이 없다', async () => {
    const st = new MemoryStorage()
    saveData(v2(), st)
    const r = await loadInitialData(st, initial)
    expect(r.recovery).toBeUndefined()
    expect(r.data.orders).toHaveLength(1)
  })

  it('두 번째 저장이 shadow를 최신으로 갱신한다', () => {
    const st = new MemoryStorage()
    saveData(v2(1000), st)
    saveData(v2(2000), st)
    expect(readShadow(st)!.savedAt).toBe(2000)
  })

  it('shadow 쓰기가 실패해도 메인 저장은 된다', () => {
    const st = new FailingStorage(SHADOW_KEY)
    saveData(v2(), st)
    expect(st.getItem(KEY)).not.toBeNull()
  })
})

describe('옛 버전 앱의 덮어쓰기 감지', () => {
  it('v1 모양의 메인 + 더 최신 v2 shadow → 복구 질문(자동 적용 없음, 저장소 변경 없음)', async () => {
    const st = new MemoryStorage()
    saveData(v2(1000), st)
    oldAppRewrites(st)
    const mainBefore = st.getItem(KEY)
    const shadowBefore = st.getItem(SHADOW_KEY)

    const r = await loadInitialData(st, initial)

    expect(r.recovery).toBeDefined()
    expect(r.recovery!.savedAt).toBe(1000)
    expect(r.recovery!.shadow.priceList).toHaveLength(1) // 지워진 필드가 shadow에는 남아 있다
    expect(r.recovery!.shadow.orders).toHaveLength(1)
    // 지금 화면용 데이터는 메인을 정상 마이그레이션한 것 (병합하지 않는다)
    expect(r.data.members).toHaveLength(2)
    expect(r.data.orders).toEqual([])
    expect(r.data.purchases.every((p) => !p.pricing)).toBe(true)
    // 묻는 동안 아무것도 바꾸지 않는다
    expect(st.getItem(KEY)).toBe(mainBefore)
    expect(st.getItem(SHADOW_KEY)).toBe(shadowBefore)
  })

  it('판단 함수: 옛 메인 + 최신 v2 shadow일 때만 true', () => {
    const shadow = { data: v2(1000), savedAt: 1000, raw: '' }
    const old = { members: [], purchases: [] }
    expect(isOverwrittenByOldApp(old, shadow)).toBe(true)
    expect(isOverwrittenByOldApp({ ...old, schemaVersion: 2 }, shadow)).toBe(false) // 메인이 v2면 정상
    expect(isOverwrittenByOldApp({ ...old, updatedAt: 5000 }, shadow)).toBe(false) // 메인이 더 최신
    expect(isOverwrittenByOldApp(old, null)).toBe(false)
    expect(isOverwrittenByOldApp(old, { ...shadow, savedAt: 0 })).toBe(false) // 더 최신이 아님
  })

  it('진짜 v1 메인 + shadow 없음(첫 업그레이드)은 질문 없이 정상 마이그레이션, 원본은 한 번 보관', async () => {
    const st = new MemoryStorage()
    const v1 = JSON.stringify({ members: [{ id: 'm1', name: '가', order: 1 }], purchases: [], absences: [], skipDays: [] })
    st.setItem(KEY, v1)
    const r = await loadInitialData(st, initial)
    expect(r.recovery).toBeUndefined()
    expect(r.data.members).toHaveLength(1)
    expect(st.getItem('coffee-duty:backup-before-v2')).toBe(v1)
  })

  it('메인이 읽을 수 없고 정상 shadow가 있으면, 초기 데이터로 덮어쓰기 전에 물어본다', async () => {
    const st = new MemoryStorage()
    saveData(v2(1000), st)
    st.setItem(KEY, '{깨진 json')
    const r = await loadInitialData(st, initial)
    expect(r.recovery?.savedAt).toBe(1000)
    expect(st.getItem('coffee-duty:corrupt-backup')).toBe('{깨진 json')
    expect(st.getItem(SHADOW_KEY)).not.toBeNull() // shadow는 그대로
  })
})

describe('되돌리기 / 그대로 두기', () => {
  async function overwritten() {
    const st = new MemoryStorage()
    const original = v2(1000)
    saveData(original, st)
    oldAppRewrites(st)
    const oldMain = st.getItem(KEY)!
    const loaded = await loadInitialData(st, initial)
    return { st, original, oldMain, loaded }
  }

  it('되돌리기: shadow 전체가 메인으로 복원되고, 되돌리기 전 메인은 백업으로 남는다', async () => {
    const { st, original, oldMain, loaded } = await overwritten()
    const r = applyRecovery('restore', loaded.recovery!, loaded.data, st)
    expect(r.ok).toBe(true)
    expect(r.data).toEqual(original)
    expect(st.getItem(RESTORE_BACKUP_KEY)).toBe(oldMain)

    saveData(r.data, st) // 앱이 이어서 저장
    expect(JSON.parse(st.getItem(KEY)!)).toEqual(JSON.parse(JSON.stringify(original)))
    const again = await loadInitialData(st, initial)
    expect(again.recovery).toBeUndefined()
    expect(again.data.priceList).toHaveLength(1)
    expect(again.data.purchases[0].pricing?.total).toBe(6000)
    expect(again.data.members[0].favorite?.menu).toBe('아메리카노')
  })

  it('그대로 두기: 메인은 정상 마이그레이션, 이전 shadow는 shadow-prev에 보관(덮어쓰지 않음)', async () => {
    const { st, loaded } = await overwritten()
    const shadowRaw = loaded.recovery!.shadowRaw
    const r = applyRecovery('keep', loaded.recovery!, loaded.data, st)
    expect(r.ok).toBe(true)
    expect(st.getItem(SHADOW_PREV_KEY)).toBe(shadowRaw)

    saveData(r.data, st) // 이후 저장은 shadow를 새 상태로 갱신
    expect(st.getItem(SHADOW_PREV_KEY)).toBe(shadowRaw) // 보관본은 그대로
    expect(readShadow(st)!.data.orders).toEqual([]) // shadow는 지금 상태
    expect(JSON.parse(st.getItem(KEY)!).schemaVersion).toBe(2)
    expect((await loadInitialData(st, initial)).recovery).toBeUndefined()
    expect(readShadow(st, SHADOW_PREV_KEY)!.data.priceList).toHaveLength(1) // 정상 상태였던 데이터는 살아 있다
  })

  it('보관에 실패하면 선택을 확정하지 않는다(ok=false)', async () => {
    const { st, loaded } = await overwritten()
    const keepFail = Object.assign(new FailingStorage(SHADOW_PREV_KEY), { map: st.map })
    expect(applyRecovery('keep', loaded.recovery!, loaded.data, keepFail).ok).toBe(false)
    const restoreFail = Object.assign(new FailingStorage(RESTORE_BACKUP_KEY), { map: st.map })
    expect(applyRecovery('restore', loaded.recovery!, loaded.data, restoreFail).ok).toBe(false)
  })
})

describe('shadow가 없거나 깨졌을 때는 무시', () => {
  const oldMain = JSON.stringify({ members: [{ id: 'm1', name: '가', order: 1 }], purchases: [], absences: [], skipDays: [] })
  const cases: [string, string | null][] = [
    ['없음', null],
    ['깨진 JSON', '{not json'],
    ['빈 문자열', ''],
    ['객체가 아님', '123'],
    ['v1 모양(schemaVersion 없음)', oldMain],
    ['더 새로운 버전(v3)', JSON.stringify({ schemaVersion: 3, members: [] })],
    ['members가 없음', JSON.stringify({ schemaVersion: 2 })],
  ]
  for (const [name, shadow] of cases) {
    it(`shadow ${name}: 질문 없이 정상 마이그레이션`, async () => {
      const st = new MemoryStorage()
      st.setItem(KEY, oldMain)
      if (shadow !== null) st.setItem(SHADOW_KEY, shadow)
      expect(readShadow(st)).toBeNull()
      const r = await loadInitialData(st, initial)
      expect(r.recovery).toBeUndefined()
      expect(r.data.members).toHaveLength(1)
    })
  }

  it('메인이 읽을 수 없고 shadow도 없으면 초기 데이터 (원본은 corrupt-backup에 보관)', async () => {
    const st = new MemoryStorage()
    st.setItem(KEY, '{깨짐')
    const r = await loadInitialData(st, initial)
    expect(r.recovery).toBeUndefined()
    expect(r.data).toEqual(EMPTY_DATA)
    expect(st.getItem('coffee-duty:corrupt-backup')).toBe('{깨짐')
  })

  it('미래 버전 메인은 읽지 않고 저장도 막으며 shadow를 건드리지 않는다', async () => {
    const st = new MemoryStorage()
    saveData(v2(1000), st)
    st.setItem(KEY, JSON.stringify({ schemaVersion: 9, members: [] }))
    const shadowBefore = st.getItem(SHADOW_KEY)
    const r = await loadInitialData(st, initial)
    expect(r.blocked).toBeTruthy()
    expect(r.recovery).toBeUndefined()
    expect(st.getItem(SHADOW_KEY)).toBe(shadowBefore)
  })
})

describe('수동 복구 (설정 > 마지막 정상 상태로 되돌리기)', () => {
  it('shadow가 있으면 그 상태를 돌려주고 현재 메인을 백업한다', () => {
    const st = new MemoryStorage()
    saveData(v2(1000), st)
    oldAppRewrites(st)
    const current = migrate(JSON.parse(st.getItem(KEY)!))
    const restored = restoreLastGood(current, st)
    expect(restored?.priceList).toHaveLength(1)
    expect(restored?.updatedAt).toBe(1000)
    expect(st.getItem(RESTORE_BACKUP_KEY)).toBeTruthy()
  })
  it('shadow가 없거나 깨졌으면 null (아무것도 바꾸지 않음)', () => {
    const st = new MemoryStorage()
    expect(restoreLastGood(EMPTY_DATA, st)).toBeNull()
    st.setItem(SHADOW_KEY, '{깨짐')
    expect(restoreLastGood(EMPTY_DATA, st)).toBeNull()
    expect(st.getItem(RESTORE_BACKUP_KEY)).toBeNull()
  })
  it('백업을 남기지 못하면 되돌리지 않는다', () => {
    const st = new FailingStorage(RESTORE_BACKUP_KEY)
    saveData(v2(1000), st)
    expect(restoreLastGood(EMPTY_DATA, st)).toBeNull()
  })
})

describe('저장 시각 표시', () => {
  it('"○월 ○일 ○시"', () => {
    expect(formatSavedAt(new Date(2026, 10, 20, 15, 42).getTime())).toBe('11월 20일 15시')
    expect(formatSavedAt(new Date(2026, 0, 5, 0, 5).getTime())).toBe('1월 5일 0시')
  })
})
