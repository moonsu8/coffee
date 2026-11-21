import {
  SCHEMA_VERSION,
  type AppData,
  type Absence,
  type DayOrder,
  type Member,
  type Order,
  type OrderItem,
  type PriceEntry,
  type PriceMode,
  type Pricing,
  type Group,
  type GroupConfig,
  type Purchase,
  type Settings,
  type Size,
  THEME_IDS,
  type ThemeId,
  DEFAULT_BRAND,
} from '../types'
import { COFFEE_GROUP_ID } from '../logic/groups'
import { normalizeSchedule } from '../logic/schedule'
import { NO_DRINK } from '../logic/menu'
import { uid } from './utils'

/** 앱보다 새로운 버전의 데이터. 읽으면 안 된다(덮어써서 잃을 수 있음) */
export class FutureVersionError extends Error {
  constructor(public version: number) {
    super('이 데이터는 더 새로운 버전의 앱에서 만들어졌어요. 앱을 최신으로 업데이트해 주세요.')
  }
}

type Raw = Record<string, unknown>
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const isDate = (v: unknown): v is string => typeof v === 'string' && DATE_RE.test(v)
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)

/* ───────── 버전 단계 (각 단계는 한 칸씩만 올린다) ───────── */

/** v1 → v2: 주문 기능 추가. 기존 필드는 건드리지 않고 새 필드만 채운다 */
function v1ToV2(d: Raw, now: number): Raw {
  return {
    ...d,
    schemaVersion: 2,
    orders: Array.isArray(d.orders) ? d.orders : [],
    customMenus: Array.isArray(d.customMenus) ? d.customMenus : [],
    updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : now,
  }
}

/**
 * v2 → v3: 그룹 도입. 기존 데이터 전부를 id가 고정된 "커피" 그룹 하나로 옮긴다.
 * 값은 건드리지 않고 자리만 바꾼다(members→members, purchases→records, 주문·가격표·설정→coffee).
 */
function v2ToV3(d: Raw): Raw {
  return {
    schemaVersion: 3,
    groups: [
      {
        id: COFFEE_GROUP_ID,
        name: '커피',
        template: 'coffee',
        emoji: '☕',
        members: d.members,
        records: d.purchases,
        absences: d.absences,
        skipDays: d.skipDays,
        coffee: { orders: d.orders, customMenus: d.customMenus, priceList: d.priceList, settings: d.settings },
      },
    ],
    updatedAt: d.updatedAt,
  }
}

/*
 * v3 → v4 단계에서 쓰는 설정 값. 템플릿 상수(logic/templates.ts)와 별개로 고정해 둔다:
 * 템플릿을 나중에 바꿔도 옛 데이터를 옮긴 결과가 달라지면 안 되기 때문이다.
 */
const V4_COFFEE_CONFIG: GroupConfig = {
  presetId: 'coffee',
  actionLabel: '샀어요',
  fairness: 'money',
  orders: true,
  memoPlaceholder: '예) 아아 6잔, 디저트 포함',
  shareFormat: '☕',
  themeId: 'coffee',
}
const V4_GENERAL_CONFIG: GroupConfig = {
  presetId: 'custom',
  actionLabel: '했어요',
  fairness: 'count',
  orders: false,
  memoPlaceholder: '예) 간단한 메모',
  shareFormat: '{emoji} {name}',
  themeId: 'coffee',
}

/**
 * v3 → v4: 그룹마다 요일(schedule)과 설정(config)을 채운다. 기존 그룹은 모두 평일.
 * 커피 템플릿 → 커피 설정, 일반 템플릿 → 순번만 쓰는 기본 설정. 멤버·기록·휴가 등 다른 값은 그대로 둔다.
 */
function v3ToV4(d: Raw): Raw {
  const groups = Array.isArray(d.groups) ? d.groups : []
  return {
    ...d,
    schemaVersion: 4,
    groups: groups.map((g) => {
      if (!isObj(g)) return g
      const { template, ...rest } = g
      return {
        ...rest,
        schedule: 'weekdays',
        config: template === 'coffee' ? { ...V4_COFFEE_CONFIG } : { ...V4_GENERAL_CONFIG },
      }
    }),
  }
}

