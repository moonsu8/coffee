/**
 * 테스트 프로젝트에 샘플 그룹(멤버·기록·휴가·주문)과 초대 코드를 넣는다.  사용: npm run seed:test [-- --approval]
 *
 *  - service_role 키 없이 동작한다: 익명 사용자 1명을 만들어 그 사용자가 기존 RPC(confirm_age → import_group → create_invite)로 만든다.
 *  - 반드시 "테스트 전용" 프로젝트에서만 돈다(.env.test.local, is_test_project() 확인). 운영 주소와 같으면 중단한다.
 *  - 출력은 초대 코드와 그룹 이름뿐이다. 이름은 모두 가짜(별명)다.
 *  - 이 사용자는 세션을 저장하지 않으므로 이 그룹의 "그룹장"은 이후 다시 로그인할 수 없다(보기 전용 확인용 그룹).
 *    그룹장 기능(1-D)은 Google 로그인으로 따로 만든 그룹으로 확인한다.
 *  - 초대 코드는 30일, 최대 200명, --approval 이면 그룹장 승인이 필요한 코드다.
 */
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'
import { groupToImport } from '../src/logic/remote-map'
import { defaultCoffeeGroup } from '../src/logic/groups'
import { addDays, today as todayStr } from '../src/logic/dates'
import type { Group } from '../src/types'

const env = loadEnv('test', process.cwd(), '')
const origin = (u?: string) => {
  try {
    return u ? new URL(u.trim()).origin : ''
  } catch {
    return ''
  }
}
const url = origin(env.SUPABASE_TEST_URL)
const key = env.SUPABASE_TEST_ANON_KEY
if (!url || !key) {
  console.error('.env.test.local 에 SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY 가 필요해요.')
  process.exit(1)
}
if ([env.VITE_SUPABASE_URL, env.SUPABASE_PROD_URL].map(origin).filter(Boolean).includes(url)) {
  console.error('SUPABASE_TEST_URL 이 운영 주소와 같아요. 중단합니다.')
  process.exit(1)
}

/** 최근 평일에 돌아가며 산 것처럼 보이는 샘플 (가짜 이름) */
function sample(): Group {
  const g = defaultCoffeeGroup()
  const names = ['가람', '나래', '다온', '라온', '마루', '바다']
  const members = names.map((name, i) => ({ id: `s${i}`, name, order: i + 1 }))
  const today = todayStr()
  const records: Group['records'] = []
  let d = addDays(today, -1)
  let i = 0
  while (records.length < 8) {
    const dow = new Date(`${d}T00:00:00`).getDay()
    if (dow !== 0 && dow !== 6) records.push({ date: d, memberId: members[i++ % members.length].id })
    d = addDays(d, -1)
  }
  records.reverse()
  return {
    ...g,
    id: 'seed',
    name: '샘플 커피',
    members,
    records,
    absences: [{ id: 'sa1', memberId: members[4].id, from: addDays(today, 1), to: addDays(today, 2) }],
    skipDays: [],
  }
}

const c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })

const probe = await c.rpc('is_test_project')
if (probe.error || probe.data !== true) {
  console.error('이 프로젝트에는 supabase/test-only/sentinel.sql 이 적용되지 않았어요. 테스트 전용 프로젝트가 맞는지 확인하세요.')
  process.exit(1)
}

const signed = await c.auth.signInAnonymously()
if (signed.error) {
  console.error('익명 로그인 실패:', signed.error.message, '(익명 로그인 한도 또는 설정을 확인하세요)')
  process.exit(1)
}
const step = async <T>(label: string, p: PromiseLike<{ data: T; error: { message: string } | null }>) => {
  const { data, error } = await p
  if (error) {
    console.error(`${label} 실패: ${error.message}`)
    process.exit(1)
  }
  return data
}

await step('confirm_age', c.rpc('confirm_age', { p_terms_version: 'seed' }))
const gid = await step<string>('import_group', c.rpc('import_group', { p: groupToImport(sample(), crypto.randomUUID()) }))
const code = await step<string>(
  'create_invite',
  c.rpc('create_invite', { p_group: gid, p_ttl_hours: 24 * 30, p_max_uses: 200, p_requires_approval: process.argv.includes('--approval') }),
)
console.log(`샘플 그룹 "샘플 커피"를 만들었어요.${process.argv.includes('--approval') ? ' (승인 필요 코드)' : ''}`)
console.log(`초대 코드: ${code}`)
