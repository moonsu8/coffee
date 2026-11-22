import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertNotProduction, configured, joinAsViewer, mustRpc, newUser, seedGroup, sharedUser, type TestUser } from './helpers'

/**
 * supabase/migrations/0006_membership_signal.sql 이 적용돼 있어야 한다.
 * 1-F: 별명 · 승인 흐름(인원 제한 포함) · 소속 변경 신호(profiles.membership_rev) · 그룹원 내보내기/넘기기/삭제/계정 삭제
 */
const d = configured ? describe : describe.skip

const sig = async (u: TestUser) => {
  const { data, error } = await u.client.from('profiles').select('membership_rev').eq('user_id', u.id).single()
  if (error) throw new Error(error.message)
  return (data as { membership_rev: number }).membership_rev
}
const members = async (u: TestUser, gid: string) => {
  const { data, error } = await u.client.from('group_members').select('user_id, role, nickname').eq('group_id', gid)
  if (error) throw new Error(error.message)
  return (data ?? []) as { user_id: string; role: string; nickname: string | null }[]
}
const invite = (o: TestUser, gid: string, approval = false, maxUses = 5) =>
  mustRpc<string>(o.client, 'create_invite', { p_group: gid, p_ttl_hours: 24, p_max_uses: maxUses, p_requires_approval: approval })

d('별명과 그룹원 목록', () => {
  let owner: TestUser
  let stranger: TestUser
  let gid: string

  beforeAll(async () => {
    assertNotProduction()
    owner = await newUser()
    stranger = await newUser()
    ;({ gid } = await seedGroup(owner))
  })

  it('코드로 참여하면 별명이 저장되고, 그룹장은 그룹원 목록(별명·참여 시각)을 읽는다', async () => {
    const v = await newUser()
    const code = await invite(owner, gid)
    const r = await mustRpc<{ status: string }>(v.client, 'redeem_invite', { p_code: code, p_nickname: '  민수  ' })
    expect(r.status).toBe('joined')
    const list = (await members(owner, gid)).filter((m) => m.role === 'viewer')
    expect(list.find((m) => m.user_id === v.id)?.nickname).toBe('민수')
    const { data } = await owner.client.from('group_members').select('joined_at').eq('group_id', gid).eq('user_id', v.id).single()
    expect(Date.parse((data as { joined_at: string }).joined_at)).toBeGreaterThan(0)
  })

  it('별명은 선택이고 20자까지만 저장된다(이전 방식 호출도 그대로 동작)', async () => {
    const v1 = await newUser()
    const v2 = await newUser()
    const code = await invite(owner, gid)
    expect((await mustRpc<{ status: string }>(v1.client, 'redeem_invite', { p_code: code })).status).toBe('joined')
    expect((await mustRpc<{ status: string }>(v2.client, 'redeem_invite', { p_code: code, p_nickname: '가'.repeat(40) })).status).toBe('joined')
    const list = await members(owner, gid)
    expect(list.find((m) => m.user_id === v1.id)?.nickname).toBeNull()
    expect(list.find((m) => m.user_id === v2.id)?.nickname).toHaveLength(20)
  })

  it('그룹원은 다른 그룹원 목록을 읽을 수 없다 (자기 행만)', async () => {
    const v = await newUser()
    await joinAsViewer(owner, gid, v)
    const seen = await members(v, gid)
    expect(seen.every((m) => m.user_id === v.id)).toBe(true)
    expect((await members(stranger, gid)).length).toBe(0)
  })
})

