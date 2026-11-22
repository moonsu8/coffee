import type { CacheMap } from './cache'

/** 서버 그룹이 목록에서 사라졌다는 안내 (그룹이 삭제됐거나 내가 더 이상 소속이 아닐 때) */
export interface GoneNotice {
  id: string
  name: string
  emoji: string
  /** 지정하면 기본 문구 대신 이 문구를 보여준다(참여 거절 등) */
  text?: string
}

/**
 * 지난 캐시에는 있었는데 이번 소속 목록에는 없는 그룹을 찾는다.
 * 소속 목록을 성공적으로 읽었을 때만 쓴다(네트워크 실패로 비어 보이는 경우와 구분하려고).
 */
export function findGone(prev: CacheMap, memberIds: string[]): GoneNotice[] {
  const now = new Set(memberIds)
  return Object.entries(prev)
    .filter(([id]) => !now.has(id))
    .map(([id, c]) => ({ id, name: c.rows.group.name, emoji: c.rows.group.emoji }))
}

export const goneMessage = (n: GoneNotice) =>
  n.text ??
  `${n.emoji} ${n.name} 그룹이 없어졌어요. 그룹이 삭제됐거나 더 이상 볼 수 없어요. 이 기기에 저장해 둔 이 그룹의 내용은 지웠어요`