const STEPS: Record<number, (d: Raw, now: number) => Raw> = { 1: v1ToV2, 2: v2ToV3, 3: v3ToV4 }

export function versionOf(input: unknown): number {
  return isObj(input) && typeof input.schemaVersion === 'number' ? input.schemaVersion : 1
}

/* ───────── 최신 구조 검증·정규화 ───────── */

function readOrder(raw: Raw): Order | undefined {
  const menu = str(raw.menu)
  if (!menu) return undefined
  const size = raw.size === 'S' || raw.size === 'M' || raw.size === 'L' ? (raw.size as Size) : undefined
  const shot = typeof raw.shot === 'number' && Number.isFinite(raw.shot) && raw.shot > 0 ? raw.shot : undefined
  const memo = str(raw.memo)
  return {
    menu,
    temp: raw.temp === 'hot' ? 'hot' : 'ice',
    ...(size ? { size } : {}),
    ...(shot ? { shot } : {}),
    ...(memo ? { memo } : {}),
  }
}

function readItem(raw: unknown): OrderItem | null {
  if (!isObj(raw) || typeof raw.memberId !== 'string') return null
  const skipped = raw.skipped === true
  const o = readOrder(raw) ?? (skipped ? { menu: NO_DRINK, temp: 'ice' as const } : undefined)
  return o ? { ...o, memberId: raw.memberId, ...(skipped ? { skipped: true } : {}) } : null
}

const money = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0
const temp = (v: unknown) => (v === 'hot' ? ('hot' as const) : ('ice' as const))
const sizeOf = (v: unknown): Size | undefined => (v === 'S' || v === 'M' || v === 'L' ? v : undefined)

/** 구매 금액. 형식이 틀린 값은 '금액 없음'으로 취급한다 (기록 자체는 보존) */
function readPricing(raw: unknown): Pricing | undefined {
  if (!isObj(raw) || !money(raw.total) || raw.total <= 0) return undefined
  if (raw.mode === 'detail' && Array.isArray(raw.lines)) {
    const lines = raw.lines.flatMap((l) => {
      if (!isObj(l) || typeof l.memberId !== 'string' || !str(l.menu) || !money(l.price)) return []
      const size = sizeOf(l.size)
      return [{ memberId: l.memberId, menu: str(l.menu)!, temp: temp(l.temp), ...(size ? { size } : {}), price: l.price }]
    })
    return lines.length ? { mode: 'detail', total: raw.total, lines } : undefined
  }
  if (raw.mode === 'simple' && Array.isArray(raw.participants)) {
    const participants = [...new Set(raw.participants.filter((x): x is string => typeof x === 'string'))]
    return participants.length ? { mode: 'simple', total: raw.total, participants } : undefined
  }
  return undefined
}

function readPriceList(v: unknown): PriceEntry[] {
  if (!Array.isArray(v)) return []
  const map = new Map<string, PriceEntry>()
  for (const raw of v) {
    if (!isObj(raw) || !str(raw.menu) || !money(raw.price)) continue
    const e: PriceEntry = {
      cafeBrandId: str(raw.cafeBrandId) ?? DEFAULT_BRAND,
      menu: str(raw.menu)!,
      temp: temp(raw.temp),
      size: typeof raw.size === 'string' ? raw.size : '',
      price: raw.price,
      updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
    }
    map.set([e.cafeBrandId, e.menu, e.temp, e.size].join('|'), e)
  }
  return [...map.values()]
}

function readSettings(v: unknown): Settings {
  const s = isObj(v) ? v : {}
  const modes: PriceMode[] = ['none', 'detail', 'simple']
  return {
    buyerRule: s.buyerRule === 'balance' ? 'balance' : 'count',
    defaultPriceMode: modes.includes(s.defaultPriceMode as PriceMode) ? (s.defaultPriceMode as PriceMode) : 'none',
    ...(isDate(s.balanceSince) ? { balanceSince: s.balanceSince } : {}),
  }
}

