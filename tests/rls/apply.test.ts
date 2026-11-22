import { beforeAll, describe, expect, it } from 'vitest'
import { anonClient, assertNotProduction, configured, joinAsViewer, mustRpc, newUser, readRows, type TestUser } from './helpers'
import { diffGroups, groupToImport, rowsToGroup, type RemoteOp } from '../../src/logic/remote-map'
import { richCoffeeGroup, richGeneralGroup } from '../../src/lib/testing'
import { parseSnapshot } from '../../src/remote/snapshot'
import type { Group } from '../../src/types'

/** supabase/migrations/0004_apply_group_ops.sql 이 적용돼 있어야 한다 */
const d = configured ? describe : describe.skip

/** 실행마다 달라지는 uuid 순서열 */
function uuidSeq() {
  const base = crypto.randomUUID().slice(0, 24)
  let n = 0
  return () => `${base}${(++n).toString(16).padStart(12, '0')}`
}

type Applied = { status: 'ok' | 'conflict'; rev: number }

d('apply_group_ops', () => {
  let owner: TestUser
  let viewer: TestUser
  let stranger: TestUser

  beforeAll(async () => {
    assertNotProduction()
    owner = await newUser()
    viewer = await newUser()
    stranger = await newUser()
  })

  /** 커피 그룹 하나를 서버에 만들고 (그룹 id, 현재 rev, 서버에서 읽은 Group)을 돌려준다 */
  async function makeGroup(g: Group = richCoffeeGroup(), who: TestUser = owner) {
    const gid = await mustRpc<string>(who.client, 'import_group', { p: groupToImport(g, crypto.randomUUID(), uuidSeq()) })
    return { gid, ...(await read(who, gid)) }
  }
  async function read(who: TestUser, gid: string) {
    const snap = (await mustRpc<{ rev: number }>(who.client, 'get_group_snapshot', { p_group: gid }))
    return { rev: snap.rev, group: rowsToGroup(parseSnapshot(snap)) }
  }
  const apply = (who: TestUser, gid: string, rev: number, ops: unknown) => who.client.rpc('apply_group_ops', { p_group: gid, p_base_rev: rev, p_ops: ops })
  const applyOk = async (who: TestUser, gid: string, rev: number, ops: RemoteOp[]) => {
    const r = await apply(who, gid, rev, ops)
    if (r.error) throw new Error(r.error.message)
    return r.data as Applied
  }

  it('스냅샷에 rev가 있고 처음에는 0이다', async () => {
    const { rev } = await makeGroup()
    expect(rev).toBe(0)
  })

  it('diff로 만든 작업을 적용하면 읽은 결과가 변경 후 그룹과 같다 (여러 테이블, 한 번에)', async () => {
    const { gid, rev, group: before } = await makeGroup()
    const after: Group = structuredClone(before)
    const uuid = uuidSeq()
    const newMember = { id: uuid(), name: '신규', order: 9, color: '#7A8B4F', emoji: '🦊', favorite: { menu: '라떼', temp: 'hot' as const } }
    after.name = '바뀐 이름'
    after.schedule = [1, 3, 5]
    after.members = [...after.members.filter((m) => m.name !== '나래'), newMember]
    after.records = [
      ...after.records.filter((r) => r.date !== '2026-11-16'),
      { date: '2026-11-19', memberId: newMember.id, memo: '새 기록', pricing: { mode: 'simple', total: 7000, participants: [newMember.id] } },
    ]
    after.absences = [...after.absences, { id: uuid(), memberId: newMember.id, from: '2026-12-01', to: '2026-12-02' }]
    after.skipDays = ['2026-12-25', '2027-01-01']
    after.coffee = {
      ...after.coffee!,
      orders: [],
      customMenus: ['유자차', '식혜'],
      settings: { ...after.coffee!.settings, buyerRule: 'count' },
    }
    const ops = diffGroups(before, after)
    expect(ops.length).toBeGreaterThan(6)
    const res = await applyOk(owner, gid, rev, ops)
    expect(res).toEqual({ status: 'ok', rev: rev + 1 })
    const now = await read(owner, gid)
    expect(now.rev).toBe(rev + 1)
    const norm = (g: Group): Group => ({ ...g, absences: g.absences.map((a) => ({ ...a, id: '-' })) })
    expect(norm(now.group)).toEqual(norm({ ...after, id: gid }))
  })

  it('변경이 없는 작업 목록도 rev는 올라가지만 데이터는 그대로다', async () => {
    const { gid, rev, group } = await makeGroup()
    const res = await applyOk(owner, gid, rev, [])
    expect(res).toEqual({ status: 'ok', rev: rev + 1 })
    expect((await read(owner, gid)).group).toEqual(group)
  })

  it('오래된 rev는 conflict이고 아무것도 적용되지 않는다', async () => {
    const { gid, rev, group: before } = await makeGroup()
    const after = structuredClone(before)
    after.skipDays = ['2030-01-01']
    const ops = diffGroups(before, after)
    expect((await applyOk(owner, gid, rev, ops)).status).toBe('ok')
    // 같은 rev로 다시(다른 기기가 모르고 보낸 것) → conflict
    const after2 = structuredClone(before)
    after2.name = '다른 기기의 이름'
    const res = await applyOk(owner, gid, rev, diffGroups(before, after2))
    expect(res).toEqual({ status: 'conflict', rev: rev + 1 })
    const now = await read(owner, gid)
    expect(now.group.name).toBe(before.name)
    expect(now.group.skipDays).toEqual(['2030-01-01'])
    // 최신 rev로 다시 보내면 성공
    expect((await applyOk(owner, gid, now.rev, diffGroups(now.group, { ...now.group, name: '최신 기준' }))).status).toBe('ok')
  })

  it('하나라도 잘못되면 전부 되돌아간다 (rev도 그대로)', async () => {
    const { gid, rev, group } = await makeGroup()
    const ops = [
      { kind: 'upsert', table: 'skip_days', row: { date: '2031-01-01' } },
      { kind: 'upsert', table: 'records', row: { date: 'not-a-date', member_id: crypto.randomUUID() } },
    ]
    const r = await apply(owner, gid, rev, ops)
    expect(r.error).toBeTruthy()
    const now = await read(owner, gid)
    expect(now.rev).toBe(rev)
    expect(now.group.skipDays).toEqual(group.skipDays)
  })

  it('잘못된 형식·표·개수는 거절한다', async () => {
    const { gid, rev } = await makeGroup()
    expect((await apply(owner, gid, rev, { kind: 'x' })).error?.message).toContain('bad_ops')
    expect((await apply(owner, gid, rev, [{ kind: 'upsert', table: 'invites', row: {} }])).error?.message).toContain('bad_table')
    expect((await apply(owner, gid, rev, [{ kind: 'delete', table: 'entitlements', key: 'x' }])).error?.message).toContain('bad_table')
    expect((await apply(owner, gid, rev, [{ kind: 'drop' }])).error?.message).toContain('bad_op')
    const many = Array.from({ length: 501 }, () => ({ kind: 'delete', table: 'prices', key: '' }))
    expect((await apply(owner, gid, rev, many)).error?.message).toContain('too_many_ops')
    expect((await read(owner, gid)).rev).toBe(rev)
  })

  it('그룹원·무관한 사용자·로그인 안 한 사용자는 쓸 수 없다', async () => {
    const { gid, rev, group } = await makeGroup()
    await joinAsViewer(owner, gid, viewer)
    const ops = [{ kind: 'upsert', table: 'skip_days', row: { date: '2032-01-01' } }]
    expect((await apply(viewer, gid, rev, ops)).error?.message).toContain('forbidden')
    expect((await apply(stranger, gid, rev, ops)).error?.message).toContain('forbidden')
    expect((await anonClient().rpc('apply_group_ops', { p_group: gid, p_base_rev: rev, p_ops: ops })).error).toBeTruthy()
    const now = await read(owner, gid)
    expect(now.rev).toBe(rev)
    expect(now.group.skipDays).toEqual(group.skipDays)
  })

  it('행의 group_id를 다른 그룹으로 속여도 대상 그룹에만 쓰인다', async () => {
    const mine = await makeGroup()
    const other = await makeGroup(richGeneralGroup(), stranger)
    const memberId = mine.group.members[0].id
    const ops = [{ kind: 'upsert', table: 'records', row: { group_id: other.gid, date: '2033-03-03', member_id: memberId, payload: {} } }]
    const res = await applyOk(owner, mine.gid, mine.rev, ops as RemoteOp[])
    expect(res.status).toBe('ok')
    expect((await read(owner, mine.gid)).group.records.some((r) => r.date === '2033-03-03')).toBe(true)
    expect((await read(stranger, other.gid)).group.records.some((r) => r.date === '2033-03-03')).toBe(false)
  })

  it('다른 그룹의 멤버 id와 겹치면 거절하고 그 멤버를 바꾸지 않는다', async () => {
    const mine = await makeGroup()
    const other = await makeGroup(richGeneralGroup(), stranger)
    const victim = other.group.members[0]
    const ops = [{ kind: 'upsert', table: 'members', row: { id: victim.id, name: '탈취', sort: 1, payload: {} } }]
    expect((await apply(owner, mine.gid, mine.rev, ops)).error).toBeTruthy()
    expect((await read(stranger, other.gid)).group.members[0].name).toBe(victim.name)
    expect((await read(owner, mine.gid)).rev).toBe(mine.rev)
  })

  it('멤버를 지워도 그 멤버의 과거 기록은 남는다', async () => {
    const { gid, rev, group } = await makeGroup()
    const m1 = group.members.find((m) => m.name === '가람')!
    const res = await applyOk(owner, gid, rev, [{ kind: 'delete', table: 'members', groupId: gid, key: m1.id }])
    expect(res.status).toBe('ok')
    const now = (await read(owner, gid)).group
    expect(now.members.some((m) => m.id === m1.id)).toBe(false)
    expect(now.records.some((r) => r.memberId === m1.id)).toBe(true)
  })

  it('멤버가 100명(상한)인 그룹에서도 멤버를 고칠 수 있다', async () => {
    const g = richGeneralGroup()
    g.members = Array.from({ length: 100 }, (_, i) => ({ id: `x${i}`, name: `이름${i}`, order: i + 1 }))
    g.records = []
    const { gid, rev, group } = await makeGroup(g)
    expect(group.members).toHaveLength(100)
    const after = structuredClone(group)
    after.members[5].name = '고침'
    const res = await applyOk(owner, gid, rev, diffGroups(group, after))
    expect(res.status).toBe('ok')
    expect((await read(owner, gid)).group.members.find((m) => m.id === group.members[5].id)?.name).toBe('고침')
    // 101번째 멤버 추가는 상한에서 거절되고 전부 되돌아간다
    const extra = structuredClone(after)
    extra.members.push({ id: crypto.randomUUID(), name: '101번째', order: 101 })
    const r = await apply(owner, gid, rev + 1, diffGroups(after, extra))
    expect(r.error?.message).toContain('too_large')
  })

  it('그룹 설정(이름·이모지·요일·설정)만 바꾸는 작업', async () => {
    const { gid, rev, group } = await makeGroup()
    const after = { ...group, name: '새 이름', emoji: '🍵', schedule: 'daily' as const }
    const ops = diffGroups(group, after)
    expect(ops).toHaveLength(1)
    expect((await applyOk(owner, gid, rev, ops)).rev).toBe(rev + 1)
    const now = (await read(owner, gid)).group
    expect([now.name, now.emoji, now.schedule]).toEqual(['새 이름', '🍵', 'daily'])
  })
})
