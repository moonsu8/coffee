import type { SupabaseClient } from '@supabase/supabase-js'
import type { GroupRows, RemoteOp } from '../logic/remote-map'
import type { Role } from './cache'
import { parseSnapshotFull } from './snapshot'

/**
 * Supabase와 통신하는 모든 코드. `supabase-js`는 여기서만, 그리고 필요할 때만 동적으로 불러온다
 * (공유를 쓰지 않는 사용자는 이 묶음을 받지 않는다).
 * 서비스 키는 쓰지 않는다: 클라이언트에는 공개 값(URL, anon key)만 있다.
 */

/** 공개 값: 비어 있으면 공유 기능 전체가 꺼진다 */
export const REMOTE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? ''
export const REMOTE_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? ''
export const remoteEnabled = Boolean(REMOTE_URL && REMOTE_KEY)

/** 로그인 세션이 저장되는 키(supabase-js 설정). 이 키가 있으면 시작할 때 클라이언트를 불러온다 */
export const AUTH_KEY = 'coffee-duty:auth'
/** Google 로그인 직전에 "만 14세 이상 확인"을 받았다는 표시. 돌아오면 서버에 기록한다 */
export const AGE_PENDING_KEY = 'coffee-duty:age-pending'

let clientPromise: Promise<SupabaseClient> | null = null

export function loadClient(): Promise<SupabaseClient> {
  if (!remoteEnabled) return Promise.reject(new Error('remote_disabled'))
  clientPromise ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(REMOTE_URL, REMOTE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: AUTH_KEY },
    }),
  )
  return clientPromise
}

export interface RemoteUser {
  id: string
  anonymous: boolean
}

export async function currentUser(c: SupabaseClient): Promise<RemoteUser | null> {
  const { data } = await c.auth.getSession() // 저장된 세션을 읽는다(네트워크 없이)
  const u = data.session?.user
  return u ? { id: u.id, anonymous: Boolean(u.is_anonymous) } : null
}

export async function signInAnonymously(c: SupabaseClient): Promise<RemoteUser> {
  const { data, error } = await c.auth.signInAnonymously()
  if (error || !data.user) throw new Error(error?.message ?? 'anonymous_failed')
  return { id: data.user.id, anonymous: true }
}

export async function confirmAge(c: SupabaseClient): Promise<void> {
  const { error } = await c.rpc('confirm_age', { p_terms_version: 'v1' })
  if (error) throw new Error(error.message)
}

export interface Redeemed {
  status: 'joined' | 'pending' | 'invalid'
  group_id?: string
  name?: string
}

export async function redeemInvite(c: SupabaseClient, code: string): Promise<Redeemed> {
  const { data, error } = await c.rpc('redeem_invite', { p_code: code })
  if (error) throw new Error(error.message)
  return data as Redeemed
}

export interface Membership {
  group_id: string
  role: Role
}

export async function listMemberships(c: SupabaseClient, userId: string): Promise<Membership[]> {
  const { data, error } = await c.from('group_members').select('group_id, role').eq('user_id', userId)
  if (error) throw new Error(error.message)
  return (data ?? []).filter((m): m is Membership => typeof m.group_id === 'string' && (m.role === 'owner' || m.role === 'viewer'))
}

/** 그룹 전체를 한 번에(일관되게) 읽는다. 소속이 아니면 null */
export async function fetchGroupRows(c: SupabaseClient, groupId: string): Promise<{ rows: GroupRows; rev: number | null } | null> {
  const { data, error } = await c.rpc('get_group_snapshot', { p_group: groupId })
  if (error) throw new Error(error.message)
  return data === null ? null : parseSnapshotFull(data)
}

export interface Applied {
  status: 'ok' | 'conflict'
  rev: number
}

/** 그룹장의 변경을 한 트랜잭션으로 적용 (기준 rev가 다르면 conflict) */
export async function applyGroupOps(c: SupabaseClient, groupId: string, baseRev: number, ops: RemoteOp[]): Promise<Applied> {
  const { data, error } = await c.rpc('apply_group_ops', { p_group: groupId, p_base_rev: baseRev, p_ops: ops })
  if (error) throw new Error(error.message)
  return data as Applied
}

export async function leaveGroup(c: SupabaseClient, groupId: string): Promise<void> {
  const { error } = await c.rpc('leave_group', { p_group: groupId })
  if (error) throw new Error(error.message)
}

export async function startGoogleLogin(c: SupabaseClient, redirectTo: string): Promise<void> {
  const { error } = await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } })
  if (error) throw new Error(error.message)
}

export async function signOutRemote(c: SupabaseClient): Promise<void> {
  await c.auth.signOut()
}

/** 네트워크 자체가 안 되는 오류인지(오프라인 판단용) */
export function isNetworkError(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e)
  return /fetch|network|load failed|failed to fetch/i.test(m) || (typeof navigator !== 'undefined' && navigator.onLine === false)
}
