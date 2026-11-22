import { beforeAll, describe, expect, it } from 'vitest'
import { anonClient, assertNotProduction, configured, joinAsViewer, mustRpc, newUser, readRows, type TestUser } from './helpers'
import { groupToImport, rowsToGroup } from '../../src/logic/remote-map'
import { richCoffeeGroup } from '../../src/lib/testing'
import { parseSnapshot } from '../../src/remote/snapshot'

/** supabase/migrations/0003_group_snapshot.sql 이 적용돼 있어야 한다 */
const d = configured ? describe : describe.skip

d('get_group_snapshot', () => {
  let owner: TestUser
  let viewer: TestUser
  let stranger: TestUser
  let gid: string

  beforeAll(async () => {
    assertNotProduction()
    owner = await newUser()
    viewer = await newUser()
    stranger = await newUser()
    const base = crypto.randomUUID().slice(0, 24)
    let n = 0
    gid = await mustRpc<string>(owner.client, 'import_group', {
      p: groupToImport(richCoffeeGroup(), crypto.randomUUID(), () => `${base}${(++n).toString(16).padStart(12, '0')}`),
    })
    await joinAsViewer(owner, gid, viewer)
  })

  it('그룹장과 그룹원은 읽고, 테이블을 직접 읽은 것과 같다', async () => {
    const direct = rowsToGroup(await readRows(owner, gid))
    for (const u of [owner, viewer]) {
      const snap = await mustRpc(u.client, 'get_group_snapshot', { p_group: gid })
      expect(rowsToGroup(parseSnapshot(snap))).toEqual(direct)
    }
  })
  it('무관한 사용자는 null (내용을 알 수 없다)', async () => {
    expect(await mustRpc(stranger.client, 'get_group_snapshot', { p_group: gid })).toBeNull()
  })
  it('로그인하지 않으면 호출할 수 없다', async () => {
    const r = await anonClient().rpc('get_group_snapshot', { p_group: gid })
    expect(r.error).toBeTruthy()
  })
  it('없는 그룹 id는 null', async () => {
    expect(await mustRpc(owner.client, 'get_group_snapshot', { p_group: crypto.randomUUID() })).toBeNull()
  })
  it('그룹장이 바꾸면 다음 스냅샷에 반영된다', async () => {
    const add = await owner.client.from('skip_days').insert({ group_id: gid, date: '2027-01-02' })
    expect(add.error).toBeNull()
    const snap = parseSnapshot(await mustRpc(viewer.client, 'get_group_snapshot', { p_group: gid }))
    expect(snap.skip_days.map((s) => s.date)).toContain('2027-01-02')
  })
  it('내 소속 목록(group_members)은 내 줄만 보인다', async () => {
    const mine = await viewer.client.from('group_members').select('group_id, role').eq('user_id', viewer.id)
    expect(mine.data).toEqual([{ group_id: gid, role: 'viewer' }])
  })
})
