import { beforeAll, describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertNotProduction, configured, joinAsViewer, mustRpc, newUser, seedGroup, type TestUser } from './helpers'

/**
 * supabase/migrations/0005_rev_bump.sql 이 적용돼 있어야 한다.
 * 1-E: 내용이 바뀌는 모든 서버 경로에서 groups.rev가 오르는가 + Realtime으로 그룹원에게 알림이 가는가
 *      + 그룹이 삭제되거나 내가 빠졌을 때 소속 목록·스냅샷에서 사라지는가(앱의 "그룹이 없어졌어요" 안내 근거).
 */
const d = configured ? describe : describe.skip

const revOf = async (u: TestUser, gid: string) => {
  const { data, error } = await u.client.from('groups').select('rev').eq('id', gid).single()
  if (error) throw new Error(error.message)
  return (data as { rev: number }).rev
}

d('groups.rev: 모든 쓰기 경로에서 오른다', () => {
  let owner: TestUser
  let viewer: TestUser
  let gid: string
  let memberId: string

  beforeAll(async () => {
    assertNotProduction()
    owner = await newUser()
    viewer = await newUser()
    ;({ gid, memberId } = await seedGroup(owner))
    await joinAsViewer(owner, gid, viewer)
  })

  it('직접 테이블 쓰기(그룹장, RLS 허용 경로): 내용 테이블 insert/update/delete 모두 오른다', async () => {
    const c = owner.client
    let r = await revOf(owner, gid)
    const bumped = async (label: string, p: PromiseLike<{ error: { message: string } | null }>) => {
      const { error } = await p
      expect(error?.message, label).toBeUndefined()
      const n = await revOf(owner, gid)
      expect(n, label).toBeGreaterThan(r)
      r = n
    }
    await bumped('members insert', c.from('members').insert({ group_id: gid, name: '다온', sort: 3 }))
    await bumped('members update', c.from('members').update({ name: '가람2' }).eq('id', memberId))
    await bumped('records insert', c.from('records').insert({ group_id: gid, date: '2026-11-18', member_id: memberId, memo: 'x' }))
    await bumped('records update', c.from('records').update({ memo: 'y' }).eq('group_id', gid).eq('date', '2026-11-18'))
    await bumped('absences insert', c.from('absences').insert({ group_id: gid, member_id: memberId, from_date: '2026-11-20', to_date: '2026-11-21' }))
    await bumped('skip_days insert', c.from('skip_days').insert({ group_id: gid, date: '2026-11-25' }))
    await bumped('orders insert', c.from('orders').insert({ group_id: gid, date: '2026-11-18', payload: { items: [] } }))
    await bumped('prices upsert', c.from('prices').upsert({ group_id: gid, payload: { rows: [] } }))
    await bumped('records delete', c.from('records').delete().eq('group_id', gid).eq('date', '2026-11-18'))
    await bumped('skip_days delete', c.from('skip_days').delete().eq('group_id', gid))
  })

  it('그룹 이름·이모지·요일·설정 수정(직접)도 오른다', async () => {
    const c = owner.client
    for (const patch of [{ name: '새 이름' }, { emoji: '🍱' }, { schedule: [1, 3, 5] }, { config: { presetId: 'x' } }]) {
      const before = await revOf(owner, gid)
      const { error } = await c.from('groups').update(patch).eq('id', gid)
      expect(error?.message).toBeUndefined()
      expect(await revOf(owner, gid), JSON.stringify(patch)).toBeGreaterThan(before)
    }
  })

  it('내용이 그대로인 갱신은 올리지 않는다', async () => {
    const before = await revOf(owner, gid)
    const { error } = await owner.client.from('groups').update({ name: '새 이름' }).eq('id', gid)
    expect(error?.message).toBeUndefined()
    expect(await revOf(owner, gid)).toBe(before)
  })

  it('apply_group_ops는 여러 변경·그룹 이름 변경이 있어도 정확히 base+1 (트리거가 또 올리지 않는다)', async () => {
    const before = await revOf(owner, gid)
    const res = await mustRpc<{ status: string; rev: number }>(owner.client, 'apply_group_ops', {
      p_group: gid,
      p_base_rev: before,
      p_ops: [
        { kind: 'group', patch: { name: '묶음 변경', emoji: '☕' } },
        { kind: 'upsert', table: 'members', row: { id: crypto.randomUUID(), name: '라온', sort: 4 } },
        { kind: 'upsert', table: 'skip_days', row: { date: '2026-12-01' } },
        { kind: 'delete', table: 'skip_days', key: '2026-12-01' },
      ],
    })
    expect(res).toEqual({ status: 'ok', rev: before + 1 })
    expect(await revOf(owner, gid)).toBe(before + 1)
  })

  it('import_group으로 만든 그룹은 rev가 한 번만(1) 올라 있고, 같은 key 재시도는 그대로', async () => {
    const key = crypto.randomUUID()
    const payload = {
      name: '옮김',
      emoji: '☕',
      schedule: 'weekdays',
      config: {},
      import_key: key,
      members: [{ ref: crypto.randomUUID(), name: 'a', sort: 1 }],
      records: [],
      absences: [],
      skip_days: ['2026-11-30'],
      orders: [],
    }
    const g1 = await mustRpc<string>(owner.client, 'import_group', { p: payload })
    const r1 = await revOf(owner, g1)
    expect(r1).toBe(1)
    const g2 = await mustRpc<string>(owner.client, 'import_group', { p: payload })
    expect(g2).toBe(g1)
    expect(await revOf(owner, g1)).toBe(r1)
  })

  it('그룹원이 들어오거나 나가도, 내보내도 rev는 그대로다 (그룹장의 쓰기가 충돌하면 안 된다)', async () => {
    const before = await revOf(owner, gid)
    const v2 = await newUser()
    await joinAsViewer(owner, gid, v2)
    expect(await revOf(owner, gid)).toBe(before)
    await mustRpc(v2.client, 'leave_group', { p_group: gid })
    expect(await revOf(owner, gid)).toBe(before)
    const v3 = await newUser()
    await joinAsViewer(owner, gid, v3)
    await mustRpc(owner.client, 'remove_viewer', { p_group: gid, p_user: v3.id })
    expect(await revOf(owner, gid)).toBe(before)
  })

  it('그룹장 넘기기(역할 변경)는 rev를 올린다', async () => {
    const o2 = await newUser()
    const v = await newUser()
    const { gid: g } = await seedGroup(o2)
    await joinAsViewer(o2, g, v)
    const before = await revOf(o2, g)
    await mustRpc(o2.client, 'transfer_ownership', { p_group: g, p_user: v.id })
    expect(await revOf(v, g)).toBeGreaterThan(before)
  })

  it('그룹원은 직접 쓰기가 막혀 있어서 rev를 올릴 수 없다', async () => {
    const before = await revOf(owner, gid)
    const ins = await viewer.client.from('members').insert({ group_id: gid, name: '침입', sort: 9 }).select()
    expect(ins.data ?? []).toHaveLength(0)
    const upd = await viewer.client.from('groups').update({ name: '침입' }).eq('id', gid).select()
    expect(upd.data ?? []).toHaveLength(0)
    expect(await revOf(owner, gid)).toBe(before)
  })
})

