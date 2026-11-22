/** 초대 코드: 8자리 이상, 0/O, 1/I를 뺀 32글자 (서버 gen_invite_code 와 같은 집합). 코드는 대문자로만 보여주므로 L은 헷갈리지 않아 쓴다 */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 8

/** 입력을 정리한다: 공백·하이픈·점 제거, 대문자로 */
export function normalizeInviteCode(input: string): string {
  return input.replace(/[\s\-._]/g, '').toUpperCase()
}

export type CodeCheck = { ok: true; code: string } | { ok: false; reason: 'empty' | 'length' | 'chars' }

export function checkInviteCode(input: string): CodeCheck {
  const code = normalizeInviteCode(input)
  if (!code) return { ok: false, reason: 'empty' }
  if ([...code].some((c) => !CODE_ALPHABET.includes(c))) return { ok: false, reason: 'chars' }
  if (code.length < CODE_LENGTH) return { ok: false, reason: 'length' }
  return { ok: true, code }
}

export const codeMessage = (reason: 'empty' | 'length' | 'chars'): string =>
  reason === 'empty'
    ? '초대 코드를 입력해 주세요'
    : reason === 'length'
      ? '코드는 8자리예요. 다시 확인해 주세요'
      : '코드에 쓸 수 없는 글자가 있어요. (0, O, 1, I는 쓰지 않아요)'

/** 서버 오류 → 사용자에게 보여줄 문장 (내부 메시지는 그대로 보여주지 않는다) */
export function joinErrorMessage(raw: string | undefined, offline = false): string {
  const m = raw ?? ''
  if (offline) return '인터넷에 연결되어 있지 않아요. 연결을 확인하고 다시 시도해 주세요'
  if (m.includes('rate_limited')) return '시도가 너무 많아요. 잠시 후 다시 해 주세요'
  if (m.includes('age_not_confirmed')) return '만 14세 이상 확인이 필요해요'
  return '지금은 참여할 수 없어요. 잠시 후 다시 시도해 주세요'
}

/* ───────── 그룹장: 초대 코드 만들기 ───────── */

/** 유효 기간 선택지 (서버는 1시간~30일을 허용) */
export const INVITE_TTL_OPTIONS = [
  { hours: 24, label: '1일' },
  { hours: 24 * 7, label: '7일' },
  { hours: 24 * 30, label: '30일' },
] as const

export const INVITE_DEFAULT_TTL_HOURS = 24 * 7
export const INVITE_MAX_USES_LIMIT = 200 // 서버 상한

/** 기본값: 유효 7일, 인원은 그룹 멤버 수 정도(최소 1, 서버 상한 200) */
export function defaultInviteOptions(memberCount: number): { ttlHours: number; maxUses: number } {
  return { ttlHours: INVITE_DEFAULT_TTL_HOURS, maxUses: Math.min(INVITE_MAX_USES_LIMIT, Math.max(1, Math.floor(memberCount) || 1)) }
}

export function clampMaxUses(n: number): number {
  return Math.min(INVITE_MAX_USES_LIMIT, Math.max(1, Math.floor(n) || 1))
}

/** 서버 invites 행 (그룹장만 읽을 수 있다) */
export interface InviteRow {
  code: string
  expires_at: string
  max_uses: number
  uses: number
  requires_approval: boolean
  revoked_at: string | null
  created_at: string
}

export type InviteStatus = 'active' | 'expired' | 'full' | 'revoked'

export function inviteStatus(inv: InviteRow, now: number = Date.now()): InviteStatus {
  if (inv.revoked_at) return 'revoked'
  if (new Date(inv.expires_at).getTime() <= now) return 'expired'
  if (inv.uses >= inv.max_uses) return 'full'
  return 'active'
}

/** "11/29(일)까지" 형태 */
export function formatExpiry(iso: string): string {
  const d = new Date(iso)
  const wd = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]
  return `${d.getMonth() + 1}/${d.getDate()}(${wd})까지`
}

/** 단톡방에 붙여 넣을 안내 문구 */
export function inviteShareText(o: { emoji: string; name: string; code: string; expiresAt: string; maxUses: number; appUrl: string }): string {
  return [
    `${o.emoji} ${o.name} 그룹에 초대해요`,
    '앱에서 설정 > 공유 그룹 > 초대 코드로 참여에 아래 코드를 입력해 주세요. (보기만 할 수 있어요)',
    `초대 코드: ${o.code}  (${formatExpiry(o.expiresAt)}, 최대 ${o.maxUses}명)`,
    `앱 주소: ${o.appUrl}`,
  ].join('\n')
}
