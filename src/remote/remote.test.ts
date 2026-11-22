import { describe, expect, it } from 'vitest'
import { ACTIVE_GROUP_KEY, KEY, SHADOW_KEY, type StorageLike } from '../lib/data'
import { richCoffeeGroup, richGeneralGroup } from '../lib/testing'
import { serialize } from '../lib/migrate'
import { updateGroupView } from '../logic/groups'
import { groupToRows, rowsToGroup } from '../logic/remote-map'
import { SCHEMA_VERSION, type AppData } from '../types'
import { CACHE_KEY, clearCache, readCache, writeCache, type CacheMap } from './cache'
import { formatSyncTime } from './format'
import {
  checkInviteCode,
  clampMaxUses,
  CODE_ALPHABET,
  defaultInviteOptions,
  formatExpiry,
  INVITE_TTL_OPTIONS,
  inviteShareText,
  inviteStatus,
  joinErrorMessage,
  normalizeInviteCode,
  type InviteRow,
} from './invite'
import { viewerLabel } from './admin-api'
import { parseSnapshot, SnapshotError } from './snapshot'

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

const entry = (gid: string, fetchedAt: number, g = richCoffeeGroup()) => ({
  role: 'viewer' as const,
  fetchedAt,
  rows: groupToRows({ ...g, id: gid }),
})

describe('서버 그룹 캐시', () => {
  it('저장하고 다시 읽으면 같은 내용이다', () => {
    const st = new MemoryStorage()
    const map: CacheMap = { g1: entry('g1', 1000), g2: entry('g2', 2000, richGeneralGroup()) }
    expect(writeCache(map, st)).toBe(true)
    expect(readCache(st)).toEqual(map)
    expect(rowsToGroup(readCache(st).g1.rows)).toEqual({ ...richCoffeeGroup(), id: 'g1' })
  })
  it('별도 키에만 쓰고 앱 데이터·shadow·보고 있는 그룹 키는 건드리지 않는다', () => {
    const st = new MemoryStorage()
    writeCache({ g1: entry('g1', 1) }, st)
    expect([...st.map.keys()]).toEqual([CACHE_KEY])
    expect(CACHE_KEY).not.toBe(KEY)
    expect(CACHE_KEY).not.toBe(SHADOW_KEY)
    expect(CACHE_KEY).not.toBe(ACTIVE_GROUP_KEY)
  })
  it('내보내기 JSON(serialize)에 서버 그룹이 섞이지 않는다', () => {
    const root: AppData = { schemaVersion: SCHEMA_VERSION, groups: [richGeneralGroup()], updatedAt: 1 }
    const text = serialize(root)
    expect(text).not.toContain('g1')
    expect(JSON.parse(text).groups).toHaveLength(1)
  })
  it('비어 있거나 깨진 값은 빈 캐시로 읽는다 (예외 없음)', () => {
    const st = new MemoryStorage()
    expect(readCache(st)).toEqual({})
    st.setItem(CACHE_KEY, '{not json')
    expect(readCache(st)).toEqual({})
    st.setItem(CACHE_KEY, JSON.stringify({ v: 99, groups: {} }))
    expect(readCache(st)).toEqual({})
    expect(readCache(null)).toEqual({})
  })
  it('모양이 깨진 항목만 버린다', () => {
    const st = new MemoryStorage()
    st.setItem(
      CACHE_KEY,
      JSON.stringify({ v: 1, groups: { good: entry('good', 5), badRole: { ...entry('badRole', 5), role: 'admin' }, badId: entry('other', 5) } }),
    )
    expect(Object.keys(readCache(st))).toEqual(['good'])
  })
  it('용량이 크면 가장 오래된 그룹부터 버린다', () => {
    const st = new MemoryStorage()
    const big = (id: string, at: number) => {
      const e = entry(id, at)
      e.rows.group.name = 'x'.repeat(1_800_000)
      return e
    }
    writeCache({ old: big('old', 1), mid: big('mid', 2), new: big('new', 3) }, st)
    expect(Object.keys(readCache(st)).sort()).toEqual(['new'])
  })
  it('저장 공간 오류면 false를 돌려주고 던지지 않는다', () => {
    const failing: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
      removeItem: () => {},
    }
    expect(writeCache({ g1: entry('g1', 1) }, failing)).toBe(false)
    expect(writeCache({ g1: entry('g1', 1) }, null)).toBe(false)
  })
  it('로그아웃하면 지운다', () => {
    const st = new MemoryStorage()
    writeCache({ g1: entry('g1', 1) }, st)
    clearCache(st)
    expect(readCache(st)).toEqual({})
  })
})

