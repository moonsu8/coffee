import { describe, expect, it } from 'vitest'
import type { StorageLike } from '../lib/data'
import { richCoffeeGroup, richGeneralGroup } from '../lib/testing'
import { diffContent, planImport, type GroupRows, type ImportPayload } from '../logic/remote-map'
import type { Group } from '../types'
import { copyStatus, LINKS_KEY, readLinks, shareBackupKey, writeLinks, type Links } from './links'
import { shareLocalGroup, type ShareDeps } from './share'

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

/** 서버가 import_group으로 만드는 행을 흉내 낸다 (멤버 ref가 uuid면 그대로 id) */
function payloadToRows(p: ImportPayload, gid: string): GroupRows {
  return {
    group: { id: gid, name: p.name, emoji: p.emoji, schedule: p.schedule, config: p.config },
    members: p.members.map((m) => ({ id: m.ref, group_id: gid, name: m.name, sort: m.sort, color: m.color, emoji: m.emoji, payload: m.payload })),
    records: p.records.map((r) => ({ group_id: gid, date: r.date, member_id: r.member_ref, memo: r.memo, payload: r.payload })),
    absences: p.absences.map((a, i) => ({ id: `abs-${i}`, group_id: gid, member_id: a.member_ref, from_date: a.from, to_date: a.to, payload: {} })),
    skip_days: p.skip_days.map((date) => ({ group_id: gid, date })),
    orders: p.orders.map((o) => ({ group_id: gid, date: o.date, payload: o.payload })),
    prices: p.prices ? { group_id: gid, payload: p.prices.payload } : null,
  }
}

function setup(opts: { importFails?: number; fetchFails?: number; tamper?: (r: GroupRows) => GroupRows; storage?: StorageLike | null } = {}) {
  const storage = opts.storage === undefined ? new MemoryStorage() : opts.storage
  let links: Links = {}
  const linkWrites: Links[] = []
  const payloads: ImportPayload[] = []
  let importCalls = 0
  let fetchCalls = 0
  let n = 0
  const server = new Map<string, ImportPayload>() // import_key → 만들어진 그룹 (같은 key면 같은 그룹 id)
  const ids = new Map<string, string>()
  const deps: ShareDeps = {
    storage,
    links: () => links,
    setLinks: (l) => {
      links = l
      linkWrites.push(l)
    },
    importGroup: async (p) => {
      importCalls++
      payloads.push(p)
      if (importCalls <= (opts.importFails ?? 0)) throw new Error('network')
      if (!ids.has(p.import_key)) {
        ids.set(p.import_key, `srv-${++n}`)
        server.set(p.import_key, p)
      }
      return ids.get(p.import_key)!
    },
    fetchRows: async (id) => {
      fetchCalls++
      if (fetchCalls <= (opts.fetchFails ?? 0)) throw new Error('network')
      const entry = [...ids.entries()].find(([, v]) => v === id)
      if (!entry) return null
      const rows = payloadToRows(server.get(entry[0])!, id)
      return opts.tamper ? opts.tamper(rows) : rows
    },
    now: () => 1_700_000_000_000,
  }
  return { deps, storage: storage as MemoryStorage | null, links: () => links, linkWrites, payloads, importCalls: () => importCalls }
}

describe('내 기기 그룹 → 서버로 옮기기', () => {
  it('백업 → 올리기 → 서버에서 다시 읽어 대조까지 하고 연결 정보를 남긴다', async () => {
    const g = richCoffeeGroup()
    const t = setup()
    const res = await shareLocalGroup(g, '{"backup":true}', t.deps)
    expect(res).toMatchObject({ ok: true, verified: true, mismatch: [] })
    expect(t.storage!.getItem(shareBackupKey(g.id))).toBe('{"backup":true}')
    const link = t.links()[g.id]
    expect(link.remoteId).toBe('srv-1')
    expect(link.verified).toBe(true)
    expect(link.sharedAt).toBe(1_700_000_000_000)
  })

  it('올리기 전에 연결 정보(importKey·id 매핑)를 먼저 저장한다', async () => {
    const t = setup()
    await shareLocalGroup(richCoffeeGroup(), '{}', t.deps)
    const first = t.linkWrites[0]['g-fix']
    expect(first.remoteId).toBeUndefined()
    expect(first.importKey).toBeTruthy()
    expect(Object.keys(first.idMap).length).toBeGreaterThan(0)
  })

  it('서버에서 읽은 내용이 다르면 verified=false와 다른 부분을 알려 준다', async () => {
    const t = setup({ tamper: (r) => ({ ...r, records: r.records.slice(1) }) })
    const res = await shareLocalGroup(richCoffeeGroup(), '{}', t.deps)
    expect(res).toMatchObject({ ok: true, verified: false })
    expect(res.ok && res.mismatch).toContain('records')
    expect(t.links()['g-fix'].verified).toBe(false)
  })

  it('일반 그룹도 같은 방식으로 옮겨진다', async () => {
    const t = setup()
    const res = await shareLocalGroup(richGeneralGroup(), '{}', t.deps)
    expect(res).toMatchObject({ ok: true, verified: true })
  })

  it('백업을 남기지 못하면 올리지 않고 아무 기록도 남기지 않는다', async () => {
    const failing: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('Quota')
      },
      removeItem: () => {},
    }
    const t = setup({ storage: failing })
    const res = await shareLocalGroup(richCoffeeGroup(), '{}', t.deps)
    expect(res).toMatchObject({ ok: false, reason: 'backup' })
    expect(t.importCalls()).toBe(0)
    expect(t.linkWrites).toHaveLength(0)
    const none = setup({ storage: null })
    expect(await shareLocalGroup(richCoffeeGroup(), '{}', none.deps)).toMatchObject({ ok: false, reason: 'backup' })
  })

  it('올리기가 실패해도 다시 시도하면 같은 key·같은 id로 보내서 중복 그룹이 안 생긴다', async () => {
    const g = richCoffeeGroup()
    const t = setup({ importFails: 1 })
    const first = await shareLocalGroup(g, '{}', t.deps)
    expect(first).toMatchObject({ ok: false, reason: 'import' })
    expect(t.links()[g.id].remoteId).toBeUndefined() // 아직 연결되지 않음(pending)
    const second = await shareLocalGroup(g, '{}', t.deps)
    expect(second).toMatchObject({ ok: true, verified: true })
    expect(t.payloads).toHaveLength(2)
    expect(t.payloads[1]).toEqual(t.payloads[0]) // 같은 key, 같은 멤버 uuid → 완전히 같은 payload
  })

  it('이미 옮긴 그룹은 다시 옮기지 않는다', async () => {
    const g = richCoffeeGroup()
    const t = setup()
    await shareLocalGroup(g, '{}', t.deps)
    expect(await shareLocalGroup(g, '{}', t.deps)).toMatchObject({ ok: false, reason: 'exists' })
    expect(t.importCalls()).toBe(1)
  })

  it('다시 시도해도 처음 백업을 덮어쓰지 않는다', async () => {
    const g = richCoffeeGroup()
    const t = setup({ importFails: 1 })
    await shareLocalGroup(g, 'FIRST', t.deps)
    await shareLocalGroup(g, 'SECOND', t.deps)
    expect(t.storage!.getItem(shareBackupKey(g.id))).toBe('FIRST')
  })

  it('올린 뒤 확인하지 못하면 fetch 실패로 알리되 연결 정보(remoteId)는 남긴다', async () => {
    const g = richCoffeeGroup()
    const t = setup({ fetchFails: 1 })
    const res = await shareLocalGroup(g, '{}', t.deps)
    expect(res).toMatchObject({ ok: false, reason: 'fetch' })
    expect(t.links()[g.id].remoteId).toBe('srv-1')
    expect(t.links()[g.id].verified).toBeUndefined()
  })
})

