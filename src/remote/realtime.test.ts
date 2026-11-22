import { describe, expect, it } from 'vitest'
import { richCoffeeGroup } from '../lib/testing'
import { groupToRows } from '../logic/remote-map'
import type { CacheMap } from './cache'
import { findGone, goneMessage } from './gone'
import { createRealtimeSync, type ChannelStatus, type GroupEvent, type RealtimeState } from './realtime'

function harness(rev: Record<string, number | null> = {}) {
  const opened: string[] = []
  const closed: string[] = []
  const handlers = new Map<string, { ev: (e: GroupEvent) => void; st: (s: ChannelStatus) => void }>()
  let refreshes = 0
  const states: RealtimeState[] = []
  let pending: (() => void) | null = null
  const rt = createRealtimeSync({
    open: (gid, ev, st) => {
      opened.push(gid)
      handlers.set(gid, { ev, st })
      return () => closed.push(gid)
    },
    getRev: (gid) => rev[gid],
    refresh: () => void refreshes++,
    onState: (s) => states.push(s),
    setTimer: (fn) => {
      pending = fn
      return 1
    },
    clearTimer: () => {
      pending = null
    },
  })
  return { rt, opened, closed, handlers, states, refreshes: () => refreshes, fire: () => { const f = pending; pending = null; f?.() }, hasTimer: () => pending !== null }
}

describe('realtime 동기화', () => {
  it('구독 목록을 맞춘다: 새 그룹은 열고 사라진 그룹은 닫고 같은 그룹은 다시 열지 않는다', () => {
    const h = harness()
    h.rt.sync(['a', 'b'])
    h.rt.sync(['b', 'c'])
    expect(h.opened).toEqual(['a', 'b', 'c'])
    expect(h.closed).toEqual(['a'])
    h.rt.sync([])
    expect(h.closed.sort()).toEqual(['a', 'b', 'c'])
  })

  it('알림이 오면 한 번에 묶어서 다시 읽는다', () => {
    const h = harness({ a: 3 })
    h.rt.sync(['a'])
    h.handlers.get('a')!.ev({ type: 'UPDATE', rev: 4 })
    h.handlers.get('a')!.ev({ type: 'UPDATE', rev: 5 })
    h.handlers.get('a')!.ev({ type: 'UPDATE', rev: 6 })
    expect(h.refreshes()).toBe(0)
    h.fire()
    expect(h.refreshes()).toBe(1)
  })

  it('내가 저장해서 생긴 알림(아는 rev 이하)은 무시한다', () => {
    const h = harness({ a: 7 })
    h.rt.sync(['a'])
    h.handlers.get('a')!.ev({ type: 'UPDATE', rev: 7 })
    expect(h.hasTimer()).toBe(false)
    h.handlers.get('a')!.ev({ type: 'UPDATE', rev: 8 })
    expect(h.hasTimer()).toBe(true)
  })

  it('rev를 모르거나 DELETE·알 수 없는 알림이면 안전하게 다시 읽는다', () => {
    const h = harness({ a: null })
    h.rt.sync(['a'])
    h.handlers.get('a')!.ev({ type: 'UPDATE', rev: 1 })
    h.fire()
    h.handlers.get('a')!.ev({ type: 'DELETE' })
    h.fire()
    h.handlers.get('a')!.ev({ type: 'UPDATE' })
    h.fire()
    expect(h.refreshes()).toBe(3)
  })

  it('연결이 끊겼다가 돌아오면 한 번 다시 읽는다 (처음 연결은 읽지 않는다)', () => {
    const h = harness()
    h.rt.sync(['a'])
    h.handlers.get('a')!.st('live')
    expect(h.hasTimer()).toBe(false)
    h.handlers.get('a')!.st('down')
    h.handlers.get('a')!.st('live')
    expect(h.hasTimer()).toBe(true)
    h.fire()
    expect(h.refreshes()).toBe(1)
  })

  it('연결 상태: off → connecting → live → down → live → off', () => {
    const h = harness()
    h.rt.sync(['a'])
    h.handlers.get('a')!.st('live')
    h.handlers.get('a')!.st('down')
    h.handlers.get('a')!.st('live')
    h.rt.sync([])
    expect(h.states).toEqual(['connecting', 'live', 'down', 'live', 'off'])
  })

  it('close는 모두 해제하고 대기 중인 다시 읽기도 취소한다', () => {
    const h = harness({ a: 0 })
    h.rt.sync(['a', 'b'])
    h.handlers.get('a')!.ev({ type: 'UPDATE', rev: 1 })
    h.rt.close()
    expect(h.closed.sort()).toEqual(['a', 'b'])
    expect(h.hasTimer()).toBe(false)
  })
})

describe('사라진 그룹 찾기', () => {
  const cacheOf = (ids: string[]): CacheMap => {
    const out: CacheMap = {}
    ids.forEach((id, i) => {
      const g = { ...richCoffeeGroup(), id, name: `그룹${i}`, emoji: '☕' }
      out[id] = { role: 'viewer', fetchedAt: 1, rows: groupToRows(g) }
    })
    return out
  }

  it('소속 목록에서 빠진 그룹만 골라낸다', () => {
    const gone = findGone(cacheOf(['a', 'b', 'c']), ['b'])
    expect(gone.map((n) => n.id).sort()).toEqual(['a', 'c'])
    expect(gone.find((n) => n.id === 'a')?.name).toBe('그룹0')
  })
  it('그대로면 없음, 캐시가 비어 있어도 없음', () => {
    expect(findGone(cacheOf(['a']), ['a', 'z'])).toEqual([])
    expect(findGone({}, [])).toEqual([])
  })
  it('안내 문구에 그룹 이름과 이유가 들어간다', () => {
    const m = goneMessage({ id: 'a', name: '커피', emoji: '☕' })
    expect(m).toContain('커피')
    expect(m).toContain('없어졌어요')
    expect(m).toContain('삭제됐거나')
  })
})