describe('get_group_snapshot 결과 읽기', () => {
  const asServerJson = (g = richCoffeeGroup()) => {
    const rows = groupToRows(g)
    // 서버는 jsonb로 돌려주므로 JSON 왕복을 거친다 (undefined 제거, 날짜는 문자열)
    return { rows, json: JSON.parse(JSON.stringify({ group: rows.group, members: rows.members, records: rows.records, absences: rows.absences, skip_days: rows.skip_days, orders: rows.orders, prices: rows.prices })) }
  }
  it('커피·일반 그룹 모두 Group으로 그대로 복원된다', () => {
    for (const g of [richCoffeeGroup(), richGeneralGroup()]) {
      const { json } = asServerJson(g)
      expect(rowsToGroup(parseSnapshot(json))).toEqual(g)
    }
  })
  it('빈 그룹(행 없음)도 읽는다', () => {
    const { json } = asServerJson(richGeneralGroup())
    const empty = { ...json, members: [], records: [], absences: [], skip_days: [], orders: [], prices: null }
    const g = rowsToGroup(parseSnapshot(empty))
    expect(g.members).toEqual([])
    expect(g.records).toEqual([])
  })
  it('모양이 틀린 값은 거부한다 (캐시를 덮어쓰지 않도록)', () => {
    const { json } = asServerJson()
    expect(() => parseSnapshot(null)).toThrow(SnapshotError)
    expect(() => parseSnapshot({})).toThrow(SnapshotError)
    expect(() => parseSnapshot({ ...json, members: 'x' })).toThrow(SnapshotError)
    expect(() => parseSnapshot({ ...json, records: [{ date: '2026/11/17', member_id: 'm' }] })).toThrow(SnapshotError)
    expect(() => parseSnapshot({ ...json, group: { ...json.group, config: null } })).toThrow(SnapshotError)
    expect(() => parseSnapshot({ ...json, members: [{ id: 1 }] })).toThrow(SnapshotError)
  })
})

describe('서버 그룹은 로컬 데이터를 바꾸지 못한다', () => {
  it('로컬에 없는 그룹 id로 변경해도 데이터가 그대로다(같은 객체, updatedAt 불변)', () => {
    const root: AppData = { schemaVersion: SCHEMA_VERSION, groups: [richGeneralGroup()], updatedAt: 7 }
    const after = updateGroupView(root, 'server-group-id', (v) => ({ ...v, name: '변조', purchases: [] }))
    expect(after).toBe(root)
    expect(after.updatedAt).toBe(7)
  })
})

describe('초대 코드 입력', () => {
  it('공백·하이픈을 지우고 대문자로 바꾼다', () => {
    expect(normalizeInviteCode(' k7m2-qx4p ')).toBe('K7M2QX4P')
  })
  it('8자리, 허용된 글자만 통과한다', () => {
    expect(checkInviteCode('K7M2QX4P')).toEqual({ ok: true, code: 'K7M2QX4P' })
    expect(checkInviteCode('k7m2 qx4p')).toEqual({ ok: true, code: 'K7M2QX4P' })
    expect(checkInviteCode('')).toEqual({ ok: false, reason: 'empty' })
    expect(checkInviteCode('K7M2QX4')).toEqual({ ok: false, reason: 'length' })
  })
  it('헷갈리는 글자(0 O 1 I)가 있으면 글자 오류', () => {
    for (const bad of ['K7M2QX40', 'K7M2QX4O', 'K7M2QX41', 'K7M2QX4I']) {
      expect(checkInviteCode(bad)).toEqual({ ok: false, reason: 'chars' })
    }
    expect(CODE_ALPHABET).toHaveLength(32)
    expect(CODE_ALPHABET).not.toMatch(/[01OI]/)
  })
  it('서버 오류는 내부 메시지 대신 안내 문장으로 바꾼다', () => {
    expect(joinErrorMessage('rate_limited')).toContain('너무 많아요')
    expect(joinErrorMessage('age_not_confirmed')).toContain('14세')
    expect(joinErrorMessage('boom: relation "x" does not exist')).not.toContain('relation')
    expect(joinErrorMessage('anything', true)).toContain('인터넷')
  })
})

