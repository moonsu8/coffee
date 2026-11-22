import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { applyOps, diffGroups, rowsToGroup } from '../logic/remote-map'
import { readLinks, writeLinks, type Links } from './links'
import { shareLocalGroup, type ShareResult } from './share'
import type { Group } from '../types'
import {
  AGE_PENDING_KEY,
  AUTH_KEY,
  applyGroupOps,
  confirmAge,
  currentUser,
  fetchGroupRows,
  importGroupRpc,
  isNetworkError,
  leaveGroup,
  listMemberships,
  loadClient,
  openGroupChannel,
  redeemInvite,
  remoteEnabled,
  signInAnonymously,
  signOutRemote,
  startGoogleLogin,
  type RemoteUser,
} from './api'
import { clearCache, readCache, writeCache, type CacheMap, type Role } from './cache'
import { deleteAccountRpc, deleteGroupRpc, listJoinRequests, openMembershipChannel, removeViewerRpc, resolveJoinRequestRpc, transferOwnershipRpc, type JoinRequestRow } from './admin-api'
import { findGone, type GoneNotice } from './gone'
import { joinErrorMessage } from './invite'
import { createRealtimeSync, type RealtimeState, type RealtimeSync } from './realtime'
import { createWriter, type FailKind, type Writer, type WriteState } from './writer'

/** 서버에서 읽어 온 그룹 하나 (그룹장이면 이 앱에서 수정할 수 있다) */
export interface SharedGroup {
  group: Group
  role: Role
  fetchedAt: number
}

export interface ActionResult {
  ok: boolean
  message?: string
}

/** 내가 보낸 참여 요청 중 그룹장의 승인을 기다리는 것 */
export interface MyRequest {
  groupId: string
  name: string
}

export interface JoinOptions {
  nickname?: string
  /** 익명 로그인 CAPTCHA 토큰(서버가 켜 둔 경우) */
  captchaToken?: string
}

export type JoinResult = { ok: true; pending: boolean; name?: string } | { ok: false; message: string }

export interface WriteStatus {
  state: WriteState
  message?: string
}

export interface RemoteState {
  enabled: boolean
  user: RemoteUser | null
  groups: SharedGroup[]
  /** 기기가 인터넷에 연결돼 있다고 알려 주는지 */
  online: boolean
  /** 마지막 갱신이 네트워크 문제로 실패했는지 (캐시를 보여주는 중) */
  offline: boolean
  refreshing: boolean
  /** 그룹장 쓰기 상태(저장 중·실패 안내) */
  write: WriteStatus
  dismissWrite: () => void
  /** 실시간 변경 알림 연결 상태 (off: 구독할 그룹 없음) */
  realtime: RealtimeState
  /** 서버 그룹이 삭제됐거나 내가 빠져서 사라졌다는 안내 */
  notices: GoneNotice[]
  dismissNotice: (id: string) => void
  /** 내가 그룹장인 그룹으로 온, 승인 대기 중인 참여 요청 (그룹 id별) */
  requests: Record<string, JoinRequestRow[]>
  /** 내가 보낸 참여 요청 중 승인 대기 */
  myRequests: MyRequest[]
  resolveRequest: (requestId: string, approve: boolean) => Promise<ActionResult>
  removeViewer: (groupId: string, userId: string) => Promise<ActionResult>
  transferOwnership: (groupId: string, userId: string) => Promise<ActionResult>
  deleteGroup: (groupId: string) => Promise<ActionResult>
  /** 계정 삭제: 내가 그룹장인 그룹과 내 정보가 서버에서 즉시 지워진다 */
  deleteAccount: () => Promise<ActionResult>
  refresh: () => Promise<void>
  /** 최신 그룹(낙관적 반영 포함). 스토어의 되돌리기가 옛 값을 쓰지 않게 한다 */
  getGroup: (groupId: string) => Group | undefined
  /** 내 기기 그룹 ↔ 서버로 옮긴 그룹 연결 정보 (기기별 키) */
  links: Links
  /** 내 기기 그룹을 서버로 옮긴다 (백업 → 올리기 → 서버에서 다시 읽어 대조). Google 로그인한 사용자만 */
  shareGroup: (group: Group, backupJson: string) => Promise<ShareResult>
  /** 그룹장 쓰기: 변경 함수를 최신 그룹에 적용해 서버에 보낸다. 쓸 수 없으면 false */
  commitGroup: (groupId: string, mutate: (g: Group) => Group) => boolean
  join: (code: string, opts?: JoinOptions) => Promise<JoinResult>
  signInGoogle: () => Promise<{ ok: boolean; message?: string }>
  signOut: () => Promise<void>
  leave: (groupId: string) => Promise<{ ok: boolean; message?: string }>
}

