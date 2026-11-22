import { beforeAll, describe, expect, it } from 'vitest'
import { assertNotProduction, configured, mustRpc, newUser, seedGroup, type TestUser } from './helpers'
import { countViewers, createInviteRpc, listInvites, revokeInviteRpc } from '../../src/remote/api'
import { CODE_ALPHABET, defaultInviteOptions, inviteStatus } from '../../src/remote/invite'

/** 초대 코드 만들기·목록·취소·인원 제한 (그룹장 화면이 쓰는 api 함수를 실제 서버로) */
const d = configured ? describe : describe.skip

d('초대 코드 관리 (실제 서버)', () => {
  let owner: TestUser
  let gid: string

  beforeAll(async () => {
    assertNotProduction()
    owner = await newUser()
    gid = (await seedGroup(owner)).gid // 멤버 2명
  })

  const redeem = async (code: string) => {
    const u = await newUser()
    return { u, res: await mustRpc<{ status: string }>(u.client, 'redeem_invite', { p_code: code }) }
  }

  it('기본값(7일, 인원=멤버 수)으로 만든 코드가 목록에 정확히 보인다', async () => {
    const opts = defaultInviteOptions(2)
    const code = await createInviteRpc(owner.client, gid, opts)
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/)
    expect([...code].every((c) => CODE_ALPHABET.includes(c))).toBe(true)
    const list = await listInvites(owner.client, gid)
    const inv = list.find((i) => i.code === code)!
    expect(inv).toMatchObject({ max_uses: 2, uses: 0, requires_approval: false, revoked_at: null })
    const days = (new Date(inv.expires_at).getTime() - new Date(inv.created_at).getTime()) / 86_400_000
    expect(days).toBeGreaterThan(6.99)
    expect(days).toBeLessThan(7.01)
    expect(inviteStatus(inv)).toBe('active')
  })

  it('정한 인원까지만 참여되고 그 뒤에는 invalid, 참여 수가 올라간다', async () => {
    const code = await createInviteRpc(owner.client, gid, { ttlHours: 24, maxUses: 2 })
    expect((await redeem(code)).res.status).toBe('joined')
    expect((await redeem(code)).res.status).toBe('joined')
    expect((await redeem(code)).res.status).toBe('invalid')
    const inv = (await listInvites(owner.client, gid)).find((i) => i.code === code)!
    expect(inv.uses).toBe(2)
    expect(inviteStatus(inv)).toBe('full')
  })

  it('취소하면 상태가 revoked이고 더는 참여할 수 없지만, 이미 참여한 사람은 그대로 읽는다', async () => {
    const code = await createInviteRpc(owner.client, gid, { ttlHours: 24, maxUses: 5 })
    const first = await redeem(code)
    expect(first.res.status).toBe('joined')
    await revokeInviteRpc(owner.client, code)
    const inv = (await listInvites(owner.client, gid)).find((i) => i.code === code)!
    expect(inviteStatus(inv)).toBe('revoked')
    expect((await redeem(code)).res.status).toBe('invalid')
    const stillReads = await first.u.client.from('groups').select('id').eq('id', gid)
    expect(stillReads.data).toHaveLength(1)
  })

  it('그룹원 수를 센다', async () => {
    const before = await countViewers(owner.client, gid)
    const code = await createInviteRpc(owner.client, gid, { ttlHours: 24, maxUses: 3 })
    await redeem(code)
    expect(await countViewers(owner.client, gid)).toBe(before + 1)
  })

  it('그룹원·무관한 사용자는 목록을 읽거나 코드를 만들거나 취소할 수 없다', async () => {
    const code = await createInviteRpc(owner.client, gid, { ttlHours: 24, maxUses: 3 })
    const { u: viewer } = await redeem(code)
    expect(await listInvites(viewer.client, gid)).toEqual([])
    await expect(createInviteRpc(viewer.client, gid, { ttlHours: 24, maxUses: 1 })).rejects.toThrow(/forbidden/)
    await expect(revokeInviteRpc(viewer.client, code)).rejects.toThrow(/forbidden/)
    const stranger = await newUser()
    expect(await listInvites(stranger.client, gid)).toEqual([])
    await expect(createInviteRpc(stranger.client, gid, { ttlHours: 24, maxUses: 1 })).rejects.toThrow(/forbidden/)
    expect(await countViewers(stranger.client, gid)).toBe(0)
  })

  it('유효 시간 범위를 벗어나면 거절한다', async () => {
    await expect(createInviteRpc(owner.client, gid, { ttlHours: 0, maxUses: 1 })).rejects.toThrow(/bad_ttl/)
    await expect(createInviteRpc(owner.client, gid, { ttlHours: 24 * 31, maxUses: 1 })).rejects.toThrow(/bad_ttl/)
  })
})
