/** 금액 표시·입력 유틸 */

export const won = (n: number) => `${n.toLocaleString('ko-KR')}원`

/** 차액: +3,200원 / −1,500원 / 0원 (마이너스 기호는 U+2212) */
export const signedWon = (n: number) => (n === 0 ? '0원' : `${n > 0 ? '+' : '−'}${Math.abs(n).toLocaleString('ko-KR')}원`)

/** 입력값에서 숫자만 남김 (최대 9자리, 앞의 0 제거) */
export const digitsOnly = (s: string) => s.replace(/\D/g, '').slice(0, 9).replace(/^0+(?=\d)/, '')

/** 숫자 문자열 → 천 단위 쉼표 */
export const groupDigits = (s: string) => (s ? Number(s).toLocaleString('ko-KR') : '')
