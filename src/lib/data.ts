import { SCHEMA_VERSION, type AppData } from '../types'
import { FutureVersionError, migrate, versionOf } from './migrate'

export const EMPTY_DATA: AppData = {
  schemaVersion: SCHEMA_VERSION,
  members: [],
  purchases: [],
  absences: [],
  skipDays: [],
  orders: [],
  customMenus: [],
  priceList: [],
  settings: { buyerRule: 'count', defaultPriceMode: 'none' },
  updatedAt: 0,
}

/** 외부 JSON(data.json / 가져오기 파일 / localStorage)을 최신 구조로 변환 (lib/migrate.ts) */
export const parseAppData = migrate

/* ───────── 저장소 키 ───────── */

export const KEY = 'coffee-duty:v1' // 키 이름은 유지하고 값 안의 schemaVersion으로 구분한다
export const SHADOW_KEY = 'coffee-duty:shadow' // 저장할 때마다 함께 쓰는 전체 데이터 복사본(옛 앱은 이 키를 모른다)
export const SHADOW_PREV_KEY = 'coffee-duty:shadow-prev' // "그대로 두기"를 고른 뒤 보관해 둔 이전 shadow
export const RESTORE_BACKUP_KEY = 'coffee-duty:backup-before-restore' // 되돌리기 직전의 메인 원본
const BACKUP_KEY = 'coffee-duty:backup-before-v2' // 마이그레이션 직전 원본
const CORRUPT_KEY = 'coffee-duty:corrupt-backup' // 읽을 수 없던 저장값 원본

/** localStorage의 최소 인터페이스 (테스트에서 메모리 저장소로 대체) */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function browserStorage(): StorageLike | null {
  try {
    return localStorage
  } catch {
    return null // 접근 차단
  }
}
function read(storage: StorageLike | null, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null
  } catch {
    return null
  }
}
/** 저장 성공 여부를 돌려준다 (공간 부족/차단이면 false) */
function write(storage: StorageLike | null, key: string, value: string): boolean {
  try {
    if (!storage) return false
    storage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/* ───────── shadow (마지막 정상 상태) ───────── */

export interface ShadowInfo {
  data: AppData
  savedAt: number // shadow에 담긴 updatedAt
  raw: string
}

/** shadow를 읽는다. 없거나, 깨졌거나, v2가 아니면(미래 버전 포함) null — 조용히 무시 */
export function readShadow(storage: StorageLike | null = browserStorage(), key: string = SHADOW_KEY): ShadowInfo | null {
  const raw = read(storage, key)
  if (!raw) return null
  try {
    const json = JSON.parse(raw)
    if (versionOf(json) !== SCHEMA_VERSION) return null
    const data = migrate(json)
    return { data, savedAt: data.updatedAt, raw }
  } catch {
    return null
  }
}

/**
 * 옛 버전 앱이 메인을 덮어썼는지: 메인은 v1 모양(schemaVersion 없음)인데 v2 shadow가 있고 더 최신일 때.
 * (새 코드는 항상 schemaVersion을 붙여 저장하므로, v1 모양의 메인 = 옛 앱이 쓴 것)
 */
export function isOverwrittenByOldApp(mainJson: unknown, shadow: ShadowInfo | null): boolean {
  if (!shadow || versionOf(mainJson) >= SCHEMA_VERSION) return false
  const mainAt =
    typeof mainJson === 'object' && mainJson !== null && typeof (mainJson as { updatedAt?: unknown }).updatedAt === 'number'
      ? (mainJson as { updatedAt: number }).updatedAt
      : 0
  return shadow.savedAt > mainAt
}

/** 사용자에게 물어볼 복구 후보 (자동으로 적용하지 않는다) */
export interface Recovery {
  shadow: AppData
  shadowRaw: string
  savedAt: number
}
const toRecovery = (s: ShadowInfo): Recovery => ({ shadow: s.data, shadowRaw: s.raw, savedAt: s.savedAt })

/* ───────── 불러오기 / 저장 ───────── */

export interface LoadResult {
  data: AppData
  /** 저장 금지 상태: 이 데이터를 덮어쓰면 원본을 잃을 수 있을 때의 안내 문구 */
  blocked?: string
  /** 있으면 사용자가 고를 때까지 저장하지 않고 먼저 물어본다 */
  recovery?: Recovery
}

async function fetchInitial(): Promise<AppData> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data.json`, { cache: 'no-cache' })
    if (res.ok) return migrate(await res.json())
  } catch {
    /* 오프라인 등 */
  }
  return EMPTY_DATA
}

export async function loadInitialData(
  storage: StorageLike | null = browserStorage(),
  initial: () => Promise<AppData> = fetchInitial,
): Promise<LoadResult> {
  const raw = read(storage, KEY)
  if (!raw) return { data: await initial() }

  try {
    const json = JSON.parse(raw)
    const data = migrate(json)
    // 구버전을 처음 옮기는 순간에만, 원본을 한 번 따로 보관한다 (이미 있으면 덮어쓰지 않음)
    if (versionOf(json) < SCHEMA_VERSION && !read(storage, BACKUP_KEY)) write(storage, BACKUP_KEY, raw)
    const shadow = readShadow(storage)
    if (isOverwrittenByOldApp(json, shadow)) return { data, recovery: toRecovery(shadow!) }
    return { data }
  } catch (e) {
    if (e instanceof FutureVersionError) return { data: EMPTY_DATA, blocked: e.message }
    // 읽을 수 없는 값: 초기 데이터로 덮어쓰기 전에 원본을 따로 남긴다
    write(storage, CORRUPT_KEY, raw)
    const shadow = readShadow(storage) // 마지막 정상 상태가 있으면 덮어쓰기 전에 물어본다
    const data = await initial()
    return shadow ? { data, recovery: toRecovery(shadow) } : { data }
  }
}

/** 메인과 shadow(마지막 정상 상태)에 함께 저장한다 */
export function saveData(data: AppData, storage: StorageLike | null = browserStorage()) {
  const json = JSON.stringify(data)
  write(storage, KEY, json)
  write(storage, SHADOW_KEY, json)
}

/**
 * 복구 질문에 대한 사용자의 선택을 적용한다.
 * - restore: 지금 메인을 backup-before-restore에 남기고 shadow 전체를 새 데이터로 돌려준다
 * - keep: 이전 shadow를 shadow-prev에 보관(이후 저장으로 shadow가 덮어써지기 전에)하고 현재 데이터를 그대로 쓴다
 * 보관에 실패하면 ok=false (호출한 쪽은 선택을 확정하지 않는다)
 */
export function applyRecovery(
  choice: 'restore' | 'keep',
  recovery: Recovery,
  current: AppData,
  storage: StorageLike | null = browserStorage(),
): { data: AppData; ok: boolean } {
  if (choice === 'keep') {
    return { data: current, ok: write(storage, SHADOW_PREV_KEY, recovery.shadowRaw) }
  }
  const main = read(storage, KEY)
  const ok = main === null || write(storage, RESTORE_BACKUP_KEY, main)
  return { data: recovery.shadow, ok }
}

/** 설정의 수동 메뉴: 마지막 정상 상태(shadow)로 되돌린다. 되돌릴 상태가 없거나 보관 실패면 null */
export function restoreLastGood(current: AppData, storage: StorageLike | null = browserStorage()): AppData | null {
  const shadow = readShadow(storage)
  if (!shadow) return null
  const r = applyRecovery('restore', toRecovery(shadow), current, storage)
  return r.ok ? r.data : null
}

/** 파일로 내려받기 */
export function downloadJson(data: AppData, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
