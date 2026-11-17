import type { Member } from '../types'

// 민트(#8FBFA8)는 '휴가' 전용이라 멤버 색상에서 제외
export const MEMBER_COLORS = [
  '#C8553D', // 테라코타
  '#D9A93B', // 머스타드
  '#7A8B4F', // 올리브
  '#5F86A6', // 더스티 블루
  '#8E5572', // 자두
  '#D98B8B', // 로즈
  '#B8742E', // 카라멜 브라운
  '#4F8A8B', // 딥 틸
]
export const MEMBER_EMOJIS = ['☕', '🧋', '🍩', '🥐', '🍪', '🐻', '🐱', '🐶', '🦊', '🐰', '🐼', '🐹', '🦉', '🐸', '🍀', '🌻']

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

export interface MemberStyle {
  color: string
  emoji: string
}

/** 멤버의 색상·이모지 (저장된 값이 없으면 id 해시로 항상 같은 값) */
export function memberStyle(m?: Pick<Member, 'id' | 'color' | 'emoji'> | null): MemberStyle {
  if (!m) return { color: '#9A8A7C', emoji: '👤' }
  const h = hash(m.id)
  return {
    color: m.color ?? MEMBER_COLORS[h % MEMBER_COLORS.length],
    emoji: m.emoji ?? MEMBER_EMOJIS[h % MEMBER_EMOJIS.length],
  }
}

/** 새 멤버에게 아직 안 쓰인 색상·이모지를 우선 배정 */
export function suggestStyle(members: Member[]): MemberStyle {
  const usedColors = new Set(members.map((m) => memberStyle(m).color))
  const usedEmojis = new Set(members.map((m) => memberStyle(m).emoji))
  return {
    color: MEMBER_COLORS.find((c) => !usedColors.has(c)) ?? MEMBER_COLORS[members.length % MEMBER_COLORS.length],
    emoji: MEMBER_EMOJIS.find((e) => !usedEmojis.has(e)) ?? MEMBER_EMOJIS[members.length % MEMBER_EMOJIS.length],
  }
}