d('승인 흐름', () => {
  let owner: TestUser
  let stranger: TestUser
  let gid: string

  beforeAll(async () => {
    assertNotProduction()
    owner = await newUser()
    stranger = await newUser()
    ;({ gid } = await seedGroup(owner))
  })

  const pending = async (u: TestUser) => {
    const { data, error } = await u.client.from('join_requests').select('id, group_id, user_id, status, nickname').eq('group_id', gid)
    if (error) throw new Error(error.message)
    return (data ?? []) as { id: string; user_id: string; status: string; nickname: string | null }[]
  }

  it('승인 필요 코드: 요청만 생기고(그룹 못 봄), 그룹장이 승인하면 볼 수 있고 별명이 옮겨진다', async () => {
    const v = await newUser()
    const code = await invite(owner, gid, true)
    const r = await mustRpc<{ status: string; group_id: string }>(v.client, 'redeem_invite', { p_code: code, p_nickname: '지은' })
    expect(r.status).toBe('pending')
    expect(await mustRpc(v.client, 'get_group_snapshot', { p_group: gid })).toBeNull()
    const req = (await pending(owner)).find((x) => x.user_id === v.id)!
    expect(req).toMatchObject({ status: 'pending', nickname: '지은' })
    // 요청자는 자기 요청만, 남은 읽지 못한다
    expect((await pending(v)).every((x) => x.user_id === v.id)).toBe(true)
    expect(await pending(stranger)).toHaveLength(0)

    await mustRpc(owner.client, 'resolve_join_request', { p_request: req.id, p_approve: true })
    expect(await mustRpc(v.client, 'get_group_snapshot', { p_group: gid })).not.toBeNull()
    expect((await members(owner, gid)).find((m) => m.user_id === v.id)).toMatchObject({ role: 'viewer', nickname: '지은' })
  })

  it('거절하면 그룹을 볼 수 없고, 같은 코드로 다시 요청하면 대기로 돌아간다', async () => {
    const v = await newUser()
    const code = await invite(owner, gid, true)
    await mustRpc(v.client, 'redeem_invite', { p_code: code })
    const req = (await pending(owner)).find((x) => x.user_id === v.id)!
    await mustRpc(owner.client, 'resolve_join_request', { p_request: req.id, p_approve: false })
    expect((await pending(v))[0].status).toBe('rejected')
    expect(await mustRpc(v.client, 'get_group_snapshot', { p_group: gid })).toBeNull()
    await mustRpc(v.client, 'redeem_invite', { p_code: code })
    expect((await pending(v))[0].status).toBe('pending')
  })

  it('승인도 코드의 인원 제한을 지킨다 (가득 차면 invite_full)', async () => {
    const a = await newUser()
    const b = await newUser()
    const code = await invite(owner, gid, true, 1)
    await mustRpc(a.client, 'redeem_invite', { p_code: code })
    await mustRpc(b.client, 'redeem_invite', { p_code: code })
    const reqs = await pending(owner)
    const ra = reqs.find((x) => x.user_id === a.id)!
    const rb = reqs.find((x) => x.user_id === b.id)!
    await mustRpc(owner.client, 'resolve_join_request', { p_request: ra.id, p_approve: true })
    const second = await owner.client.rpc('resolve_join_request', { p_request: rb.id, p_approve: true })
    expect(second.error?.message).toContain('invite_full')
    expect(await mustRpc(b.client, 'get_group_snapshot', { p_group: gid })).toBeNull()
  })

  it('그룹장이 아니면 승인할 수 없다', async () => {
    const v = await newUser()
    const code = await invite(owner, gid, true)
    await mustRpc(v.client, 'redeem_invite', { p_code: code })
    const req = (await pending(owner)).find((x) => x.user_id === v.id)!
    expect((await v.client.rpc('resolve_join_request', { p_request: req.id, p_approve: true })).error?.message).toContain('forbidden')
    expect((await stranger.client.rpc('resolve_join_request', { p_request: req.id, p_approve: true })).error?.message).toContain('forbidden')
  })
})

d('소속 변경 신호 (profiles.membership_rev)', () => {
  let owner: TestUser

  beforeAll(async () => {
    assertNotProduction()
    owner = await newUser()
  })

  it('참여·내보내기·나가기·넘기기·그룹 삭제에서 해당 사용자의 신호가 오른다', async () => {
    const { gid } = await seedGroup(owner)
    const v = await newUser()
    let s = await sig(v)
    await joinAsViewer(owner, gid, v)
    expect(await sig(v), '참여').toBeGreaterThan(s)

    s = await sig(v)
    await mustRpc(owner.client, 'remove_viewer', { p_group: gid, p_user: v.id })
    expect(await sig(v), '내보내기').toBeGreaterThan(s)

    await joinAsViewer(owner, gid, v)
    s = await sig(v)
    await mustRpc(v.client, 'leave_group', { p_group: gid })
    expect(await sig(v), '나가기').toBeGreaterThan(s)

    await joinAsViewer(owner, gid, v)
    s = await sig(v)
    const so = await sig(owner)
    await mustRpc(owner.client, 'transfer_ownership', { p_group: gid, p_user: v.id })
    expect(await sig(v), '넘기기(새 그룹장)').toBeGreaterThan(s)
    expect(await sig(owner), '넘기기(옛 그룹장)').toBeGreaterThan(so)

    s = await sig(owner)
    await mustRpc(v.client, 'delete_group', { p_group: gid })
    expect(await sig(owner), '그룹 삭제').toBeGreaterThan(s)
  })

  it('승인 필요 요청이 오면 요청자와 그룹장의 신호가 오른다', async () => {
    const { gid } = await seedGroup(owner)
    const v = await newUser()
    const code = await invite(owner, gid, true)
    const so = await sig(owner)
    const sv = await sig(v)
    await mustRpc(v.client, 'redeem_invite', { p_code: code })
    expect(await sig(owner)).toBeGreaterThan(so)
    expect(await sig(v)).toBeGreaterThan(sv)
  })

  it('남의 신호 행은 읽을 수 없다', async () => {
    const other = await newUser()
    const { data } = await other.client.from('profiles').select('user_id').eq('user_id', owner.id)
    expect(data ?? []).toHaveLength(0)
  })
})