describe('마지막 업데이트 시각', () => {
  const now = new Date(2026, 10, 18, 15, 0) // 11/18 오후 3시
  it('오늘 / 어제 / 그 밖', () => {
    expect(formatSyncTime(new Date(2026, 10, 18, 9, 5).getTime(), now)).toBe('오전 9:05')
    expect(formatSyncTime(new Date(2026, 10, 18, 15, 5).getTime(), now)).toBe('오후 3:05')
    expect(formatSyncTime(new Date(2026, 10, 18, 0, 7).getTime(), now)).toBe('오전 12:07')
    expect(formatSyncTime(new Date(2026, 10, 17, 21, 30).getTime(), now)).toBe('어제 오후 9:30')
    expect(formatSyncTime(new Date(2026, 10, 3, 13, 0).getTime(), now)).toBe('11/3 오후 1:00')
  })
})

describe('초대 코드 만들기 기본값과 상태', () => {
  it('기본값: 유효 7일, 인원은 그룹 멤버 수 (최소 1, 서버 상한 200)', () => {
    expect(defaultInviteOptions(6)).toEqual({ ttlHours: 168, maxUses: 6 })
    expect(defaultInviteOptions(0)).toEqual({ ttlHours: 168, maxUses: 1 })
    expect(defaultInviteOptions(1000).maxUses).toBe(200)
    expect(clampMaxUses(0)).toBe(1)
    expect(clampMaxUses(250)).toBe(200)
    expect(clampMaxUses(7.9)).toBe(7)
    expect(clampMaxUses(Number.NaN)).toBe(1)
  })
  it('유효 기간 선택지는 서버 허용 범위(1시간~30일) 안이고 7일이 들어 있다', () => {
    expect(INVITE_TTL_OPTIONS.map((o) => o.hours)).toEqual([24, 168, 720])
    expect(INVITE_TTL_OPTIONS.every((o) => o.hours >= 1 && o.hours <= 24 * 30)).toBe(true)
  })
  const inv = (over: Partial<InviteRow> = {}): InviteRow => ({
    code: 'K7M2QX4P',
    expires_at: '2026-11-29T10:00:00Z',
    max_uses: 3,
    uses: 1,
    requires_approval: false,
    revoked_at: null,
    created_at: '2026-11-22T10:00:00Z',
    ...over,
  })
  it('코드 상태: 사용 가능 / 만료 / 인원 참 / 취소', () => {
    const now = new Date('2026-11-25T00:00:00Z').getTime()
    expect(inviteStatus(inv(), now)).toBe('active')
    expect(inviteStatus(inv({ expires_at: '2026-11-24T00:00:00Z' }), now)).toBe('expired')
    expect(inviteStatus(inv({ uses: 3 }), now)).toBe('full')
    expect(inviteStatus(inv({ revoked_at: '2026-11-23T00:00:00Z' }), now)).toBe('revoked')
    expect(inviteStatus(inv({ revoked_at: '2026-11-23T00:00:00Z', uses: 3 }), now)).toBe('revoked')
  })
  it('만료 표시와 단톡방 안내 문구', () => {
    expect(formatExpiry(new Date(2026, 10, 29, 12).toISOString())).toBe('11/29(일)까지')
    const text = inviteShareText({ emoji: '☕', name: '커피', code: 'K7M2QX4P', expiresAt: new Date(2026, 10, 29, 12).toISOString(), maxUses: 6, appUrl: 'https://example.test/app/' })
    expect(text).toContain('☕ 커피 그룹에 초대해요')
    expect(text).toContain('K7M2QX4P')
    expect(text).toContain('11/29(일)까지')
    expect(text).toContain('최대 6명')
    expect(text).toContain('https://example.test/app/')
    expect(text).toContain('보기만')
    expect(text.split('\n')).toHaveLength(4)
  })
})

describe('그룹원 표시 이름', () => {
  it('별명이 있으면 별명, 없으면 들어온 순서대로 "그룹원 N"', () => {
    expect(viewerLabel({ nickname: '민수' }, 0)).toBe('민수')
    expect(viewerLabel({ nickname: null }, 0)).toBe('그룹원 1')
    expect(viewerLabel({ nickname: '   ' }, 2)).toBe('그룹원 3')
  })
})
