import type { StorageLike } from '../lib/data'
import { diffContent, planImport, rowsToGroup, type GroupRows, type ImportPayload } from '../logic/remote-map'
import type { Group } from '../types'
import { shareBackupKey, type Links, type ShareLink, writeLinks } from './links'

/**
 * 내 기기 그룹 → 서버로 옮기기. 네트워크는 주입받아서(deps) 단독으로 테스트한다.
 *
 * 순서
 *  1. 이미 옮긴 그룹이면 거절
 *  2. 옮기기 직전의 전체 데이터를 백업 키에 남긴다(그룹마다 처음 한 번만. 이미 있으면 덮어쓰지 않는다). 실패하면 옮기지 않는다
 *  3. importKey와 멤버 id 매핑을 연결 정보에 먼저 저장한다(끊겨도 같은 값으로 다시 시도 → 서버에 중복 그룹이 안 생긴다)
 *  4. 서버에 한 번에(트랜잭션) 올린다
 *  5. 서버에서 다시 읽어 원본과 같은 내용인지 확인한다. 다르면 verified=false로 두고 경고한다(이 기기의 사본은 지우지 않도록)
 */
export interface ShareDeps {
  storage: StorageLike | null
  links: () => Links
  setLinks: (links: Links) => void
  importGroup: (payload: ImportPayload) => Promise<string>
  fetchRows: (remoteId: string) => Promise<GroupRows | null>
  now?: () => number
  uuid?: () => string
}

export type ShareFail = 'exists' | 'backup' | 'import' | 'fetch'
export type ShareResult =
  | { ok: true; remoteId: string; verified: boolean; mismatch: string[] }
  | { ok: false; reason: ShareFail; message: string }

const MSG: Record<ShareFail, string> = {
  exists: '이미 서버로 옮긴 그룹이에요',
  backup: '이 기기에 백업을 남기지 못해서 옮기지 않았어요. 저장 공간을 확인하거나 먼저 내보내기로 백업해 주세요.',
  import: '서버로 옮기지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요. (다시 시도해도 중복으로 만들어지지 않아요)',
  fetch: '서버로 올렸지만 내용을 확인하지 못했어요. 이 기기의 사본은 지우지 말고, 잠시 후 설정에서 새로고침해 확인해 주세요.',
}

export async function shareLocalGroup(group: Group, backupJson: string, deps: ShareDeps): Promise<ShareResult> {
  const now = deps.now ?? (() => Date.now())
  const links = deps.links()
  const existing = links[group.id]
  if (existing?.remoteId) return { ok: false, reason: 'exists', message: MSG.exists }

  // 2. 백업 (처음 한 번만)
  try {
    const st = deps.storage
    if (!st) throw new Error('no storage')
    const key = shareBackupKey(group.id)
    if (st.getItem(key) === null) st.setItem(key, backupJson)
  } catch {
    return { ok: false, reason: 'backup', message: MSG.backup }
  }

  // 3. 연결 정보(재시도용 key·id 매핑)를 먼저 저장
  const importKey = existing?.importKey ?? (deps.uuid ?? (() => crypto.randomUUID()))()
  const plan = planImport(group, importKey, { idMap: existing?.idMap, ...(deps.uuid ? { uuid: deps.uuid } : {}) })
  const pending: ShareLink = { importKey, idMap: plan.idMap, startedAt: existing?.startedAt ?? now() }
  let current: Links = { ...links, [group.id]: pending }
  deps.setLinks(current)

  // 4. 서버에 올리기
  let remoteId: string
  try {
    remoteId = await deps.importGroup(plan.payload)
  } catch {
    return { ok: false, reason: 'import', message: MSG.import }
  }
  current = { ...current, [group.id]: { ...pending, remoteId, sharedAt: now() } }
  deps.setLinks(current)

  // 5. 서버에서 다시 읽어 대조
  try {
    const rows = await deps.fetchRows(remoteId)
    if (!rows) throw new Error('empty')
    const mismatch = diffContent(rowsToGroup(rows), plan.expected)
    const verified = mismatch.length === 0
    current = { ...current, [group.id]: { ...current[group.id], verified } }
    deps.setLinks(current)
    return { ok: true, remoteId, verified, mismatch }
  } catch {
    return { ok: false, reason: 'fetch', message: MSG.fetch }
  }
}

/** 연결 정보를 저장소에 쓰는 기본 구현 */
export const persistLinks = (storage: StorageLike | null) => (links: Links) => {
  writeLinks(links, storage)
}
