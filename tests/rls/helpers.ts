import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * RLS 테스트 공용 도우미. 반드시 "테스트 전용" Supabase 프로젝트에만 연결한다.
 *  - 환경 변수 이름이 운영(VITE_SUPABASE_*)과 다르다: SUPABASE_TEST_URL / SUPABASE_TEST_ANON_KEY
 *  - 테스트 프로젝트에는 supabase/test-only/sentinel.sql을 적용해 둔다(is_test_project() = true)
 *  - service_role 키는 쓰지 않는다. 사용자는 익명 로그인으로 만든다.
 */

export const TEST_URL = process.env.SUPABASE_TEST_URL ?? ''
export const TEST_KEY = process.env.SUPABASE_TEST_ANON_KEY ?? ''
export const configured = Boolean(TEST_URL && TEST_KEY)

/** 운영 값과 같은 주소를 가리키면 테스트를 거부한다 */
export function assertNotProduction() {
  const prod = [process.env.VITE_SUPABASE_URL, process.env.SUPABASE_PROD_URL].filter(Boolean)
  if (prod.includes(TEST_URL)) throw new Error('SUPABASE_TEST_URL이 운영 프로젝트 주소와 같아요. 테스트를 중단합니다.')
}

export type Client = SupabaseClient

export const anonClient = (): Client =>
  createClient(TEST_URL, TEST_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })

export interface TestUser {
  client: Client
  id: string
}

/** 익명 로그인으로 사용자 한 명을 만든다 (IP당 시간당 30회 제한이 있어 테스트 한 번에 5명만 만든다) */
export async function newUser(opts: { adult?: boolean } = {}): Promise<TestUser> {
  const client = anonClient()
  const { data, error } = await client.auth.signInAnonymously()
  if (error || !data.user) throw new Error(`익명 로그인 실패: ${error?.message}`)
  if (opts.adult !== false) {
    const r = await client.rpc('confirm_age', { p_terms_version: 'test' })
    if (r.error) throw new Error(`confirm_age 실패: ${r.error.message}`)
  }
  return { client, id: data.user.id }
}

export async function mustRpc<T = unknown>(c: Client, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await c.rpc(fn, args)
  if (error) throw new Error(`${fn}: ${error.message}`)
  return data as T
}

/** 그룹장이 그룹과 멤버 2명, 기록 1건을 만든다 */
export async function seedGroup(owner: TestUser) {
  const gid = await mustRpc<string>(owner.client, 'create_group', { p_name: '테스트', p_emoji: '☕' })
  const ins = await owner.client
    .from('members')
    .insert([
      { group_id: gid, name: '가람', sort: 1 },
      { group_id: gid, name: '나래', sort: 2 },
    ])
    .select()
  if (ins.error) throw new Error(`members insert: ${ins.error.message}`)
  const [m1] = ins.data!
  const rec = await owner.client.from('records').insert({ group_id: gid, date: '2026-11-17', member_id: m1.id, memo: '첫 기록' })
  if (rec.error) throw new Error(`records insert: ${rec.error.message}`)
  return { gid, memberId: m1.id as string }
}

export async function joinAsViewer(owner: TestUser, gid: string, viewer: TestUser) {
  const code = await mustRpc<string>(owner.client, 'create_invite', { p_group: gid })
  const res = await mustRpc<{ status: string }>(viewer.client, 'redeem_invite', { p_code: code })
  if (res.status !== 'joined') throw new Error(`참여 실패: ${res.status}`)
  return code
}
