import { describe, expect, it } from 'vitest'
import { diffGroups, type RemoteOp } from '../logic/remote-map'
import { richCoffeeGroup } from '../lib/testing'
import { parseSnapshotFull } from './snapshot'
import { groupToRows } from '../logic/remote-map'
import { createWriter, type FailKind, type WriteState } from './writer'

const ops = (n: number): RemoteOp[] => [{ kind: 'upsert', table: 'skip_days', row: { group_id: 'g', date: `2030-01-${String(n).padStart(2, '0')}` } }]

/** 가짜 서버: apply 결과를 순서대로 돌려주고, 호출 기록을 남긴다 */
function harness(results: Array<'ok' | 'conflict' | Error>, startRev: number | null = 0) {
  let rev = startRev
  const calls: { base: number; ops: RemoteOp[] }[] = []
  const states: WriteState[] = []
  const fails: { kind: FailKind; detail?: string }[] = []
  let i = 0
  const gates: Array<() => void> = []
  const w = createWriter({
    apply: (base, o) => {
      calls.push({ base, ops: o })
      const r = results[i++] ?? 'ok'
      return new Promise((resolve, reject) => {
        gates.push(() => {
          if (r instanceof Error) reject(r)
          else resolve({ status: r, rev: base + 1 })
        })
      })
    },
    getRev: () => rev,
    onSaved: (r) => {
      rev = r
    },
    onState: (s) => states.push(s),
    onFail: (kind, detail) => fails.push({ kind, detail }),
  })
  const flush = async () => {
    // 대기 중인 apply를 하나씩 풀어 준다
    for (let n = 0; n < 20; n++) {
      await Promise.resolve()
      const g = gates.shift()
      if (g) g()
      await new Promise((r) => setTimeout(r, 0))
    }
  }
  return { w, calls, states, fails, flush, rev: () => rev, setRev: (r: number | null) => (rev = r) }
}

describe('그룹 쓰기 대기열', () => {
  it('변경을 순서대로 하나씩 보내고 성공할 때마다 rev를 이어 간다', async () => {
    const h = harness(['ok', 'ok', 'ok'], 5)
    h.w.enqueue(ops(1))
    h.w.enqueue(ops(2))
    h.w.enqueue(ops(3))
    expect(h.w.busy()).toBe(true)
    await h.flush()
    expect(h.calls.map((c) => c.base)).toEqual([5, 6, 7])
    expect(h.calls.map((c) => (c.ops[0] as { row: { date: string } }).row.date)).toEqual(['2030-01-01', '2030-01-02', '2030-01-03'])
    expect(h.rev()).toBe(8)
    expect(h.states[0]).toBe('saving')
    expect(h.states.at(-1)).toBe('idle')
    expect(h.fails).toEqual([])
    expect(h.w.busy()).toBe(false)
  })

  it('이전 요청이 끝나기 전에는 다음 요청을 보내지 않는다', async () => {
    const h = harness(['ok', 'ok'])
    h.w.enqueue(ops(1))
    h.w.enqueue(ops(2))
    await Promise.resolve()
    expect(h.calls).toHaveLength(1)
    await h.flush()
    expect(h.calls).toHaveLength(2)
  })

  it('충돌이면 실패로 알리고, 뒤에 쌓인 변경은 보내지 않는다', async () => {
    const h = harness(['conflict', 'ok', 'ok'])
    h.w.enqueue(ops(1))
    h.w.enqueue(ops(2))
    h.w.enqueue(ops(3))
    await h.flush()
    expect(h.calls).toHaveLength(1)
    expect(h.fails).toEqual([{ kind: 'conflict', detail: undefined }])
    expect(h.states.at(-1)).toBe('failed')
    expect(h.w.busy()).toBe(false)
  })

  it('오류가 나도 마찬가지로 멈추고 이유를 전달한다', async () => {
    const h = harness([new Error('네트워크'), 'ok'])
    h.w.enqueue(ops(1))
    h.w.enqueue(ops(2))
    await h.flush()
    expect(h.calls).toHaveLength(1)
    expect(h.fails).toEqual([{ kind: 'error', detail: '네트워크' }])
    expect(h.states.at(-1)).toBe('failed')
  })

  it('서버 rev를 모르면 보내지 않고 알린다(먼저 다시 읽어야 한다)', async () => {
    const h = harness(['ok'], null)
    h.w.enqueue(ops(1))
    await h.flush()
    expect(h.calls).toHaveLength(0)
    expect(h.fails.map((f) => f.kind)).toEqual(['norev'])
  })

  it('실패한 뒤에도 새 변경은 다시 보낼 수 있다 (갱신된 rev 기준)', async () => {
    const h = harness(['conflict', 'ok'], 3)
    h.w.enqueue(ops(1))
    await h.flush()
    h.setRev(9) // 다시 읽어 온 최신 rev
    h.w.enqueue(ops(2))
    await h.flush()
    expect(h.calls.map((c) => c.base)).toEqual([3, 9])
    expect(h.states.at(-1)).toBe('idle')
  })

  it('빈 변경은 무시한다', async () => {
    const h = harness([])
    h.w.enqueue([])
    expect(h.w.busy()).toBe(false)
    expect(h.calls).toHaveLength(0)
  })
})

describe('스냅샷의 rev', () => {
  const asJson = (rev?: unknown) => {
    const rows = groupToRows(richCoffeeGroup())
    return JSON.parse(JSON.stringify({ ...(rev === undefined ? {} : { rev }), group: rows.group, members: rows.members, records: rows.records, absences: rows.absences, skip_days: rows.skip_days, orders: rows.orders, prices: rows.prices }))
  }
  it('있으면 숫자로, 없거나 이상하면 null로 읽는다', () => {
    expect(parseSnapshotFull(asJson(7)).rev).toBe(7)
    expect(parseSnapshotFull(asJson(0)).rev).toBe(0)
    expect(parseSnapshotFull(asJson()).rev).toBeNull()
    expect(parseSnapshotFull(asJson('x')).rev).toBeNull()
  })
  it('diffGroups의 작업은 서버가 받는 모양(JSON)으로 그대로 보낼 수 있다', () => {
    const before = richCoffeeGroup()
    const after = { ...structuredClone(before), skipDays: ['2031-01-01'] }
    const sent = JSON.parse(JSON.stringify(diffGroups(before, after)))
    expect(sent.every((o: { kind: string }) => ['group', 'upsert', 'delete'].includes(o.kind))).toBe(true)
    expect(sent.find((o: { kind: string; table?: string; key?: string }) => o.kind === 'delete')?.key).toBe('2026-12-25')
  })
})