const OFF: RemoteState = {
  enabled: false,
  user: null,
  groups: [],
  online: true,
  offline: false,
  refreshing: false,
  write: { state: 'idle' },
  dismissWrite: () => {},
  realtime: 'off',
  notices: [],
  dismissNotice: () => {},
  requests: {},
  myRequests: [],
  resolveRequest: async () => ({ ok: false }),
  removeViewer: async () => ({ ok: false }),
  transferOwnership: async () => ({ ok: false }),
  deleteGroup: async () => ({ ok: false }),
  deleteAccount: async () => ({ ok: false }),
  refresh: async () => {},
  getGroup: () => undefined,
  links: {},
  shareGroup: async () => ({ ok: false, reason: 'import', message: '공유 기능을 쓸 수 없어요' }),
  commitGroup: () => false,
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

const PENDING_KEY = 'coffee-duty:join-pending' // 기기별: 승인 대기 중인 그룹 이름 (서버에서는 그룹 이름을 볼 수 없어서)
const readPending = (): Record<string, string> => {
  try {
    const j = JSON.parse(safeGet(PENDING_KEY) ?? '{}')
    return j && typeof j === 'object' ? (j as Record<string, string>) : {}
  } catch {
    return {}
  }
}
const writePending = (m: Record<string, string>) => (Object.keys(m).length ? safeSet(PENDING_KEY, JSON.stringify(m)) : safeDel(PENDING_KEY))

const adminError = (e: unknown, fallback: string): string => {
  const m = e instanceof Error ? e.message : ''
  if (isNetworkError(e)) return '인터넷에 연결되어 있지 않아요. 연결을 확인하고 다시 시도해 주세요'
  if (m.includes('forbidden')) return '그룹장만 할 수 있어요'
  if (m.includes('target_not_member')) return '이 그룹의 그룹원에게만 넘길 수 있어요'
  if (m.includes('too_many_groups')) return '받는 사람이 만들 수 있는 그룹 수를 넘었어요'
  if (m.includes('invite_full')) return '초대 코드의 인원이 가득 차서 승인할 수 없어요. 새 코드를 만든 뒤 다시 요청해 달라고 해 주세요'
  return fallback
}

const toShared = (cache: CacheMap): SharedGroup[] =>
  Object.values(cache)
    .map((c) => ({ group: rowsToGroup(c.rows), role: c.role, fetchedAt: c.fetchedAt }))
    .sort((a, b) => (a.group.name < b.group.name ? -1 : 1))

const failMessage = (kind: FailKind): string =>
  kind === 'conflict'
    ? '다른 기기에서 먼저 바뀌어서 최신 내용을 불러왔어요. 방금 한 변경은 반영되지 않았으니 다시 해 주세요.'
    : kind === 'norev'
      ? '최신 내용을 먼저 불러왔어요. 방금 한 변경은 반영되지 않았으니 다시 해 주세요.'
      : '저장하지 못했어요. 최신 내용을 불러왔어요. 방금 한 변경은 반영되지 않았으니 다시 해 주세요.'

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
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false))
  const [refreshing, setRefreshing] = useState(false)
  const [write, setWrite] = useState<WriteStatus>({ state: 'idle' })
  const [realtime, setRealtime] = useState<RealtimeState>('off')
  const [notices, setNotices] = useState<GoneNotice[]>([])
  const [requests, setRequests] = useState<Record<string, JoinRequestRow[]>>({})
  const [myRequests, setMyRequests] = useState<MyRequest[]>([])
  const [links, setLinksState] = useState<Links>(() => readLinks())
  const linksRef = useRef(links)
  const userRef = useRef<RemoteUser | null>(null)
  userRef.current = user
  const cacheRef = useRef(cache)
  cacheRef.current = cache
  const busy = useRef(false)
  const lastRun = useRef(0)
  const writers = useRef(new Map<string, Writer>())
  const refreshRef = useRef<() => Promise<void>>(async () => {})

  const commit = useCallback((next: CacheMap) => {
    cacheRef.current = next
    setCache(next)
    if (Object.keys(next).length) writeCache(next)
    else clearCache()
  }, [])

  const anyWriting = () => [...writers.current.values()].some((w) => w.busy())

  /** 참여 요청 상태(내가 보낸 것·내 그룹으로 온 것)를 읽는다. 실패해도 나머지 화면에는 영향 없다 */
  const loadRequests = useCallback(async (c: Awaited<ReturnType<typeof loadClient>>, uid: string, memberships: { group_id: string; role: Role }[]) => {
    try {
      const rows = await listJoinRequests(c)
      const owned = new Set(memberships.filter((m) => m.role === 'owner').map((m) => m.group_id))
      const byGroup: Record<string, JoinRequestRow[]> = {}
      for (const r of rows) if (r.status === 'pending' && r.user_id !== uid && owned.has(r.group_id)) (byGroup[r.group_id] ??= []).push(r)
      setRequests(byGroup)
      const names = readPending()
      const joined = new Set(memberships.map((m) => m.group_id))
      const waiting: MyRequest[] = []
      let changed = false
      for (const r of rows.filter((x) => x.user_id === uid)) {
        if (r.status === 'pending') waiting.push({ groupId: r.group_id, name: names[r.group_id] ?? '그룹' })
        else if (r.status === 'rejected' && r.group_id in names) {
          const name = names[r.group_id]
          delete names[r.group_id]
          changed = true
          setNotices((p) => [...p, { id: 'rej-' + r.group_id, name, emoji: '🚫', text: `${name} 그룹 참여 요청이 거절됐어요. 그룹장에게 확인해 주세요` }])
        }
      }
      for (const g of Object.keys(names)) {
        if (joined.has(g)) {
          delete names[g]
          changed = true
        }
      }
      if (changed) writePending(names)
      setMyRequests(waiting)
    } catch {
      /* 요청 목록은 보조 정보라 실패하면 지난 값을 둔다 */
    }
  }, [])

  const refresh = useCallback(async () => {
    if (busy.current) return
    // 저장 중인 변경이 있으면 서버 내용으로 덮어쓰지 않는다(저장이 끝난 뒤 다음 갱신 때 반영)
    if (anyWriting()) return
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
      if (anyWriting()) return // 읽는 사이에 쓰기가 시작됐다면 이번 결과는 버린다
      // 지난번에 있던 그룹이 소속 목록에서 사라졌다면(삭제·내보내기·나가기) 캐시에서 지우고 알린다
      const gone = findGone(cacheRef.current, memberships.map((m) => m.group_id))
      if (gone.length) {
        gone.forEach((n) => writers.current.delete(n.id))
        setNotices((p) => [...p.filter((x) => !gone.some((n) => n.id === x.id)), ...gone])
      }
      const next: CacheMap = {}
      let failed = false
      memberships.forEach((m, i) => {
        const r = results[i]
        if (r.status === 'fulfilled' && r.value) {
          const entry: CacheMap[string] = { role: m.role, fetchedAt: Date.now(), rows: r.value.rows }
          if (r.value.rev !== null) entry.rev = r.value.rev
          next[m.group_id] = entry
        } else {
          failed = true
          const old = cacheRef.current[m.group_id]
          if (old) next[m.group_id] = { ...old, role: m.role } // 실패한 그룹은 지난 내용을 유지
        }
      })
      commit(next)
      setOffline(failed)
      lastRun.current = Date.now()
      void loadRequests(c, u.id, memberships)
    } catch (e) {
      if (isNetworkError(e)) setOffline(true)
    } finally {
      busy.current = false
      setRefreshing(false)
    }
  }, [commit, loadRequests])
  refreshRef.current = refresh

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

  // 앱으로 돌아왔을 때·인터넷이 다시 연결됐을 때 갱신 (너무 자주는 아니게), 연결 상태 표시
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRun.current > 30_000 && Object.keys(cacheRef.current).length) void refresh()
    }
    const onOnline = () => {
      setOnline(true)
      void refresh()
    }
    const onOffline = () => setOnline(false)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [refresh])

  // 실시간 변경 알림: 내 서버 그룹들의 rev가 바뀌면 서버에서 다시 읽는다 (알림 내용은 믿지 않고 신호로만 쓴다)
  const rtRef = useRef<RealtimeSync | null>(null)
  const groupIdsKey = Object.keys(cache).sort().join(',')
  const userId = user?.id ?? null
  useEffect(() => {
    if (!rtRef.current) {
      rtRef.current = createRealtimeSync({
        open: (gid, onEvent, onStatus) => {
          let off = () => {}
          let closed = false
          void loadClient()
            .then((c) => {
              if (closed) return
              off = gid.startsWith('me:') ? openMembershipChannel(c, gid.slice(3), onEvent, onStatus) : openGroupChannel(c, gid, onEvent, onStatus)
            })
            .catch(() => onStatus('down'))
          return () => {
            closed = true
            off()
          }
        },
        getRev: (gid) => cacheRef.current[gid]?.rev,
        refresh: () => void refreshRef.current(),
        onState: setRealtime,
      })
    }
    // 그룹마다 변경 알림 + 로그인했으면 내 소속 변경 신호(내보내짐·그룹 삭제·참여 승인·참여 요청)
    const ids = groupIdsKey ? groupIdsKey.split(',') : []
    if (userId) ids.push('me:' + userId)
    rtRef.current.sync(ids)
  }, [groupIdsKey, userId])
  useEffect(
    () => () => {
      rtRef.current?.close()
      rtRef.current = null
    },
    [],
  )

  /** 그룹 하나의 쓰기 대기열 (서버 rev를 이어 가며 순서대로 보낸다) */
  const writerFor = useCallback(
    (gid: string): Writer => {
      let w = writers.current.get(gid)
      if (!w) {
        w = createWriter({
          apply: async (baseRev, ops) => applyGroupOps(await loadClient(), gid, baseRev, ops),
          getRev: () => cacheRef.current[gid]?.rev ?? null,
          onSaved: (rev) => {
            const cur = cacheRef.current[gid]
            if (cur) commit({ ...cacheRef.current, [gid]: { ...cur, rev, fetchedAt: Date.now() } })
          },
          onState: (state) => setWrite((p) => (state === 'failed' ? { ...p, state } : { state })),
          onFail: (kind) => {
            setWrite({ state: 'failed', message: failMessage(kind) })
            // 서버의 최신 내용으로 되돌린다 (낙관적으로 먼저 보여준 변경은 취소됨)
            setTimeout(() => void refreshRef.current(), 0)
          },
        })
        writers.current.set(gid, w)
      }
      return w
    },
    [commit],
  )

  const getGroup = useCallback((gid: string): Group | undefined => {
    const c = cacheRef.current[gid]
    return c ? rowsToGroup(c.rows) : undefined
  }, [])

  const commitGroup = useCallback(
    (gid: string, mutate: (g: Group) => Group): boolean => {
      const cur = cacheRef.current[gid]
      if (!cur || cur.role !== 'owner') return false
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setWrite({ state: 'failed', message: '인터넷에 연결되면 수정할 수 있어요. 방금 한 변경은 반영되지 않았어요.' })
        return false
      }
      const before = rowsToGroup(cur.rows)
      const after = mutate(before)
      const ops = diffGroups(before, after)
      if (!ops.length) return true
      // 먼저 화면에 반영(낙관적)하고, 서버에는 순서대로 보낸다
      commit({ ...cacheRef.current, [gid]: { ...cur, rows: applyOps(cur.rows, ops) } })
      writerFor(gid).enqueue(ops)
      return true
    },
    [commit, writerFor],
  )

  const join = useCallback(
    async (code: string, opts: JoinOptions = {}): Promise<JoinResult> => {
      try {
        const c = await loadClient()
        let u = await currentUser(c)
        if (!u) u = await signInAnonymously(c, opts.captchaToken) // 코드를 입력하는 순간에만 만든다
        setUser(u)
        await confirmAge(c)
        const res = await redeemInvite(c, code, opts.nickname?.trim() || undefined)
        if (res.status === 'invalid') return { ok: false, message: '코드가 맞지 않거나 만료됐어요. 그룹장에게 새 코드를 받아 주세요' }
        if (res.status === 'pending') {
          if (res.group_id) writePending({ ...readPending(), [res.group_id]: res.name ?? '그룹' })
          await refresh() // 승인 대기 표시
          return { ok: true, pending: true, name: res.name }
        }
        await refresh()
        return { ok: true, pending: false, name: res.name }
      } catch (e) {
        return { ok: false, message: joinErrorMessage(e instanceof Error ? e.message : undefined, isNetworkError(e)) }
      }
    },
    [refresh],
  )

  /** 서버로 옮겼던 연결 정보(내 기기 사본 ↔ 서버 그룹)를 지운다: 서버 그룹이 사라지면 내 기기 사본은 다시 일반 그룹이 된다 */
  const dropLinks = useCallback((match: (remoteId: string) => boolean) => {
    const next: Links = {}
    for (const [id, l] of Object.entries(linksRef.current)) if (!(l.remoteId && match(l.remoteId))) next[id] = l
    linksRef.current = next
    setLinksState(next)
    writeLinks(next)
  }, [])

  const resolveRequest = useCallback(
    async (requestId: string, approve: boolean): Promise<ActionResult> => {
      try {
        await resolveJoinRequestRpc(await loadClient(), requestId, approve)
        void refresh()
        return { ok: true }
      } catch (e) {
        return { ok: false, message: adminError(e, '처리하지 못했어요. 잠시 후 다시 시도해 주세요') }
      }
    },
    [refresh],
  )

  const removeViewer = useCallback(
    async (groupId: string, userId: string): Promise<ActionResult> => {
      try {
        await removeViewerRpc(await loadClient(), groupId, userId)
        return { ok: true }
      } catch (e) {
        return { ok: false, message: adminError(e, '내보내지 못했어요. 잠시 후 다시 시도해 주세요') }
      }
    },
    [],
  )

  const transferOwnership = useCallback(
    async (groupId: string, userId: string): Promise<ActionResult> => {
      try {
        writers.current.delete(groupId)
        await transferOwnershipRpc(await loadClient(), groupId, userId)
        await refresh() // 내 역할이 그룹원으로 바뀐 것을 읽는다
        return { ok: true }
      } catch (e) {
        return { ok: false, message: adminError(e, '그룹장을 넘기지 못했어요. 잠시 후 다시 시도해 주세요') }
      }
    },
    [refresh],
  )

  const deleteGroup = useCallback(
    async (groupId: string): Promise<ActionResult> => {
      try {
        if (writers.current.get(groupId)?.busy()) return { ok: false, message: '저장 중이에요. 잠시 후 다시 시도해 주세요' }
        await deleteGroupRpc(await loadClient(), groupId)
        writers.current.delete(groupId)
        // 내가 지운 그룹이라 "그룹이 없어졌어요" 안내는 띄우지 않는다
        const { [groupId]: _gone, ...rest } = cacheRef.current
        void _gone
        commit(rest)
        dropLinks((id) => id === groupId)
        void refresh()
        return { ok: true }
      } catch (e) {
        return { ok: false, message: adminError(e, '그룹을 지우지 못했어요. 잠시 후 다시 시도해 주세요') }
      }
    },
    [commit, dropLinks, refresh],
  )

  const deleteAccount = useCallback(async (): Promise<ActionResult> => {
    try {
      const c = await loadClient()
      await deleteAccountRpc(c)
      try {
        await signOutRemote(c) // 계정이 이미 지워져서 실패할 수 있다
      } catch {
        /* 이 기기의 세션은 아래에서 지운다 */
      }
      safeDel(AUTH_KEY)
      safeDel(PENDING_KEY)
      writers.current.clear()
      dropLinks(() => true)
      setUser(null)
      setRequests({})
      setMyRequests([])
      setNotices([])
      setWrite({ state: 'idle' })
      commit({})
      return { ok: true }
    } catch (e) {
      return { ok: false, message: adminError(e, '계정을 지우지 못했어요. 잠시 후 다시 시도해 주세요') }
    }
  }, [commit, dropLinks])

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
    writers.current.clear()
    setUser(null)
    setRequests({})
    setMyRequests([])
    setWrite({ state: 'idle' })
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

  const shareGroup = useCallback(
    async (group: Group, backupJson: string): Promise<ShareResult> => {
      const u = userRef.current
      if (!u || u.anonymous) return { ok: false, reason: 'import', message: 'Google 계정으로 로그인해야 서버로 옮길 수 있어요' }
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return { ok: false, reason: 'import', message: '인터넷에 연결되어 있지 않아요. 연결을 확인하고 다시 시도해 주세요' }
      let storage: Storage | null = null
      try {
        storage = localStorage
      } catch {
        storage = null
      }
      try {
        const c = await loadClient()
        await confirmAge(c) // 서버가 만 14세 확인 여부를 요구한다 (이미 했으면 그대로)
        const res = await shareLocalGroup(group, backupJson, {
          storage,
          links: () => linksRef.current,
          setLinks: (l) => {
            linksRef.current = l
            setLinksState(l)
            writeLinks(l)
          },
          importGroup: (payload) => importGroupRpc(c, payload),
          fetchRows: async (id) => (await fetchGroupRows(c, id))?.rows ?? null,
        })
        if (res.ok) await refresh() // 서버 그룹을 목록에 불러온다
        return res
      } catch {
        return { ok: false, reason: 'import', message: '서버로 옮기지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요. (다시 시도해도 중복으로 만들어지지 않아요)' }
      }
    },
    [refresh],
  )

  const dismissWrite = useCallback(() => setWrite({ state: 'idle' }), [])
  const dismissNotice = useCallback((id: string) => setNotices((p) => p.filter((n) => n.id !== id)), [])
  const groups = useMemo(() => toShared(cache), [cache])
  const value = useMemo<RemoteState>(
    () => ({ enabled: true, user, groups, online, offline, refreshing, write, dismissWrite, realtime, notices, dismissNotice, requests, myRequests, resolveRequest, removeViewer, transferOwnership, deleteGroup, deleteAccount, refresh, getGroup, links, shareGroup, commitGroup, join, signInGoogle, signOut, leave }),
    [user, groups, online, offline, refreshing, write, dismissWrite, realtime, notices, dismissNotice, requests, myRequests, resolveRequest, removeViewer, transferOwnership, deleteGroup, deleteAccount, refresh, getGroup, links, shareGroup, commitGroup, join, signInGoogle, signOut, leave],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
