import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { rowsToGroup } from '../logic/remote-map'
import type { Group } from '../types'
import {
  AGE_PENDING_KEY,
  AUTH_KEY,
  confirmAge,
  currentUser,
  fetchGroupRows,
  isNetworkError,
  leaveGroup,
  listMemberships,
  loadClient,
  redeemInvite,
  remoteEnabled,
  signInAnonymously,
  signOutRemote,
  startGoogleLogin,
  type RemoteUser,
} from './api'
import { clearCache, readCache, writeCache, type CacheMap, type Role } from './cache'
import { joinErrorMessage } from './invite'

/** 서버에서 읽어 온 그룹 하나 (이 앱에서는 읽기 전용) */
export interface SharedGroup {
  group: Group
  role: Role
  fetchedAt: number
}

export type JoinResult = { ok: true; pending: boolean; name?: string } | { ok: false; message: string }

export interface RemoteState {
  enabled: boolean
  /** 클라이언트를 불러와 로그인 상태를 확인했는지 (처음에는 캐시만 보여준다) */
  user: RemoteUser | null
  groups: SharedGroup[]
  /** 마지막 갱신이 네트워크 문제로 실패했는지 (캐시를 보여주는 중) */
  offline: boolean
  refreshing: boolean
  refresh: () => Promise<void>
  join: (code: string) => Promise<JoinResult>
  signInGoogle: () => Promise<{ ok: boolean; message?: string }>
  signOut: () => Promise<void>
  leave: (groupId: string) => Promise<{ ok: boolean; message?: string }>
}

const OFF: RemoteState = {
  enabled: false,
  user: null,
  groups: [],
  offline: false,
  refreshing: false,
  refresh: async () => {},
  join: async () => ({ ok: false, message: '공유 기능을 쓸 수 없어요' }),
  signInGoogle: async () => ({ ok: false }),
  signOut: async () => {},
  leave: async () => ({ ok: false }),
}

const Ctx = createContext<RemoteState>(OFF)
export const useRemote = () => useContext(Ctx)

const safeGet = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const safeSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* 무시 */
  }
}
const safeDel = (k: string) => {
  try {
    localStorage.removeItem(k)
  } catch {
    /* 무시 */
  }
}

const toShared = (cache: CacheMap): SharedGroup[] =>
  Object.values(cache)
    .map((c) => ({ group: rowsToGroup(c.rows), role: c.role, fetchedAt: c.fetchedAt }))
    .sort((a, b) => (a.group.name < b.group.name ? -1 : 1))

/**
 * 공유(서버) 그룹의 상태. 환경 변수가 없으면 아무것도 하지 않는다(OFF).
 * 처음에는 저장된 캐시만 보여주고, 로그인 세션이 있을 때만 supabase-js를 불러와 갱신한다.
 */
export function RemoteProvider({ children }: { children: ReactNode }) {
  if (!remoteEnabled) return <Ctx.Provider value={OFF}>{children}</Ctx.Provider>
  return <Inner>{children}</Inner>
}

