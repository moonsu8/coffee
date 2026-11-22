import type { SupabaseClient } from '@supabase/supabase-js'

/** 그룹장 관리 기능의 서버 호출 (그룹원 목록·내보내기·넘기기·삭제·참여 요청, 계정 삭제, 소속 변경 신호 구독) */

export interface ViewerRow {
  user_id: string
  nickname: string | null
  joined_at: string
}

/** 그룹장: 이 그룹의 그룹원(viewer) 목록, 들어온 순서 */
export async function listViewers(c: SupabaseClient, groupId: string): Promise<ViewerRow[]> {
  const { data, error } = await c
    .from('group_members')
    .select('user_id, nickname, joined_at')
    .eq('group_id', groupId)
    .eq('role', 'viewer')
    .order('joined_at', { ascending: true })
    .limit(300)
  if (error) throw new Error(error.message)
  return (data ?? []) as ViewerRow[]
}

export async function removeViewerRpc(c: SupabaseClient, groupId: string, userId: string): Promise<void> {
  const { error } = await c.rpc('remove_viewer', { p_group: groupId, p_user: userId })
  if (error) throw new Error(error.message)
}

export async function transferOwnershipRpc(c: SupabaseClient, groupId: string, userId: string): Promise<void> {
  const { error } = await c.rpc('transfer_ownership', { p_group: groupId, p_user: userId })
  if (error) throw new Error(error.message)
}

export async function deleteGroupRpc(c: SupabaseClient, groupId: string): Promise<void> {
  const { error } = await c.rpc('delete_group', { p_group: groupId })
  if (error) throw new Error(error.message)
}

export async function deleteAccountRpc(c: SupabaseClient): Promise<void> {
  const { error } = await c.rpc('delete_my_account')
  if (error) throw new Error(error.message)
}

export interface JoinRequestRow {
  id: string
  group_id: string
  user_id: string
  status: 'pending' | 'approved' | 'rejected'
  nickname: string | null
  created_at: string
}

/** 내가 볼 수 있는 참여 요청 전부: 내 요청 + 내가 그룹장인 그룹으로 온 요청 (RLS) */
export async function listJoinRequests(c: SupabaseClient): Promise<JoinRequestRow[]> {
  const { data, error } = await c
    .from('join_requests')
    .select('id, group_id, user_id, status, nickname, created_at')
    .neq('status', 'approved')
    .order('created_at', { ascending: true })
    .limit(300)
  if (error) throw new Error(error.message)
  return (data ?? []) as JoinRequestRow[]
}

export async function resolveJoinRequestRpc(c: SupabaseClient, requestId: string, approve: boolean): Promise<void> {
  const { error } = await c.rpc('resolve_join_request', { p_request: requestId, p_approve: approve })
  if (error) throw new Error(error.message)
}

/**
 * 내 소속 변경 신호(profiles.membership_rev)를 구독한다. 그룹이 생기거나 사라지거나(삭제·내보내기·나가기),
 * 역할이 바뀌거나, 내 그룹에 참여 요청이 오면 알림이 온다. 알림 내용은 쓰지 않고 다시 읽는 신호로만 쓴다.
 */
export function openMembershipChannel(
  c: SupabaseClient,
  userId: string,
  onEvent: (e: { type: 'INSERT' | 'UPDATE' | 'DELETE'; rev?: number }) => void,
  onStatus: (s: 'live' | 'down') => void,
): () => void {
  const ch = c
    .channel(`me:${userId}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `user_id=eq.${userId}` }, (p) => {
      onEvent({ type: p.eventType as 'INSERT' | 'UPDATE' | 'DELETE' })
    })
    .subscribe((status) => onStatus(status === 'SUBSCRIBED' ? 'live' : 'down'))
  return () => {
    void c.removeChannel(ch)
  }
}

/** 그룹원 표시 이름: 별명이 있으면 별명, 없으면 "그룹원 N" (들어온 순서) */
export function viewerLabel(v: { nickname: string | null }, index: number): string {
  const n = v.nickname?.trim()
  return n ? n : `그룹원 ${index + 1}`
}