/** 내보내진 그룹원이 늦게 알게 되는 문제의 해결: 본인 profiles 행의 Realtime 알림 */
d('Realtime: 소속 변경 알림', () => {
  function listenMe(c: SupabaseClient, uid: string) {
    let count = 0
    let status = ''
    const ch = c
      .channel(`me:${uid}:${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `user_id=eq.${uid}` }, () => {
        count++
      })
      .subscribe((s) => {
        status = s
      })
    return {
      count: () => count,
      /** SUBSCRIBED를 기다린 뒤, 무해한 변경을 일으켜 알림이 실제로 도착하는지(변경 감지 준비 완료) 확인한다 */
      ready: async (probe: () => Promise<unknown>) => {
        for (let i = 0; i < 60 && status !== 'SUBSCRIBED'; i++) await new Promise((r) => setTimeout(r, 250))
        if (status !== 'SUBSCRIBED') throw new Error('Realtime 구독 실패: ' + status)
        for (let i = 0; i < 20; i++) {
          const n = count
          await probe()
          for (let t = 0; t < 1500 && count === n; t += 100) await new Promise((r) => setTimeout(r, 100))
          if (count > n) return
        }
        throw new Error('Realtime 변경 감지가 준비되지 않았어요')
      },
      close: () => void c.removeChannel(ch),
    }
  }
  const until = async (f: () => boolean, ms = 8000) => {
    for (let t = 0; t < ms && !f(); t += 200) await new Promise((r) => setTimeout(r, 200))
    return f()
  }
  let owner: TestUser

  beforeAll(async () => {
    assertNotProduction()
    owner = await newUser()
  })

  it('내보내진 그룹원이 몇 초 안에 알림을 받는다', async () => {
    const { gid } = await seedGroup(owner)
    const v = await sharedUser('rt-viewer')
    await joinAsViewer(owner, gid, v)
    const l = listenMe(v.client, v.id)
    await l.ready(() => mustRpc(v.client, 'confirm_age', { p_terms_version: 'probe' }))
    const before = l.count()
    await mustRpc(owner.client, 'remove_viewer', { p_group: gid, p_user: v.id })
    expect(await until(() => l.count() > before)).toBe(true)
    l.close()
  })

  it('그룹이 삭제되면 그룹원이 알림을 받는다', async () => {
    const { gid } = await seedGroup(owner)
    const v = await sharedUser('rt-viewer')
    await joinAsViewer(owner, gid, v)
    const l = listenMe(v.client, v.id)
    await l.ready(() => mustRpc(v.client, 'confirm_age', { p_terms_version: 'probe' }))
    const before = l.count()
    await mustRpc(owner.client, 'delete_group', { p_group: gid })
    expect(await until(() => l.count() > before)).toBe(true)
    l.close()
  })

  it('승인되면 요청자가 알림을 받고, 요청이 오면 그룹장이 알림을 받는다', async () => {
    const { gid } = await seedGroup(owner)
    const v = await newUser()
    const code = await invite(owner, gid, true)
    const lo = listenMe(owner.client, owner.id)
    const lv = listenMe(v.client, v.id)
    await Promise.all([lo.ready(() => mustRpc(owner.client, 'confirm_age', { p_terms_version: 'probe' })), lv.ready(() => mustRpc(v.client, 'confirm_age', { p_terms_version: 'probe' }))])
    const o0 = lo.count()
    await mustRpc(v.client, 'redeem_invite', { p_code: code, p_nickname: '새 사람' })
    expect(await until(() => lo.count() > o0)).toBe(true)
    const { data } = await owner.client.from('join_requests').select('id').eq('group_id', gid).eq('user_id', v.id).single()
    const v0 = lv.count()
    await mustRpc(owner.client, 'resolve_join_request', { p_request: (data as { id: string }).id, p_approve: true })
    expect(await until(() => lv.count() > v0)).toBe(true)
    lo.close()
    lv.close()
  })
})

d('계정 삭제와 그룹장 넘기기', () => {
  it('그룹원이 있는 그룹장이 계정을 지우면 그 그룹이 사라지고 그룹원의 소속에서도 빠진다', async () => {
    assertNotProduction()
    const owner = await newUser()
    const v = await newUser()
    const { gid } = await seedGroup(owner)
    await joinAsViewer(owner, gid, v)
    await mustRpc(owner.client, 'delete_my_account')
    expect(await mustRpc(v.client, 'get_group_snapshot', { p_group: gid })).toBeNull()
    expect((await members(v, gid)).length).toBe(0)
  })

  it('먼저 그룹장을 넘기고 계정을 지우면 그룹은 새 그룹장과 함께 남는다', async () => {
    const owner = await newUser()
    const v = await newUser()
    const { gid } = await seedGroup(owner)
    await joinAsViewer(owner, gid, v)
    await mustRpc(owner.client, 'transfer_ownership', { p_group: gid, p_user: v.id })
    await mustRpc(owner.client, 'delete_my_account')
    expect(await mustRpc(v.client, 'get_group_snapshot', { p_group: gid })).not.toBeNull()
    expect((await members(v, gid)).find((m) => m.user_id === v.id)?.role).toBe('owner')
  })
})