/** Realtime: 그룹원이 groups 행 변경 알림을 받는다. 앱은 알림 내용을 믿지 않고 "다시 읽기" 신호로만 쓴다 */
d('Realtime: groups.rev 알림', () => {
  let owner: TestUser
  let viewer: TestUser
  let stranger: TestUser
  let gid: string

  function listen(c: SupabaseClient, id: string) {
    const events: { type: string; rev?: number }[] = []
    let status = ''
    const ch = c
      .channel(`t:${id}:${Math.random()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups', filter: `id=eq.${id}` }, (p) => {
        events.push({ type: p.eventType, rev: (p.new as { rev?: number } | undefined)?.rev })
      })
      .subscribe((s) => {
        status = s
      })
    const ready = async () => {
      for (let i = 0; i < 60 && status !== 'SUBSCRIBED'; i++) await new Promise((r) => setTimeout(r, 250))
      if (status !== 'SUBSCRIBED') throw new Error('Realtime 구독 실패: ' + status)
      // SUBSCRIBED가 된 직후에는 변경 감지가 아직 준비 중일 수 있어 잠깐 기다린다(전체 실행에서 드물게 첫 알림을 놓치던 현상)
      await new Promise((r) => setTimeout(r, 1500))
    }
    return { events, ready, close: () => void c.removeChannel(ch) }
  }
  const until = async (f: () => boolean, ms = 8000) => {
    for (let t = 0; t < ms && !f(); t += 200) await new Promise((r) => setTimeout(r, 200))
    return f()
  }

  beforeAll(async () => {
    assertNotProduction()
    owner = await newUser()
    viewer = await newUser()
    stranger = await newUser()
    ;({ gid } = await seedGroup(owner))
    await joinAsViewer(owner, gid, viewer)
  })

  it('그룹장이 쓰면(apply_group_ops) 그룹원이 새 rev 알림을 받고, 소속 아닌 사람은 못 받는다', async () => {
    const v = listen(viewer.client, gid)
    const s = listen(stranger.client, gid)
    await Promise.all([v.ready(), s.ready()])
    const base = await revOf(owner, gid)
    const res = await mustRpc<{ status: string; rev: number }>(owner.client, 'apply_group_ops', {
      p_group: gid,
      p_base_rev: base,
      p_ops: [{ kind: 'upsert', table: 'skip_days', row: { date: '2026-12-24' } }],
    })
    expect(res.status).toBe('ok')
    expect(await until(() => v.events.some((e) => e.type === 'UPDATE' && e.rev === base + 1))).toBe(true)
    await new Promise((r) => setTimeout(r, 1500))
    expect(s.events).toHaveLength(0)
    v.close()
    s.close()
  })

  it('직접 쓰기(이름 변경)도 알림이 간다', async () => {
    const v = listen(viewer.client, gid)
    await v.ready()
    const base = await revOf(owner, gid)
    const { error } = await owner.client.from('groups').update({ name: '알림 확인' }).eq('id', gid)
    expect(error?.message).toBeUndefined()
    expect(await until(() => v.events.some((e) => e.type === 'UPDATE' && (e.rev ?? 0) > base))).toBe(true)
    v.close()
  })
})

d('그룹이 사라지거나 내가 빠졌을 때 (앱의 "그룹이 없어졌어요" 근거)', () => {
  const memberOf = async (u: TestUser) => ((await u.client.from('group_members').select('group_id').eq('user_id', u.id)).data ?? []).map((m) => m.group_id as string)

  it('그룹 삭제: 그룹원의 소속 목록·스냅샷에서 사라지고 데이터가 지워진다', async () => {
    const owner = await newUser()
    const viewer = await newUser()
    const { gid } = await seedGroup(owner)
    await joinAsViewer(owner, gid, viewer)
    expect(await memberOf(viewer)).toContain(gid)
    await mustRpc(owner.client, 'delete_group', { p_group: gid })
    expect(await memberOf(viewer)).not.toContain(gid)
    expect(await mustRpc(viewer.client, 'get_group_snapshot', { p_group: gid })).toBeNull()
    for (const t of ['members', 'records']) {
      const { data } = await owner.client.from(t).select('*').eq('group_id', gid)
      expect(data ?? [], t).toHaveLength(0)
    }
    const g = await owner.client.from('groups').select('id').eq('id', gid)
    expect(g.data ?? []).toHaveLength(0)
  })

  it('그룹장이 내보내면: 그룹원의 소속 목록에서 사라지고 스냅샷은 null', async () => {
    const owner = await newUser()
    const viewer = await newUser()
    const { gid } = await seedGroup(owner)
    await joinAsViewer(owner, gid, viewer)
    await mustRpc(owner.client, 'remove_viewer', { p_group: gid, p_user: viewer.id })
    expect(await memberOf(viewer)).not.toContain(gid)
    expect(await mustRpc(viewer.client, 'get_group_snapshot', { p_group: gid })).toBeNull()
  })

  it('스스로 나가면 마찬가지', async () => {
    const owner = await newUser()
    const viewer = await newUser()
    const { gid } = await seedGroup(owner)
    await joinAsViewer(owner, gid, viewer)
    await mustRpc(viewer.client, 'leave_group', { p_group: gid })
    expect(await memberOf(viewer)).not.toContain(gid)
    expect(await mustRpc(viewer.client, 'get_group_snapshot', { p_group: gid })).toBeNull()
  })
})