/** 그룹 안의 내용(v2까지의 데이터와 같은 모양)을 검증·정규화 */
interface Content {
  members: Member[]
  purchases: Purchase[]
  absences: Absence[]
  skipDays: string[]
  orders: DayOrder[]
  customMenus: string[]
  priceList: PriceEntry[]
  settings: Settings
}

function normalizeContent(d: Raw): Content {
  if (!Array.isArray(d.members)) throw new Error('올바른 커피 당번 데이터가 아니에요')

  const members: Member[] = []
  const seen = new Set<string>()
  d.members.forEach((raw, i) => {
    if (!isObj(raw) || !str(raw.name)) return
    const id = typeof raw.id === 'string' && raw.id && !seen.has(raw.id) ? raw.id : uid()
    seen.add(id)
    const fav = isObj(raw.favorite) ? readOrder(raw.favorite) : undefined
    members.push({
      id,
      name: str(raw.name)!,
      order: typeof raw.order === 'number' ? raw.order : i + 1, // 값은 그대로 보존 (재번호 매기지 않음)
      color: typeof raw.color === 'string' ? raw.color : undefined,
      emoji: typeof raw.emoji === 'string' ? raw.emoji : undefined,
      ...(fav ? { favorite: fav } : {}),
    })
  })
  members.sort((a, b) => a.order - b.order)

  const byDate = new Map<string, Purchase>()
  if (Array.isArray(d.purchases)) {
    for (const raw of d.purchases) {
      if (!isObj(raw) || !isDate(raw.date) || typeof raw.memberId !== 'string') continue
      // 탈퇴한 멤버의 과거 기록도 보존한다 (화면에서는 '탈퇴한 멤버')
      const memo = str(raw.memo)
      const pricing = readPricing(raw.pricing)
      byDate.set(raw.date, {
        date: raw.date,
        memberId: raw.memberId,
        ...(memo ? { memo } : {}),
        ...(pricing ? { pricing } : {}), // 없으면 '금액 없음' (기존 기록은 그대로)
      })
    }
  }

  const absences: Absence[] = []
  if (Array.isArray(d.absences)) {
    for (const raw of d.absences) {
      if (!isObj(raw) || !isDate(raw.from) || !isDate(raw.to) || typeof raw.memberId !== 'string') continue
      absences.push({ id: str(raw.id) ?? uid(), memberId: raw.memberId, from: raw.from, to: raw.to })
    }
  }

  const orders: DayOrder[] = []
  if (Array.isArray(d.orders)) {
    const seenDates = new Set<string>()
    for (const raw of d.orders) {
      if (!isObj(raw) || !isDate(raw.date) || !Array.isArray(raw.items) || seenDates.has(raw.date)) continue
      seenDates.add(raw.date)
      orders.push({
        date: raw.date,
        items: raw.items.map(readItem).filter((i): i is OrderItem => i !== null),
        updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
      })
    }
    orders.sort((a, b) => (a.date < b.date ? -1 : 1))
  }

  const customMenus = Array.isArray(d.customMenus)
    ? [...new Set(d.customMenus.map(str).filter((m): m is string => !!m))]
    : []

  return {
    members,
    purchases: [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
    absences,
    skipDays: Array.isArray(d.skipDays) ? [...new Set(d.skipDays.filter(isDate))].sort() : [],
    orders,
    customMenus,
    priceList: readPriceList(d.priceList),
    settings: readSettings(d.settings),
  }
}

function readConfig(v: unknown): GroupConfig {
  const c = isObj(v) ? v : {}
  // 알 수 없는 값은 순번만 쓰는 기본 설정으로 (금액·주문 기능을 잘못 켜지 않도록)
  const fairness = c.fairness === 'money' ? 'money' : 'count'
  return {
    presetId: str(c.presetId) ?? 'custom',
    actionLabel: str(c.actionLabel) ?? '했어요',
    fairness,
    orders: fairness === 'money' && c.orders === true,
    memoPlaceholder: str(c.memoPlaceholder) ?? '예) 간단한 메모',
    shareFormat: str(c.shareFormat) ?? '{emoji} {name}',
    themeId: (THEME_IDS as readonly unknown[]).includes(c.themeId) ? (c.themeId as ThemeId) : 'coffee',
  }
}

function normalizeGroup(raw: unknown, usedIds: Set<string>): Group | null {
  if (!isObj(raw)) return null
  const config = readConfig(raw.config)
  const money = config.fairness === 'money'
  const id = typeof raw.id === 'string' && raw.id && !usedIds.has(raw.id) ? raw.id : uid()
  usedIds.add(id)
  const coffee = isObj(raw.coffee) ? raw.coffee : {}
  const c = normalizeContent({
    members: Array.isArray(raw.members) ? raw.members : [],
    purchases: raw.records,
    absences: raw.absences,
    skipDays: raw.skipDays,
    ...coffee,
  })
  return {
    id,
    name: str(raw.name) ?? '그룹',
    emoji: typeof raw.emoji === 'string' && raw.emoji ? raw.emoji : '✨',
    config,
    schedule: normalizeSchedule(raw.schedule),
    members: c.members,
    records: c.purchases,
    absences: c.absences,
    skipDays: c.skipDays,
    ...(money
      ? { coffee: { orders: c.orders, customMenus: c.customMenus, priceList: c.priceList, settings: c.settings } }
      : {}),
  }
}

function normalizeRoot(d: Raw): AppData {
  if (!Array.isArray(d.groups)) throw new Error('올바른 커피 당번 데이터가 아니에요')
  const used = new Set<string>()
  const groups = d.groups.map((g) => normalizeGroup(g, used)).filter((g): g is Group => g !== null)
  if (groups.length === 0) throw new Error('올바른 커피 당번 데이터가 아니에요')
  return { schemaVersion: SCHEMA_VERSION, groups, updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : 0 }
}

/**
 * 어떤 버전의 데이터든(localStorage·내보낸 JSON·data.json) 최신 구조로 바꾼다.
 * - 구버전: 단계별로 올리며 기존 값은 보존
 * - 미래 버전: FutureVersionError (읽지 않는다)
 * - 형식이 아예 틀리면 Error
 */
export function migrate(input: unknown, now: number = Date.now()): AppData {
  if (!isObj(input)) throw new Error('올바른 커피 당번 데이터가 아니에요')
  let v = versionOf(input)
  if (!Number.isInteger(v) || v < 1) v = 1
  // 미래 버전 검사를 모양 검사보다 먼저 한다 (모양이 다른 새 버전 데이터를 '깨진 데이터'로 오해해 덮어쓰지 않도록)
  if (v > SCHEMA_VERSION) throw new FutureVersionError(v)
  if (v < 3 ? !Array.isArray(input.members) : !Array.isArray(input.groups)) throw new Error('올바른 커피 당번 데이터가 아니에요')
  let cur: Raw = input
  while (v < SCHEMA_VERSION) {
    cur = STEPS[v](cur, now)
    v++
  }
  return normalizeRoot(cur)
}

/**
 * 저장·내보내기용 직렬화. 최상위에 빈 `members` 배열을 함께 남긴다.
 * 이미 배포된 옛(v2) 앱은 '모양 검사(members 배열) → 버전 검사' 순서라서, 이 표식이 없으면 v3 데이터를
 * 깨진 데이터로 보고 초기 데이터로 덮어쓴다. 표식이 있으면 '앱을 업데이트해 주세요' 화면만 띄우고 저장하지 않는다.
 * (migrate는 v3에서 이 필드를 읽지 않는다)
 */
export function serialize(data: AppData, space?: number): string {
  const { schemaVersion, groups, updatedAt } = data
  return JSON.stringify({ schemaVersion, members: [], groups, updatedAt }, null, space)
}
