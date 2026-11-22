import { describe, expect, it } from 'vitest'
import { ACTIVE_GROUP_KEY, KEY, saveData, SHADOW_KEY, type StorageLike } from './data'
import { serialize } from './migrate'
import { createLocalRepository, LOCAL_ACCESS } from './repository'
import { defaultCoffeeGroup, withGroupAdded } from '../logic/groups'
import { legacyGroup } from './testing'
import { SCHEMA_VERSION, type AppData } from '../types'

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

const sample = (): AppData => {
  const g = defaultCoffeeGroup()
  g.members = [
    { id: 'm1', name: '가람', order: 1, favorite: { menu: '아메리카노', temp: 'ice' } },
    { id: 'm2', name: '나래', order: 2 },
  ]
  g.records = [{ date: '2026-11-17', memberId: 'm1', pricing: { mode: 'simple', total: 9000, participants: ['m1', 'm2'] } }]
  g.coffee!.settings = { buyerRule: 'balance', defaultPriceMode: 'detail', balanceSince: '2026-11-01' }
  const root: AppData = { schemaVersion: SCHEMA_VERSION, groups: [g], updatedAt: 1763000000000 }
  return withGroupAdded(root, legacyGroup('g-clean', 'general', '청소', '🧹'))
}

describe('로컬 저장 계층 (저장 형식이 바뀌지 않는다)', () => {
  it('저장 결과가 이전 saveData와 바이트까지 같다 (메인·shadow)', () => {
    const a = new MemoryStorage()
    const b = new MemoryStorage()
    const data = sample() // withGroupAdded가 현재 시각을 쓰므로 한 번만 만든다
    createLocalRepository(a).save(data)
    saveData(data, b)
    expect([...a.map.entries()]).toEqual([...b.map.entries()])
    expect([...a.map.keys()].sort()).toEqual([KEY, SHADOW_KEY].sort())
  })

  it('저장 → 불러오기 → 다시 저장해도 같은 값이다 (골든)', async () => {
    const st = new MemoryStorage()
    const repo = createLocalRepository(st)
    repo.save(sample())
    const first = st.getItem(KEY)!
    const loaded = await repo.load()
    expect(loaded.blocked).toBeUndefined()
    expect(loaded.recovery).toBeUndefined()
    repo.save(loaded.data)
    expect(st.getItem(KEY)).toBe(first)
    expect(st.getItem(SHADOW_KEY)).toBe(first)
  })

  it('옛 앱 보호 표식(최상위 members: [])이 저장 JSON에 남는다', () => {
    const st = new MemoryStorage()
    const data = sample()
    createLocalRepository(st).save(data)
    expect(JSON.parse(st.getItem(KEY)!).members).toEqual([])
    expect(st.getItem(KEY)).toBe(serialize(data))
  })

  it('미래 버전 데이터는 읽지 않고 저장을 막는 상태로 돌려준다 (아무것도 쓰지 않음)', async () => {
    const st = new MemoryStorage()
    const future = JSON.stringify({ schemaVersion: 99, members: [], groups: [] })
    st.setItem(KEY, future)
    const r = await createLocalRepository(st).load()
    expect(r.blocked).toBeTruthy()
    expect(st.getItem(KEY)).toBe(future)
    expect(st.map.size).toBe(1)
  })

  it('보고 있는 그룹은 별도 키에 저장하고 데이터·shadow를 건드리지 않는다', () => {
    const st = new MemoryStorage()
    const repo = createLocalRepository(st)
    expect(repo.readActiveGroup()).toBeNull()
    repo.writeActiveGroup('g-clean')
    expect(repo.readActiveGroup()).toBe('g-clean')
    expect([...st.map.keys()]).toEqual([ACTIVE_GROUP_KEY])
  })

  it('되돌릴 shadow가 없으면 null, 있으면 복원한다', () => {
    const st = new MemoryStorage()
    const repo = createLocalRepository(st)
    expect(repo.restoreLastGood(sample())).toBeNull()
    repo.save(sample())
    const restored = repo.restoreLastGood({ ...sample(), updatedAt: 5 })
    expect(restored?.groups.map((g) => g.id)).toEqual(['g-coffee', 'g-clean'])
  })

  it('로컬 그룹의 접근 정보: 항상 쓸 수 있다', () => {
    expect(LOCAL_ACCESS).toEqual({ kind: 'local', canWrite: true, lastSyncedAt: null })
  })
})