describe('옮기기 계획과 내용 대조', () => {
  const seq = () => {
    let n = 0
    return () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
  }
  it('같은 idMap으로 다시 만들면 payload가 같다', () => {
    const g = richCoffeeGroup()
    const a = planImport(g, 'k', { uuid: seq() })
    const b = planImport(g, 'k', { idMap: a.idMap })
    expect(b.payload).toEqual(a.payload)
    expect(b.expected).toEqual(a.expected)
  })
  it('기대 그룹은 멤버 id만 uuid로 바뀌고 나머지는 원본 그대로다', () => {
    const g = richCoffeeGroup()
    const { expected, idMap } = planImport(g, 'k', { uuid: seq() })
    expect(expected.members.map((m) => m.name)).toEqual(g.members.map((m) => m.name))
    expect(expected.members[0].id).toBe(idMap[g.members[0].id])
    expect(expected.records.map((r) => r.date)).toEqual(g.records.map((r) => r.date))
    expect(g.members[0].id).toBe('m1') // 원본은 그대로
  })
  it('diffContent: 같으면 빈 목록, 다르면 달라진 필드 이름', () => {
    const g = richCoffeeGroup()
    expect(diffContent(g, structuredClone(g))).toEqual([])
    expect(diffContent({ ...g, id: 'other', absences: g.absences.map((a) => ({ ...a, id: 'zzz' })) }, g)).toEqual([]) // 그룹 id·휴가 id는 비교하지 않는다
    const changed: Group = { ...structuredClone(g), name: '다름', skipDays: [] }
    expect(diffContent(changed, g)).toEqual(['name', 'skipDays'])
  })
})

describe('연결 정보 저장과 사본 상태', () => {
  const link = (over = {}) => ({ importKey: 'k', idMap: {}, startedAt: 1, ...over })
  it('별도 키에 저장하고 다시 읽는다 (앱 데이터 키와 무관)', () => {
    const st = new MemoryStorage()
    const links = { 'g-1': link({ remoteId: 'r1', verified: true, sharedAt: 5 }) }
    expect(writeLinks(links, st)).toBe(true)
    expect(readLinks(st)).toEqual(links)
    expect([...st.map.keys()]).toEqual([LINKS_KEY])
  })
  it('깨진 값은 빈 연결로, 모양이 틀린 항목만 버린다', () => {
    const st = new MemoryStorage()
    expect(readLinks(st)).toEqual({})
    st.setItem(LINKS_KEY, '{oops')
    expect(readLinks(st)).toEqual({})
    st.setItem(LINKS_KEY, JSON.stringify({ v: 1, links: { ok: link(), bad: { importKey: 1 } } }))
    expect(Object.keys(readLinks(st))).toEqual(['ok'])
    expect(writeLinks({}, null)).toBe(false)
  })
  it('사본 상태: 서버 그룹이 보이면 moved(숨김), 안 보이면 stale(이전 사본), 아직 끝나지 않았으면 pending', () => {
    const visible = new Set(['r1'])
    expect(copyStatus(undefined, visible)).toBeNull()
    expect(copyStatus(link(), visible)).toBe('pending')
    expect(copyStatus(link({ remoteId: 'r1' }), visible)).toBe('moved')
    expect(copyStatus(link({ remoteId: 'r1' }), new Set())).toBe('stale')
    expect(copyStatus(link({ remoteId: 'r1' }), new Set(['r2']))).toBe('stale')
  })
})
