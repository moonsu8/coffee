import { beforeAll, describe, expect, it } from 'vitest'
import { assertNotProduction, configured, mustRpc, newUser, type TestUser } from './helpers'
import { groupToImport, remapMemberIds, rowsToGroup, type GroupRows } from '../../src/logic/remote-map'
import { richCoffeeGroup, richGeneralGroup } from '../../src/lib/testing'
import type { Group } from '../../src/types'

/**
 * 기기의 그룹 → import_group → 서버 행 → 다시 Group 으로 읽었을 때 값이 그대로인지(실제 DB로) 확인한다.
 * supabase/migrations/0002_import_keep_ids.sql 이 적용돼 있어야 한다.
 */
const d = configured ? describe : describe.skip

/** 실행마다 달라지는 uuid 순서열 (멤버 id는 서버 PK라 실행마다 겹치면 안 된다) */
function uuidSeq() {
  const base = crypto.randomUUID().slice(0, 24)
  let n = 0
  return () => `${base}${(++n).toString(16).padStart(12, '0')}`
}

async function readRows(user: TestUser, gid: string): Promise<GroupRows> {
  const c = user.client
  const one = async <T>(q: PromiseLike<{ data: T | null; error: { message: string } | null }>) => {
    const { data, error } = await q
    if (error) throw new Error(error.message)
    return data as T
  }
  return {
    group: await one(c.from('groups').select('id,name,emoji,schedule,config').eq('id', gid).single()),
    members: await one(c.from('members').select('*').eq('group_id', gid)),
    records: await one(c.from('records').select('*').eq('group_id', gid)),
    absences: await one(c.from('absences').select('*').eq('group_id', gid)),
    skip_days: await one(c.from('skip_days').select('*').eq('group_id', gid)),
    orders: await one(c.from('orders').select('*').eq('group_id', gid)),
    prices: await one(c.from('prices').select('*').eq('group_id', gid).maybeSingle()),
  }
}

/** 서버가 새로 만드는 휴가 id는 비교에서 뺀다 */
const noAbsenceIds = (g: Group): Group => ({ ...g, absences: g.absences.map((a) => ({ ...a, id: '-' })) })

d('기기 → 서버 → 기기 왕복 (실제 DB)', () => {
  let owner: TestUser
  beforeAll(async () => {
    assertNotProduction()
    owner = await newUser()
  })

  for (const [label, make] of [
    ['커피 그룹(금액·주문·가격표·휴가·탈퇴한 멤버 포함)', richCoffeeGroup],
    ['일반 그룹', richGeneralGroup],
  ] as const) {
    it(`${label}이 값 그대로 돌아온다`, async () => {
      const g = make()
      const payload = groupToImport(g, crypto.randomUUID(), uuidSeq())
      const gid = await mustRpc<string>(owner.client, 'import_group', { p: payload })

      // 같은 순서로 uuid를 만들면 import가 한 멤버 id 매핑과 똑같이 재현된다
      const seq = uuidSeq()
      const ids = new Map<string, string>()
      const f = (id: string) => ids.get(id) ?? (ids.set(id, seq()), ids.get(id)!)
      // groupToImport 안의 첫 uuid 순서와 맞추기 위해 payload의 멤버 ref로 직접 매핑한다
      const byName = new Map(payload.members.map((m) => [m.name, m.ref]))
      g.members.forEach((m) => ids.set(m.id, byName.get(m.name)!))
      // 탈퇴한 멤버(목록에 없는 id): payload에서 찾는다
      const known = new Set(payload.members.map((m) => m.ref))
      const extra = [...new Set(payload.records.map((r) => r.member_ref).filter((r) => !known.has(r)))]
      const gone = g.records.map((r) => r.memberId).filter((id) => !g.members.some((m) => m.id === id))
      ;[...new Set(gone)].forEach((id, i) => ids.set(id, extra[i]))

      const expected = { ...remapMemberIds(g, f), id: gid }
      const actual = rowsToGroup(await readRows(owner, gid))
      expect(noAbsenceIds(actual)).toEqual(noAbsenceIds(expected))
    })
  }

  it('금액·주문 payload 안의 멤버 참조가 서버의 멤버 id와 맞는다', async () => {
    const g = richCoffeeGroup()
    const gid = await mustRpc<string>(owner.client, 'import_group', { p: groupToImport(g, crypto.randomUUID(), uuidSeq()) })
    const rows = await readRows(owner, gid)
    const ids = new Set(rows.members.map((m) => m.id))
    const detail = rows.records.find((r) => r.payload.pricing?.mode === 'detail')!
    expect(detail.payload.pricing!.lines!.every((l) => ids.has(l.memberId))).toBe(true)
    expect(rows.orders[0].payload.items.every((i) => ids.has(i.memberId))).toBe(true)
  })
})
