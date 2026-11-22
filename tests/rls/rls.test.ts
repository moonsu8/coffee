import { beforeAll, describe, expect, it } from 'vitest'
import { anonClient, assertNotProduction, configured, joinAsViewer, mustRpc, newUser, seedGroup, type TestUser } from './helpers'

/**
 * 공유 그룹 RLS·RPC 검증. 테스트 전용 Supabase 프로젝트가 있어야 돈다: npm run test:rls
 * (설정이 없으면 건너뛴다. 방법: docs/SUPABASE.md)
 */
const d = configured ? describe : describe.skip

const DATA_TABLES = ['members', 'records', 'absences', 'skip_days', 'orders', 'prices'] as const

d('공유 그룹 RLS', () => {
  let owner: TestUser
  let viewer: TestUser
  let stranger: TestUser
  let gid: string
  let memberId: string
  let other: { gid: string } // 다른 그룹장의 그룹

  beforeAll(async () => {
    assertNotProduction()
    const probe = await anonClient().rpc('is_test_project')
    if (probe.error || probe.data !== true) {
      throw new Error('이 프로젝트에는 supabase/test-only/sentinel.sql이 적용되지 않았어요. 테스트 전용 프로젝트가 맞는지 확인하세요.')
    }
    owner = await newUser()
    viewer = await newUser()
    stranger = await newUser()
    ;({ gid, memberId } = await seedGroup(owner))
    await joinAsViewer(owner, gid, viewer)
    const otherOwner = await newUser()
    other = { gid: (await seedGroup(otherOwner)).gid }
  })

  describe('로그인하지 않은 사용자', () => {
    it('테이블을 읽지 못하고 RPC를 못 부른다', async () => {
      const c = anonClient()
      const r = await c.from('groups').select('*')
      expect(r.error || r.data?.length === 0).toBeTruthy()
      for (const fn of ['create_group', 'redeem_invite', 'confirm_age']) {
        const x = await c.rpc(fn, { p_name: 'x', p_code: 'AAAAAAAA' })
        expect(x.error).toBeTruthy()
      }
    })
  })

  describe('만 14세 확인', () => {
    it('확인 전에는 그룹을 만들거나 초대에 참여할 수 없다', async () => {
      const u = await newUser({ adult: false })
      const a = await u.client.rpc('create_group', { p_name: 'x' })
      expect(a.error?.message).toContain('age_not_confirmed')
      const code = await mustRpc<string>(owner.client, 'create_invite', { p_group: gid })
      const b = await u.client.rpc('redeem_invite', { p_code: code })
      expect(b.error?.message).toContain('age_not_confirmed')
    })
    it('profiles를 직접 쓸 수 없다', async () => {
      const r = await stranger.client.from('profiles').update({ age_confirmed_at: null }).eq('user_id', stranger.id).select()
      expect(r.data ?? []).toHaveLength(0)
      const i = await stranger.client.from('profiles').insert({ user_id: stranger.id })
      expect(i.error).toBeTruthy()
    })
  })

  describe('그룹장(owner)', () => {
    it('자기 그룹 데이터를 읽고 쓴다', async () => {
      const upd = await owner.client.from('members').update({ name: '가람2' }).eq('id', memberId).select()
      expect(upd.error).toBeNull()
      expect(upd.data).toHaveLength(1)
      const add = await owner.client.from('skip_days').insert({ group_id: gid, date: '2026-12-25' })
      expect(add.error).toBeNull()
      const del = await owner.client.from('skip_days').delete().eq('group_id', gid).eq('date', '2026-12-25').select()
      expect(del.data).toHaveLength(1)
      const g = await owner.client.from('groups').update({ name: '테스트 그룹' }).eq('id', gid).select()
      expect(g.data).toHaveLength(1)
    })
    it('다른 그룹에는 쓸 수 없다', async () => {
      const r = await owner.client.from('records').insert({ group_id: other.gid, date: '2026-11-18', member_id: memberId })
      expect(r.error).toBeTruthy()
      const u = await owner.client.from('groups').update({ name: '탈취' }).eq('id', other.gid).select()
      expect(u.data ?? []).toHaveLength(0)
    })
    it('하루에 기록은 1건이다', async () => {
      const dup = await owner.client.from('records').insert({ group_id: gid, date: '2026-11-17', member_id: memberId })
      expect(dup.error).toBeTruthy()
    })
    it('groups를 직접 만들거나 지울 수 없다 (RPC로만)', async () => {
      const i = await owner.client.from('groups').insert({ name: '직접' })
      expect(i.error).toBeTruthy()
      const d = await owner.client.from('groups').delete().eq('id', gid).select()
      expect(d.data ?? []).toHaveLength(0)
    })
  })

  describe('그룹원(viewer)', () => {
    it('그룹 데이터를 읽는다', async () => {
      for (const t of ['groups', 'members', 'records'] as const) {
        const r = await viewer.client.from(t).select('*')
        expect(r.error).toBeNull()
        expect(r.data!.length).toBeGreaterThan(0)
      }
      const e = await viewer.client.from('entitlements').select('*').eq('group_id', gid)
      expect(e.data).toHaveLength(1)
    })
    it('쓸 수 없다 (insert 거절, update/delete는 0행)', async () => {
      for (const t of DATA_TABLES) {
        const row = t === 'prices' ? { group_id: gid } : t === 'records' ? { group_id: gid, date: '2026-11-19', member_id: memberId } : t === 'members' ? { group_id: gid, name: '침입' } : t === 'absences' ? { group_id: gid, member_id: memberId, from_date: '2026-11-20', to_date: '2026-11-21' } : { group_id: gid, date: '2026-11-20' }
        const i = await viewer.client.from(t).insert(row)
        expect(i.error, `${t} insert`).toBeTruthy()
      }
      const u = await viewer.client.from('members').update({ name: '변조' }).eq('id', memberId).select()
      expect(u.data ?? []).toHaveLength(0)
      const dl = await viewer.client.from('records').delete().eq('group_id', gid).select()
      expect(dl.data ?? []).toHaveLength(0)
      const g = await viewer.client.from('groups').update({ name: '변조' }).eq('id', gid).select()
      expect(g.data ?? []).toHaveLength(0)
      const check = await owner.client.from('records').select('*').eq('group_id', gid)
      expect(check.data).toHaveLength(1)
    })
    it('초대·요청·소속 목록을 보거나 바꿀 수 없다', async () => {
      const inv = await viewer.client.from('invites').select('*')
      expect(inv.data ?? []).toHaveLength(0)
      const mem = await viewer.client.from('group_members').select('*').eq('group_id', gid)
      expect((mem.data ?? []).every((r) => r.user_id === viewer.id)).toBe(true)
      const up = await viewer.client.from('group_members').update({ role: 'owner' }).eq('user_id', viewer.id).select()
      expect(up.data ?? []).toHaveLength(0)
      const ins = await viewer.client.from('group_members').insert({ group_id: other.gid, user_id: viewer.id, role: 'viewer' })
      expect(ins.error).toBeTruthy()
      expect((await viewer.client.rpc('create_invite', { p_group: gid })).error?.message).toContain('forbidden')
      expect((await viewer.client.rpc('remove_viewer', { p_group: gid, p_user: owner.id })).error?.message).toContain('forbidden')
      expect((await viewer.client.rpc('delete_group', { p_group: gid })).error?.message).toContain('forbidden')
      expect((await viewer.client.rpc('transfer_ownership', { p_group: gid, p_user: viewer.id })).error?.message).toContain('forbidden')
    })
    it('entitlements를 쓸 수 없다', async () => {
      const r = await viewer.client.from('entitlements').update({ plan: 'pro' }).eq('group_id', gid).select()
      expect(r.data ?? []).toHaveLength(0)
    })
  })

  describe('그룹과 무관한 사용자', () => {
    it('아무것도 읽지 못한다', async () => {
      for (const t of ['groups', 'members', 'records', 'absences', 'skip_days', 'orders', 'prices', 'invites', 'entitlements', 'join_requests'] as const) {
        const r = await stranger.client.from(t).select('*')
        expect(r.data ?? [], t).toHaveLength(0)
      }
      const gm = await stranger.client.from('group_members').select('*')
      expect(gm.data ?? []).toHaveLength(0)
    })
    it('쓸 수 없다', async () => {
      const r = await stranger.client.from('records').insert({ group_id: gid, date: '2026-11-30', member_id: memberId })
      expect(r.error).toBeTruthy()
      const u = await stranger.client.from('groups').update({ name: '탈취' }).eq('id', gid).select()
      expect(u.data ?? []).toHaveLength(0)
      const e = await stranger.client.from('entitlements').insert({ group_id: gid, plan: 'pro' })
      expect(e.error).toBeTruthy()
      const iv = await stranger.client.from('invites').insert({ group_id: gid, code: 'ABCDEFGH', created_by: stranger.id, expires_at: '2099-01-01' })
      expect(iv.error).toBeTruthy()
    })
  })

  describe('초대', () => {
    it('코드는 8자리이고 헷갈리는 글자(0 O 1 I)가 없다', async () => {
      for (let i = 0; i < 5; i++) {
        const code = await mustRpc<string>(owner.client, 'create_invite', { p_group: gid })
        expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/)
        expect(code).not.toMatch(/[01OI]/)
      }
    })
    it('소문자·공백이 섞여도 참여된다', async () => {
      const code = await mustRpc<string>(owner.client, 'create_invite', { p_group: gid })
      const u = await newUser()
      const r = await mustRpc<{ status: string }>(u.client, 'redeem_invite', { p_code: ` ${code.toLowerCase()} ` })
      expect(r.status).toBe('joined')
      const read = await u.client.from('groups').select('id').eq('id', gid)
      expect(read.data).toHaveLength(1)
    })
    it('틀린 코드·취소된 코드·사용 횟수 초과는 invalid', async () => {
      const u = await newUser()
      expect((await mustRpc<{ status: string }>(u.client, 'redeem_invite', { p_code: 'ZZZZZZZZ' })).status).toBe('invalid')
      const revoked = await mustRpc<string>(owner.client, 'create_invite', { p_group: gid })
      await mustRpc(owner.client, 'revoke_invite', { p_code: revoked })
      expect((await mustRpc<{ status: string }>(u.client, 'redeem_invite', { p_code: revoked })).status).toBe('invalid')
      const once = await mustRpc<string>(owner.client, 'create_invite', { p_group: gid, p_max_uses: 1 })
      const a = await newUser()
      expect((await mustRpc<{ status: string }>(a.client, 'redeem_invite', { p_code: once })).status).toBe('joined')
      expect((await mustRpc<{ status: string }>(u.client, 'redeem_invite', { p_code: once })).status).toBe('invalid')
    })
    it('유효 시간(ttl) 범위를 검사한다', async () => {
      const bad = await owner.client.rpc('create_invite', { p_group: gid, p_ttl_hours: 0 })
      expect(bad.error?.message).toContain('bad_ttl')
      // 만료된 코드 자체는 자동으로 검증하지 못한다(클라이언트가 invites를 고칠 수 없고 시간을 되돌릴 수도 없다). [미검증]
    })
    it('실패가 10번 쌓이면 rate_limited', async () => {
      const u = await newUser()
      for (let i = 0; i < 10; i++) {
        expect((await mustRpc<{ status: string }>(u.client, 'redeem_invite', { p_code: 'ZZZZZZZZ' })).status).toBe('invalid')
      }
      const r = await u.client.rpc('redeem_invite', { p_code: 'ZZZZZZZZ' })
      expect(r.error?.message).toContain('rate_limited')
    })
    it('그룹장 승인 옵션: pending → 승인 전에는 못 보고, 승인하면 본다', async () => {
      const code = await mustRpc<string>(owner.client, 'create_invite', { p_group: gid, p_requires_approval: true })
      const u = await newUser()
      expect((await mustRpc<{ status: string }>(u.client, 'redeem_invite', { p_code: code })).status).toBe('pending')
      expect((await u.client.from('groups').select('id').eq('id', gid)).data ?? []).toHaveLength(0)
      const reqs = await owner.client.from('join_requests').select('*').eq('group_id', gid).eq('status', 'pending')
      expect(reqs.data).toHaveLength(1)
      await mustRpc(owner.client, 'resolve_join_request', { p_request: reqs.data![0].id, p_approve: true })
      expect((await u.client.from('groups').select('id').eq('id', gid)).data).toHaveLength(1)
      // 그룹원은 요청을 처리할 수 없다
      expect((await u.client.rpc('resolve_join_request', { p_request: reqs.data![0].id, p_approve: false })).error?.message).toContain('forbidden')
    })
  })

  describe('그룹장 기능', () => {
    it('그룹원 내보내기 / 스스로 나가기', async () => {
      const a = await newUser()
      const b = await newUser()
      await joinAsViewer(owner, gid, a)
      await joinAsViewer(owner, gid, b)
      await mustRpc(owner.client, 'remove_viewer', { p_group: gid, p_user: a.id })
      expect((await a.client.from('groups').select('id').eq('id', gid)).data ?? []).toHaveLength(0)
      await mustRpc(b.client, 'leave_group', { p_group: gid })
      expect((await b.client.from('groups').select('id').eq('id', gid)).data ?? []).toHaveLength(0)
      expect((await owner.client.rpc('leave_group', { p_group: gid })).error?.message).toContain('owner_cannot_leave')
    })
    it('그룹장 넘기기: 새 그룹장만 쓸 수 있다', async () => {
      const o = await newUser()
      const v = await newUser()
      const g = await seedGroup(o)
      await joinAsViewer(o, g.gid, v)
      expect((await o.client.rpc('transfer_ownership', { p_group: g.gid, p_user: stranger.id })).error?.message).toContain('target_not_member')
      await mustRpc(o.client, 'transfer_ownership', { p_group: g.gid, p_user: v.id })
      expect((await v.client.from('skip_days').insert({ group_id: g.gid, date: '2026-12-01' })).error).toBeNull()
      expect((await o.client.from('skip_days').insert({ group_id: g.gid, date: '2026-12-02' })).error).toBeTruthy()
    })
    it('그룹 삭제: 모든 데이터와 그룹원 접근이 사라진다', async () => {
      const o = await newUser()
      const v = await newUser()
      const g = await seedGroup(o)
      await joinAsViewer(o, g.gid, v)
      await mustRpc(o.client, 'delete_group', { p_group: g.gid })
      for (const t of ['groups', 'members', 'records', 'entitlements'] as const) {
        expect((await v.client.from(t).select('*').eq(t === 'groups' ? 'id' : 'group_id', g.gid)).data ?? [], t).toHaveLength(0)
        expect((await o.client.from(t).select('*').eq(t === 'groups' ? 'id' : 'group_id', g.gid)).data ?? [], t).toHaveLength(0)
      }
    })
    it('계정 삭제: 내 그룹과 소속이 즉시 지워진다', async () => {
      const o = await newUser()
      const v = await newUser()
      const g = await seedGroup(o)
      await joinAsViewer(o, g.gid, v)
      await mustRpc(o.client, 'delete_my_account')
      expect((await v.client.from('groups').select('id').eq('id', g.gid)).data ?? []).toHaveLength(0)
      expect((await v.client.from('members').select('id').eq('group_id', g.gid)).data ?? []).toHaveLength(0)
    })
  })

  describe('기기 → 서버 옮기기 (import_group)', () => {
    const payload = (key: string) => ({
      import_key: key,
      name: '옮긴 그룹',
      emoji: '☕',
      schedule: 'weekdays',
      config: { presetId: 'coffee', actionLabel: '샀어요', fairness: 'money', orders: true, themeId: 'coffee' },
      members: [
        { ref: 'm1', name: '가람', sort: 1 },
        { ref: 'm2', name: '나래', sort: 2, payload: { favorite: { menu: '아메리카노' } } },
      ],
      records: [
        { date: '2026-11-16', member_ref: 'm1', memo: '메모' },
        { date: '2026-11-17', member_ref: 'gone', payload: { pricing: { total: 9000 } } }, // 삭제된 멤버의 기록도 보존
      ],
      absences: [{ member_ref: 'm2', from: '2026-11-18', to: '2026-11-20' }],
      skip_days: ['2026-12-25'],
      orders: [{ date: '2026-11-16', payload: { items: [] } }],
      prices: { payload: { priceList: [] } },
    })
    it('전부 옮기고, 같은 key로 다시 해도 중복되지 않는다', async () => {
      const o = await newUser()
      const key = crypto.randomUUID()
      const g1 = await mustRpc<string>(o.client, 'import_group', { p: payload(key) })
      const g2 = await mustRpc<string>(o.client, 'import_group', { p: payload(key) })
      expect(g2).toBe(g1)
      expect((await o.client.from('members').select('*').eq('group_id', g1)).data).toHaveLength(2)
      const recs = await o.client.from('records').select('*').eq('group_id', g1)
      expect(recs.data).toHaveLength(2)
      expect(recs.data!.find((r) => r.date === '2026-11-17')!.payload).toEqual({ pricing: { total: 9000 } })
      expect((await o.client.from('absences').select('*').eq('group_id', g1)).data).toHaveLength(1)
      expect((await o.client.from('skip_days').select('*').eq('group_id', g1)).data).toHaveLength(1)
      expect((await o.client.from('prices').select('*').eq('group_id', g1)).data).toHaveLength(1)
      expect((await o.client.from('groups').select('*').eq('id', g1)).data![0].config.fairness).toBe('money')
    })
    it('너무 크거나 잘못된 입력은 아무것도 남기지 않는다', async () => {
      const o = await newUser()
      const big = { ...payload(crypto.randomUUID()), members: Array.from({ length: 101 }, (_, i) => ({ ref: `m${i}`, name: `이름${i}`, sort: i })) }
      expect((await o.client.rpc('import_group', { p: big })).error?.message).toContain('too_large')
      const bad = { ...payload(crypto.randomUUID()), records: [{ date: 'not-a-date', member_ref: 'm1' }] }
      expect((await o.client.rpc('import_group', { p: bad })).error).toBeTruthy()
      expect((await o.client.from('groups').select('id')).data ?? []).toHaveLength(0)
    })
    it('다른 사람이 같은 key로 호출해도 남의 그룹을 돌려받지 못한다', async () => {
      const o = await newUser()
      const key = crypto.randomUUID()
      await mustRpc<string>(o.client, 'import_group', { p: payload(key) })
      const x = await newUser()
      const r = await x.client.rpc('import_group', { p: payload(key) })
      expect(r.error).toBeTruthy() // import_key unique 위반: 남의 그룹 id를 알려 주지 않는다
    })
  })
})
