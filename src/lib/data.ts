import type { AppData, Absence, Member, Purchase } from '../types'
import { uid } from './utils'

export const EMPTY_DATA: AppData = { members: [], purchases: [], absences: [], skipDays: [] }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const isDate = (v: unknown): v is string => typeof v === 'string' && DATE_RE.test(v)
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/**
 * 외부 JSON(data.json / 가져오기 파일 / localStorage)을 검증하고 정규화한다.
 * 형식이 아예 틀리면 Error, 일부 항목만 잘못이면 그 항목만 버린다.
 */
export function parseAppData(input: unknown): AppData {
  if (!isObj(input) || !Array.isArray(input.members)) {
    throw new Error('올바른 커피 당번 데이터가 아니에요')
  }
  const members: Member[] = []
  const seen = new Set<string>()
  input.members.forEach((raw, i) => {
    if (!isObj(raw) || typeof raw.name !== 'string' || !raw.name.trim()) return
    const id = typeof raw.id === 'string' && raw.id && !seen.has(raw.id) ? raw.id : uid()
    seen.add(id)
    members.push({
      id,
      name: raw.name.trim(),
      order: typeof raw.order === 'number' ? raw.order : i + 1,
      color: typeof raw.color === 'string' ? raw.color : undefined,
      emoji: typeof raw.emoji === 'string' ? raw.emoji : undefined,
    })
  })
  members.sort((a, b) => a.order - b.order)
  members.forEach((m, i) => (m.order = i + 1))

  const ids = new Set(members.map((m) => m.id))
  const byDate = new Map<string, Purchase>()
  if (Array.isArray(input.purchases)) {
    for (const raw of input.purchases) {
      if (!isObj(raw) || !isDate(raw.date) || typeof raw.memberId !== 'string') continue
      // 삭제된 멤버의 과거 기록도 보존한다 (화면에서는 '탈퇴한 멤버'로 표시)
      byDate.set(raw.date, {
        date: raw.date,
        memberId: raw.memberId,
        ...(typeof raw.memo === 'string' && raw.memo ? { memo: raw.memo } : {}),
      })
    }
  }
  const absences: Absence[] = []
  if (Array.isArray(input.absences)) {
    for (const raw of input.absences) {
      if (!isObj(raw) || !isDate(raw.from) || !isDate(raw.to) || typeof raw.memberId !== 'string') continue
      if (!ids.has(raw.memberId)) continue
      const [from, to] = raw.from <= raw.to ? [raw.from, raw.to] : [raw.to, raw.from]
      absences.push({ id: typeof raw.id === 'string' && raw.id ? raw.id : uid(), memberId: raw.memberId, from, to })
    }
  }
  const skipDays = Array.isArray(input.skipDays) ? [...new Set(input.skipDays.filter(isDate))].sort() : []

  return {
    members,
    purchases: [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
    absences,
    skipDays,
  }
}

const KEY = 'coffee-duty:v1'

export async function loadInitialData(): Promise<AppData> {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return parseAppData(JSON.parse(raw))
  } catch {
    /* 깨진 저장값은 무시하고 초기 데이터로 */
  }
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data.json`, { cache: 'no-cache' })
    if (res.ok) return parseAppData(await res.json())
  } catch {
    /* 오프라인 등 */
  }
  return EMPTY_DATA
}

export function saveData(data: AppData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    /* 저장 공간 부족/차단 */
  }
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
