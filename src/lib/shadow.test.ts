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
import { migrate, serialize } from './migrate'
import { groupToView, withGroupAdded } from '../logic/groups'
import { legacyGroup } from './testing'
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

// v2 시절의 데이터 (주문·금액·가격표·기본 메뉴·설정이 모두 있음)
const v2Raw = (updatedAt: number) => ({
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

// 새 버전(v3)이 저장하는 데이터: 커피 그룹 + 청소 그룹
const v3 = (updatedAt = 1_000): AppData => {
  const base = migrate(v2Raw(updatedAt))
  return { ...withGroupAdded(base, legacyGroup('g-clean', 'general', '청소', '🧹'), updatedAt), updatedAt }
}
const coffee = (d: AppData) => groupToView(d.groups[0])

/** 옛 v1 앱: v3 데이터를 열면 members 표식만 보고 0명짜리 v1 데이터로 읽어 다시 저장한다 */
function oldV1AppRewrites(storage: MemoryStorage) {
  storage.setItem(KEY, JSON.stringify({ members: [], purchases: [], absences: [], skipDays: [] }))
}
/** 배포 전 v2 화면이 메모리에 남아 있다가 v3 데이터 위에 자기 상태(v2 모양)를 저장한다 */
function staleV2TabRewrites(storage: MemoryStorage, updatedAt = 500) {
  storage.setItem(KEY, JSON.stringify(v2Raw(updatedAt)))
}

const initial = async () => EMPTY_DATA

describe('shadow 저장', () => {
  it('저장할 때마다 메인과 shadow에 같은 전체 데이터(updatedAt 포함)를 쓴다', () => {
    const st = new MemoryStorage()
    saveData(v3(1234), st)
    expect(st.getItem(SHADOW_KEY)).toBe(st.getItem(KEY))
    const shadow = readShadow(st)!
    expect(shadow.savedAt).toBe(1234)
    expect(shadow.data.groups).toHaveLength(2)
    expect(coffee(shadow.data).priceList).toHaveLength(1)
    expect(coffee(shadow.data).purchases[0].pricing).toBeDefined()
  })

  it('옛 앱이 v3 데이터를 깨진 데이터로 오해하지 않도록 최상위에 빈 members 표식을 남긴다', () => {
    const json = JSON.parse(serialize(v3()))
    // 배포된 v2 앱의 검사 순서: (1) members가 배열인가 → (2) schemaVersion이 자기보다 큰가
    expect(Array.isArray(json.members)).toBe(true)
    expect(json.members).toEqual([])
    expect(json.schemaVersion).toBeGreaterThan(2)
    // 표식이 읽는 쪽 결과를 바꾸지 않는다
    expect(migrate(json)).toEqual(v3())
  })

  it('저장 후 정상적으로 다시 열면 복구 질문이 없다', async () => {
    const st = new MemoryStorage()
    saveData(v3(), st)
    const r = await loadInitialData(st, initial)
    expect(r.recovery).toBeUndefined()
    expect(r.data.groups).toHaveLength(2)
    expect(coffee(r.data).orders).toHaveLength(1)
  })

  it('두 번째 저장이 shadow를 최신으로 갱신한다', () => {
    const st = new MemoryStorage()
    saveData(v3(1000), st)
    saveData(v3(2000), st)
    expect(readShadow(st)!.savedAt).toBe(2000)
  })

  it('shadow 쓰기가 실패해도 메인 저장은 된다', () => {
    const st = new FailingStorage(SHADOW_KEY)
    saveData(v3(), st)
    expect(st.getItem(KEY)).not.toBeNull()
  })
})

describe('옛 버전 앱의 덮어쓰기 감지', () => {
  it('옛 v1 앱이 덮어쓴 경우 → 복구 질문 (자동 적용 없음, 저장소 변경 없음)', async () => {
    const st = new MemoryStorage()
    saveData(v3(1000), st)
    oldV1AppRewrites(st)
    const mainBefore = st.getItem(KEY)
    const shadowBefore = st.getItem(SHADOW_KEY)

    const r = await loadInitialData(st, initial)

    expect(r.recovery?.savedAt).toBe(1000)
    expect(r.recovery!.shadow.groups).toHaveLength(2) // 지워진 그룹·필드가 shadow에는 남아 있다
    expect(coffee(r.recovery!.shadow).priceList).toHaveLength(1)
    // 지금 화면용 데이터는 메인을 정상 마이그레이션한 것 (병합하지 않는다)
    expect(r.data.groups).toHaveLength(1)
    expect(coffee(r.data).members).toHaveLength(0)
    // 묻는 동안 아무것도 바꾸지 않는다
    expect(st.getItem(KEY)).toBe(mainBefore)
    expect(st.getItem(SHADOW_KEY)).toBe(shadowBefore)
  })

  it('배포 전 v2 화면이 메모리에서 v3 데이터를 덮어쓴 경우도 복구 질문', async () => {
    const st = new MemoryStorage()
    saveData(v3(1000), st)
    staleV2TabRewrites(st, 500)
    const r = await loadInitialData(st, initial)
    expect(r.recovery).toBeDefined()
    expect(r.recovery!.shadow.groups).toHaveLength(2) // 청소 그룹은 shadow에만 남아 있다
    expect(r.data.groups).toHaveLength(1) // 화면용은 덮어쓴 v2 상태를 v3로 옮긴 것(커피 그룹 하나)
    expect(coffee(r.data).members).toHaveLength(2)
  })

  it('판단 함수: 메인이 더 낮은 버전이고 shadow가 더 최신일 때만 true', () => {
    const shadow = { data: v3(1000), savedAt: 1000, raw: '' }
    expect(isOverwrittenByOldApp({ members: [], purchases: [] }, shadow)).toBe(true) // v1 모양
    expect(isOverwrittenByOldApp(v2Raw(500), shadow)).toBe(true) // v2 모양, 더 오래됨
    expect(isOverwrittenByOldApp(v2Raw(1000), shadow)).toBe(false) // 같은 시점의 저장 = 정상
    expect(isOverwrittenByOldApp(v2Raw(5000), shadow)).toBe(false) // 메인이 더 최신
    expect(isOverwrittenByOldApp({ schemaVersion: 4, groups: [] }, shadow)).toBe(false) // 메인이 최신 버전이면 정상
    expect(isOverwrittenByOldApp({ schemaVersion: 3, groups: [], updatedAt: 1000 }, shadow)).toBe(false) // v3 앱이 함께 쓴 메인(같은 시점) = 정상
    expect(isOverwrittenByOldApp({ schemaVersion: 3, groups: [], updatedAt: 500 }, shadow)).toBe(true) // v3 메인이 더 오래됨
    expect(isOverwrittenByOldApp({ members: [] }, null)).toBe(false)
    expect(isOverwrittenByOldApp({ members: [] }, { ...shadow, savedAt: 0 })).toBe(false)
  })

  it('v2 앱이 저장해 둔 v2 데이터 + v2 shadow(같은 시점)는 질문 없이 v3로 옮기고 원본을 보관', async () => {
    const st = new MemoryStorage()
    const raw = JSON.stringify(v2Raw(1000))
    st.setItem(KEY, raw)
    st.setItem(SHADOW_KEY, raw) // v2 앱이 함께 써 둔 shadow
    const r = await loadInitialData(st, initial)
    expect(r.recovery).toBeUndefined()
    expect(r.data.groups).toHaveLength(1)
    expect(coffee(r.data).priceList).toHaveLength(1)
    expect(st.getItem('coffee-duty:backup-before-v3')).toBe(raw)
    expect(st.getItem('coffee-duty:backup-before-v4')).toBe(raw) // v4로 옮기기 직전 원본도 보관
    expect(st.getItem('coffee-duty:backup-before-v2')).toBeNull() // v1이 아니므로 v2 백업은 만들지 않는다
  })

  it('진짜 v1 메인 + shadow 없음(첫 업그레이드)은 질문 없이 정상 마이그레이션, 원본은 한 번만 보관', async () => {
    const st = new MemoryStorage()
    const v1 = JSON.stringify({ members: [{ id: 'm1', name: '가', order: 1 }], purchases: [], absences: [], skipDays: [] })
    st.setItem(KEY, v1)
    const r = await loadInitialData(st, initial)
    expect(r.recovery).toBeUndefined()
    expect(coffee(r.data).members).toHaveLength(1)
    expect(st.getItem('coffee-duty:backup-before-v2')).toBe(v1)
    expect(st.getItem('coffee-duty:backup-before-v3')).toBe(v1)
    // 이미 보관된 원본은 다시 열어도 덮어쓰지 않는다
    st.setItem(KEY, JSON.stringify({ members: [{ id: 'm9', name: '다', order: 1 }] }))
    await loadInitialData(st, initial)
    expect(st.getItem('coffee-duty:backup-before-v3')).toBe(v1)
  })

  it('메인이 읽을 수 없고 정상 shadow가 있으면, 초기 데이터로 덮어쓰기 전에 물어본다', async () => {
    const st = new MemoryStorage()
    saveData(v3(1000), st)
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
    const original = v3(1000)
    saveData(original, st)
    oldV1AppRewrites(st)
    const oldMain = st.getItem(KEY)!
    const loaded = await loadInitialData(st, initial)
    return { st, original, oldMain, loaded }
  }

  it('되돌리기: shadow 전체(그룹 포함)가 복원되고, 되돌리기 전 메인은 백업으로 남는다', async () => {
    const { st, original, oldMain, loaded } = await overwritten()
    const r = applyRecovery('restore', loaded.recovery!, loaded.data, st)
    expect(r.ok).toBe(true)
    expect(r.data).toEqual(original)
    expect(st.getItem(RESTORE_BACKUP_KEY)).toBe(oldMain)

    saveData(r.data, st) // 앱이 이어서 저장
    expect(JSON.parse(st.getItem(KEY)!)).toEqual(JSON.parse(serialize(original)))
    const again = await loadInitialData(st, initial)
    expect(again.recovery).toBeUndefined()
    expect(again.data.groups.map((g) => g.name)).toEqual(['커피', '청소'])
    expect(coffee(again.data).priceList).toHaveLength(1)
    expect(coffee(again.data).purchases[0].pricing?.total).toBe(6000)
    expect(coffee(again.data).members[0].favorite?.menu).toBe('아메리카노')
  })

  it('그대로 두기: 메인은 정상 마이그레이션, 이전 shadow는 shadow-prev에 보관(덮어쓰지 않음)', async () => {
    const { st, loaded } = await overwritten()
    const shadowRaw = loaded.recovery!.shadowRaw
    const r = applyRecovery('keep', loaded.recovery!, loaded.data, st)
    expect(r.ok).toBe(true)
    expect(st.getItem(SHADOW_PREV_KEY)).toBe(shadowRaw)

    saveData(r.data, st) // 이후 저장은 shadow를 새 상태로 갱신
    expect(st.getItem(SHADOW_PREV_KEY)).toBe(shadowRaw) // 보관본은 그대로
    expect(readShadow(st)!.data.groups).toHaveLength(1) // shadow는 지금 상태
    expect(JSON.parse(st.getItem(KEY)!).schemaVersion).toBe(4)
    expect((await loadInitialData(st, initial)).recovery).toBeUndefined()
    expect(readShadow(st, SHADOW_PREV_KEY)!.data.groups).toHaveLength(2) // 정상 상태였던 데이터는 살아 있다
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
    ['더 새로운 버전(v4)', JSON.stringify({ schemaVersion: 4, members: [], groups: [] })],
    ['v3인데 groups가 없음', JSON.stringify({ schemaVersion: 3, members: [] })],
    ['v3인데 groups가 비어 있음', JSON.stringify({ schemaVersion: 3, members: [], groups: [] })],
  ]
  for (const [name, shadow] of cases) {
    it(`shadow ${name}: 질문 없이 정상 마이그레이션`, async () => {
      const st = new MemoryStorage()
      st.setItem(KEY, oldMain)
      if (shadow !== null) st.setItem(SHADOW_KEY, shadow)
      expect(readShadow(st)).toBeNull()
      const r = await loadInitialData(st, initial)
      expect(r.recovery).toBeUndefined()
      expect(coffee(r.data).members).toHaveLength(1)
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

  it('미래 버전 메인은 읽지 않고 저장도 막으며 shadow를 건드리지 않는다 (모양이 달라도 미래 버전으로 인식)', async () => {
    const st = new MemoryStorage()
    saveData(v3(1000), st)
    st.setItem(KEY, JSON.stringify({ schemaVersion: 9, teams: [] })) // members도 groups도 없는 새 구조
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
    saveData(v3(1000), st)
    oldV1AppRewrites(st)
    const current = migrate(JSON.parse(st.getItem(KEY)!))
    const restored = restoreLastGood(current, st)
    expect(restored?.groups).toHaveLength(2)
    expect(coffee(restored!).priceList).toHaveLength(1)
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
    saveData(v3(1000), st)
    expect(restoreLastGood(EMPTY_DATA, st)).toBeNull()
  })
})

describe('저장 시각 표시', () => {
  it('"○월 ○일 ○시"', () => {
    expect(formatSavedAt(new Date(2026, 10, 20, 15, 42).getTime())).toBe('11월 20일 15시')
    expect(formatSavedAt(new Date(2026, 0, 5, 0, 5).getTime())).toBe('1월 5일 0시')
  })
})
