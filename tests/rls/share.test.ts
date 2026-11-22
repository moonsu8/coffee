import { beforeAll, describe, expect, it } from 'vitest'
import { assertNotProduction, configured, joinAsViewer, mustRpc, newUser, type TestUser } from './helpers'
import { rowsToGroup } from '../../src/logic/remote-map'
import { richCoffeeGroup, richGeneralGroup } from '../../src/lib/testing'
import { shareLocalGroup, type ShareDeps } from '../../src/remote/share'
import { shareBackupKey, type Links } from '../../src/remote/links'
import { parseSnapshot } from '../../src/remote/snapshot'
import type { StorageLike } from '../../src/lib/data'

/** 실제 서버(import_group + get_group_snapshot)로 "옮기기"가 끝까지 동작하는지 확인한다 */
const d = configured ? describe : describe.skip

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

d('옮기기 (실제 서버)', () => {
  let owner: TestUser
  beforeAll(async () => {
    assertNotProduction()
    owner = await newUser()
  })

  const makeDeps = (links: { v: Links }, storage = new MemoryStorage()): ShareDeps & { storage: MemoryStorage } => ({
    storage,
    links: () => links.v,
    setLinks: (l) => {
      links.v = l
    },
    importGroup: (payload) => mustRpc<string>(owner.client, 'import_group', { p: payload }),
    fetchRows: async (id) => {
      const snap = await mustRpc(owner.client, 'get_group_snapshot', { p_group: id })
      return snap ? parseSnapshot(snap) : null
    },
  })

  it('커피 그룹이 값 그대로 옮겨지고(검증 통과) 그룹원이 같은 내용을 본다', async () => {
    const g = richCoffeeGroup()
    const links = { v: {} as Links }
    const deps = makeDeps(links)
    const res = await shareLocalGroup(g, '{"backup":1}', deps)
    expect(res).toMatchObject({ ok: true, verified: true, mismatch: [] })
    if (!res.ok) return
    expect(deps.storage.getItem(shareBackupKey(g.id))).toBe('{"backup":1}')
    expect(links.v[g.id]).toMatchObject({ remoteId: res.remoteId, verified: true })

    const viewer = await newUser()
    await joinAsViewer(owner, res.remoteId, viewer)
    const seen = rowsToGroup(parseSnapshot(await mustRpc(viewer.client, 'get_group_snapshot', { p_group: res.remoteId })))
    expect(seen.members.map((m) => m.name)).toEqual(g.members.map((m) => m.name))
    expect(seen.records).toHaveLength(g.records.length)
  })

  it('일반 그룹도 옮겨진다', async () => {
    const res = await shareLocalGroup(richGeneralGroup(), '{}', makeDeps({ v: {} }))
    expect(res).toMatchObject({ ok: true, verified: true })
  })

  it('응답이 유실된 것처럼 pending 연결로 다시 시도해도 같은 서버 그룹을 돌려준다(중복 없음)', async () => {
    const g = richCoffeeGroup()
    const links = { v: {} as Links }
    const first = await shareLocalGroup(g, '{}', makeDeps(links))
    expect(first.ok).toBe(true)
    if (!first.ok) return
    // 서버에는 올라갔지만 앱은 remoteId를 못 받은 상태를 만든다
    const { remoteId: _r, sharedAt: _s, verified: _v, ...pending } = links.v[g.id]
    void _r; void _s; void _v
    links.v = { [g.id]: pending }
    const second = await shareLocalGroup(g, '{}', makeDeps(links))
    expect(second).toMatchObject({ ok: true, verified: true })
    expect(second.ok && second.remoteId).toBe(first.remoteId)
    const mine = await owner.client.from('group_members').select('group_id').eq('user_id', owner.id).eq('group_id', first.remoteId)
    expect(mine.data).toHaveLength(1)
  })
})
