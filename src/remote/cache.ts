import type { StorageLike } from '../lib/data'
import type { GroupRows } from '../logic/remote-map'

/**
 * 서버 그룹의 마지막 내용(오프라인에서 보여줄 용도). 앱 데이터(AppData)·shadow·내보내기와 완전히 분리된 별도 키다.
 * 로그인 토큰은 저장하지 않는다. 로그아웃하면 지운다.
 */
export const CACHE_KEY = 'coffee-duty:remote-cache'
const VERSION = 1
const MAX_BYTES = 3_000_000 // 저장 공간 보호: 넘으면 가장 오래된 그룹부터 버린다

export type Role = 'owner' | 'viewer'
export interface CachedGroup {
  role: Role
  fetchedAt: number // 서버에서 마지막으로 성공적으로 읽은/저장한 시각(ms)
  rev?: number // 서버의 변경 번호(그룹장이 쓸 때 기준값). 없으면 먼저 다시 읽어야 한다
  rows: GroupRows
}
export type CacheMap = Record<string, CachedGroup>

function store(): StorageLike | null {
  try {
    return localStorage
  } catch {
    return null
  }
}

export function readCache(storage: StorageLike | null = store()): CacheMap {
  try {
    const raw = storage?.getItem(CACHE_KEY)
    if (!raw) return {}
    const json = JSON.parse(raw)
    if (json?.v !== VERSION || typeof json.groups !== 'object' || json.groups === null) return {}
    const out: CacheMap = {}
    for (const [id, g] of Object.entries(json.groups as Record<string, CachedGroup>)) {
      // 모양이 깨진 항목만 버린다
      if (g && (g.role === 'owner' || g.role === 'viewer') && typeof g.fetchedAt === 'number' && g.rows?.group?.id === id) out[id] = g
    }
    return out
  } catch {
    return {}
  }
}

/** 저장에 실패하면(공간 부족·차단) false. 앱은 캐시 없이도 동작한다 */
export function writeCache(map: CacheMap, storage: StorageLike | null = store()): boolean {
  try {
    if (!storage) return false
    let entries = Object.entries(map).sort((a, b) => b[1].fetchedAt - a[1].fetchedAt) // 최신 먼저
    let json = JSON.stringify({ v: VERSION, groups: Object.fromEntries(entries) })
    while (json.length > MAX_BYTES && entries.length > 1) {
      entries = entries.slice(0, -1)
      json = JSON.stringify({ v: VERSION, groups: Object.fromEntries(entries) })
    }
    storage.setItem(CACHE_KEY, json)
    return true
  } catch {
    return false
  }
}

export function clearCache(storage: StorageLike | null = store()) {
  try {
    storage?.removeItem(CACHE_KEY)
  } catch {
    /* 무시 */
  }
}
