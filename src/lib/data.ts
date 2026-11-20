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
  updatedAt: 0,
}

/** 외부 JSON(data.json / 가져오기 파일 / localStorage)을 최신 구조로 변환 (lib/migrate.ts) */
export const parseAppData = migrate

const KEY = 'coffee-duty:v1' // 키 이름은 유지하고 값 안의 schemaVersion으로 구분한다
const BACKUP_KEY = 'coffee-duty:backup-before-v2' // 마이그레이션 직전 원본
const CORRUPT_KEY = 'coffee-duty:corrupt-backup' // 읽을 수 없던 저장값 원본

export interface LoadResult {
  data: AppData
  /** 저장 금지 상태: 이 데이터를 덮어쓰면 원본을 잃을 수 있을 때의 안내 문구 */
  blocked?: string
}

function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* 저장 공간 부족/차단 */
  }
}

export async function loadInitialData(): Promise<LoadResult> {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    /* 접근 차단 */
  }
  if (raw) {
    try {
      const json = JSON.parse(raw)
      const data = migrate(json)
      // 구버전을 처음 옮기는 순간에만, 원본을 한 번 따로 보관한다 (이미 있으면 덮어쓰지 않음)
      if (versionOf(json) < SCHEMA_VERSION) {
        try {
          if (!localStorage.getItem(BACKUP_KEY)) safeSet(BACKUP_KEY, raw)
        } catch {
          /* 무시 */
        }
      }
      return { data }
    } catch (e) {
      if (e instanceof FutureVersionError) return { data: EMPTY_DATA, blocked: e.message }
      // 읽을 수 없는 값: 초기 데이터로 덮어쓰기 전에 원본을 따로 남긴다
      safeSet(CORRUPT_KEY, raw)
    }
  }
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data.json`, { cache: 'no-cache' })
    if (res.ok) return { data: migrate(await res.json()) }
  } catch {
    /* 오프라인 등 */
  }
  return { data: EMPTY_DATA }
}

export function saveData(data: AppData) {
  safeSet(KEY, JSON.stringify(data))
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
