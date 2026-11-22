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
