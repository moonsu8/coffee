import type { StorageLike } from '../lib/data'

/**
 * "내 기기 그룹 ↔ 서버로 옮긴 그룹" 연결 정보. 기기별 화면/상태 정보라서 앱 데이터(AppData)와 분리된 별도 키에 둔다
 * (내보내기·가져오기·shadow에 섞이지 않는다).
 *
 *  - 옮기는 도중(pending): importKey와 멤버 id 매핑을 먼저 저장해 두어, 중간에 끊겨도 같은 값으로 다시 시도하면 서버에 중복 그룹이 생기지 않는다.
 *  - 옮긴 뒤: remoteId(서버 그룹 id)와 검증 결과를 기록한다.
 */
export const LINKS_KEY = 'coffee-duty:share-links'
/** 옮기기 직전 전체 데이터 백업 (그룹마다 처음 한 번만 쓴다) */
export const shareBackupKey = (localGroupId: string) => `coffee-duty:backup-before-share-${localGroupId}`

export interface ShareLink {
  importKey: string
  /** 기기 멤버 id → 서버 uuid (재시도해도 같은 payload가 되도록) */
  idMap: Record<string, string>
  startedAt: number
  /** 서버에서 만들어진 그룹 id (옮기기가 끝나면 채워진다) */
  remoteId?: string
  sharedAt?: number
  /** 옮긴 뒤 서버에서 다시 읽어 원본과 같은 내용인지 확인했는지 */
  verified?: boolean
}
export type Links = Record<string, ShareLink>

function store(): StorageLike | null {
  try {
    return localStorage
  } catch {
    return null
  }
}

export function readLinks(storage: StorageLike | null = store()): Links {
  try {
    const raw = storage?.getItem(LINKS_KEY)
    if (!raw) return {}
    const json = JSON.parse(raw)
    if (json?.v !== 1 || typeof json.links !== 'object' || json.links === null) return {}
    const out: Links = {}
    for (const [id, l] of Object.entries(json.links as Record<string, ShareLink>)) {
      if (l && typeof l.importKey === 'string' && typeof l.startedAt === 'number' && l.idMap && typeof l.idMap === 'object') out[id] = l
    }
    return out
  } catch {
    return {}
  }
}

/** 저장 성공 여부 (공간 부족·차단이면 false) */
export function writeLinks(links: Links, storage: StorageLike | null = store()): boolean {
  try {
    if (!storage) return false
    storage.setItem(LINKS_KEY, JSON.stringify({ v: 1, links }))
    return true
  } catch {
    return false
  }
}

/**
 * 내 기기 그룹이 서버 그룹과 어떤 관계인지:
 *  - null: 연결 없음(일반 내 기기 그룹)
 *  - 'moved': 서버로 옮겼고, 그 서버 그룹이 지금 보인다 → 이 사본은 전환기에서 숨긴다
 *  - 'stale': 서버로 옮겼지만 서버 그룹이 지금 보이지 않는다(로그아웃·다른 계정 등) → "이전 사본"으로 표시하고 수정할 때 경고한다
 *  - 'pending': 옮기는 도중에 끊겼다(아직 서버 그룹 id를 모른다) → 일반 그룹처럼 쓴다
 */
export type CopyStatus = null | 'moved' | 'stale' | 'pending'

export function copyStatus(link: ShareLink | undefined, visibleRemoteIds: ReadonlySet<string>): CopyStatus {
  if (!link) return null
  if (!link.remoteId) return 'pending'
  return visibleRemoteIds.has(link.remoteId) ? 'moved' : 'stale'
}