function Inner({ children }: { children: ReactNode }) {
  const [cache, setCache] = useState<CacheMap>(() => readCache())
  const [user, setUser] = useState<RemoteUser | null>(null)
  const [offline, setOffline] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const cacheRef = useRef(cache)
  cacheRef.current = cache
  const busy = useRef(false)
  const lastRun = useRef(0)

  const commit = useCallback((next: CacheMap) => {
    cacheRef.current = next
    setCache(next)
    if (Object.keys(next).length) writeCache(next)
    else clearCache()
  }, [])

  const refresh = useCallback(async () => {
    if (busy.current) return
    // 기기가 오프라인이라고 알려 주면 요청(재시도 포함)을 기다리지 않고 바로 캐시 표시 상태로 둔다
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setOffline(true)
      return
    }
    busy.current = true
    setRefreshing(true)
    try {
      const c = await loadClient()
      const u = await currentUser(c)
      setUser(u)
      if (!u) return
      let memberships
      try {
        memberships = await listMemberships(c, u.id)
      } catch (e) {
        if (isNetworkError(e)) setOffline(true)
        return // 캐시를 그대로 둔다
      }
      const results = await Promise.allSettled(memberships.map((m) => fetchGroupRows(c, m.group_id)))
      const next: CacheMap = {}
      let failed = false
      memberships.forEach((m, i) => {
        const r = results[i]
        if (r.status === 'fulfilled' && r.value) next[m.group_id] = { role: m.role, fetchedAt: Date.now(), rows: r.value }
        else {
          failed = true
          const old = cacheRef.current[m.group_id]
          if (old) next[m.group_id] = { ...old, role: m.role } // 실패한 그룹은 지난 내용을 유지
        }
      })
      commit(next)
      setOffline(failed)
      lastRun.current = Date.now()
    } catch (e) {
      if (isNetworkError(e)) setOffline(true)
    } finally {
      busy.current = false
      setRefreshing(false)
    }
  }, [commit])

  // 시작: 세션/캐시/로그인 복귀 표시가 있을 때만 서버에 연결한다
  useEffect(() => {
    const returning = /[?&]code=/.test(location.search) && safeGet(AGE_PENDING_KEY) !== null
    if (safeGet(AUTH_KEY) !== null || Object.keys(cacheRef.current).length > 0 || returning) void refresh()
  }, [refresh])

  // 로그인 상태 변화: 로그아웃되면 캐시를 지우고, Google 로그인 복귀면 만 14세 확인을 서버에 기록한다
  useEffect(() => {
    let off: (() => void) | undefined
    let cancelled = false
    if (safeGet(AUTH_KEY) === null && safeGet(AGE_PENDING_KEY) === null) return
    void loadClient().then((c) => {
      if (cancelled) return
      const { data } = c.auth.onAuthStateChange((event, session) => {
        // 콜백 안에서 바로 supabase를 부르면 교착될 수 있어 한 박자 늦춘다
        setTimeout(async () => {
          if (event === 'SIGNED_OUT') {
            setUser(null)
            commit({})
            return
          }
          if (event === 'SIGNED_IN' && session) {
            if (safeGet(AGE_PENDING_KEY) !== null) {
              try {
                await confirmAge(c)
                safeDel(AGE_PENDING_KEY)
              } catch {
                /* 다음 기회에 다시 시도 */
              }
            }
            void refresh()
          }
        }, 0)
      })
      off = () => data.subscription.unsubscribe()
    })
    return () => {
      cancelled = true
      off?.()
    }
  }, [commit, refresh])

  // 앱으로 돌아왔을 때·인터넷이 다시 연결됐을 때 갱신 (너무 자주는 아니게)
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRun.current > 30_000 && Object.keys(cacheRef.current).length) void refresh()
    }
    const onOnline = () => void refresh()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [refresh])

  const join = useCallback(
    async (code: string): Promise<JoinResult> => {
      try {
        const c = await loadClient()
        let u = await currentUser(c)
        if (!u) u = await signInAnonymously(c) // 코드를 입력하는 순간에만 만든다
        setUser(u)
        await confirmAge(c)
        const res = await redeemInvite(c, code)
        if (res.status === 'invalid') return { ok: false, message: '코드가 맞지 않거나 만료됐어요. 그룹장에게 새 코드를 받아 주세요' }
        if (res.status === 'pending') return { ok: true, pending: true, name: res.name }
        await refresh()
        return { ok: true, pending: false, name: res.name }
      } catch (e) {
        return { ok: false, message: joinErrorMessage(e instanceof Error ? e.message : undefined, isNetworkError(e)) }
      }
    },
    [refresh],
  )

  const signInGoogle = useCallback(async () => {
    try {
      const c = await loadClient()
      safeSet(AGE_PENDING_KEY, String(Date.now()))
      await startGoogleLogin(c, location.origin + location.pathname)
      return { ok: true }
    } catch {
      safeDel(AGE_PENDING_KEY)
      return { ok: false, message: 'Google 로그인을 시작하지 못했어요. 잠시 후 다시 시도해 주세요' }
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      const c = await loadClient()
      await signOutRemote(c)
    } catch {
      /* 네트워크가 없어도 이 기기의 세션은 지운다 */
    }
    safeDel(AUTH_KEY)
    setUser(null)
    commit({})
  }, [commit])

  const leave = useCallback(
    async (groupId: string) => {
      try {
        const c = await loadClient()
        await leaveGroup(c, groupId)
        await refresh()
        return { ok: true }
      } catch (e) {
        const m = e instanceof Error ? e.message : ''
        return { ok: false, message: m.includes('owner_cannot_leave') ? '그룹장은 나갈 수 없어요. 그룹장을 넘기거나 그룹을 삭제해야 해요' : '지금은 나갈 수 없어요. 잠시 후 다시 시도해 주세요' }
      }
    },
    [refresh],
  )

  const groups = useMemo(() => toShared(cache), [cache])
  const value = useMemo<RemoteState>(
    () => ({ enabled: true, user, groups, offline, refreshing, refresh, join, signInGoogle, signOut, leave }),
    [user, groups, offline, refreshing, refresh, join, signInGoogle, signOut, leave],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
