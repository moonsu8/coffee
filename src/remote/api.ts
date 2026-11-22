import type { SupabaseClient } from '@supabase/supabase-js'
import type { GroupRows, ImportPayload, RemoteOp } from '../logic/remote-map'
import type { Role } from './cache'
import type { InviteRow } from './invite'
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

export async function signInAnonymously(c: SupabaseClient, captchaToken?: string): Promise<RemoteUser> {
  const { data, error } = await c.auth.signInAnonymously(captchaToken ? { options: { captchaToken } } : undefined)
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

export async function redeemInvite(c: SupabaseClient, code: string, nickname?: string): Promise<Redeemed> {
  const { data, error } = await c.rpc('redeem_invite', nickname ? { p_code: code, p_nickname: nickname } : { p_code: code })
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

/** 내 기기 그룹을 서버로 올린다(한 트랜잭션, import_key가 같으면 같은 그룹 id를 돌려준다) */
export async function importGroupRpc(c: SupabaseClient, payload: ImportPayload): Promise<string> {
  const { data, error } = await c.rpc('import_group', { p: payload })
  if (error || typeof data !== 'string') throw new Error(error?.message ?? 'import_failed')
  return data
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

/** 그룹장: 이 그룹의 초대 코드 목록(최근 것부터). 그룹원은 읽을 수 없다(RLS) */
export async function listInvites(c: SupabaseClient, groupId: string): Promise<InviteRow[]> {
  const { data, error } = await c
    .from('invites')
    .select('code, expires_at, max_uses, uses, requires_approval, revoked_at, created_at')
    .eq('group_id', groupId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw new Error(error.message)
  return (data ?? []) as InviteRow[]
}

/** 그룹장: 그룹원(viewer) 수. 그룹장은 자기 그룹의 소속 목록을 읽을 수 있다 */
export async function countViewers(c: SupabaseClient, groupId: string): Promise<number> {
  const { count, error } = await c.from('group_members').select('user_id', { count: 'exact', head: true }).eq('group_id', groupId).eq('role', 'viewer')
  if (error) throw new Error(error.message)
  return count ?? 0
}

export async function createInviteRpc(c: SupabaseClient, groupId: string, o: { ttlHours: number; maxUses: number; requiresApproval?: boolean }): Promise<string> {
  const { data, error } = await c.rpc('create_invite', { p_group: groupId, p_ttl_hours: o.ttlHours, p_max_uses: o.maxUses, p_requires_approval: o.requiresApproval === true })
  if (error || typeof data !== 'string') throw new Error(error?.message ?? 'invite_failed')
  return data
}

export async function revokeInviteRpc(c: SupabaseClient, code: string): Promise<void> {
  const { error } = await c.rpc('revoke_invite', { p_code: code })
  if (error) throw new Error(error.message)
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

/**
 * 그룹 하나의 변경 알림(Realtime)을 구독한다. 대상은 groups 테이블의 그 그룹 행(rev)뿐이고,
 * 알림이 오면 호출자가 서버에서 다시 읽는다. 해제 함수를 돌려준다.
 */
export function openGroupChannel(
  c: SupabaseClient,
  groupId: string,
  onEvent: (e: { type: 'INSERT' | 'UPDATE' | 'DELETE'; rev?: number }) => void,
  onStatus: (s: 'live' | 'down') => void,
): () => void {
  const ch = c
    .channel(`group:${groupId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'groups', filter: `id=eq.${groupId}` }, (p) => {
      const rev = (p.new as { rev?: unknown } | undefined)?.rev
      onEvent({ type: p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', rev: typeof rev === 'number' ? rev : undefined })
    })
    .subscribe((status) => {
      onStatus(status === 'SUBSCRIBED' ? 'live' : 'down')
    })
  return () => {
    void c.removeChannel(ch)
  }
}
