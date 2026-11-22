import type { Absence, DateStr, DayOrder, Group, GroupConfig, Member, Order, OrderItem, PriceEntry, Pricing, Purchase, Schedule, Settings } from '../types'

/**
 * 서버(Supabase) 행 ↔ 앱의 `Group` 변환. 순수 함수만 있고 네트워크는 쓰지 않는다.
 *
 * 설계
 *  - 키·권한에 필요한 값(id, date, member_id …)은 열로, 앱이 해석하는 값(금액·주문·가격표·기본 메뉴)은 `payload`(jsonb)로 둔다.
 *  - payload를 만들고 읽는 일은 `payloadCodec` 한 곳에서만 한다. 지금은 평문(JSON 그대로)이고,
 *    나중에 종단간 암호화(B안)로 바꿀 때는 여기만 암호문으로 바꾸면 된다.
 *  - 스토어의 변경 함수(GroupView → GroupView)는 그대로 쓴다. 변경 전/후 `Group`을 `diffGroups`로 비교해
 *    서버에 쓸 작업 목록(RemoteOp)을 만든다.
 */

/* ───────── payload 코덱 (B안 전환 지점) ───────── */

export const payloadCodec = {
  /** 앱 값 → 서버에 저장할 payload. undefined 필드는 JSON 직렬화에서 사라진다 */
  encode<T>(value: T): T {
    return JSON.parse(JSON.stringify(value ?? {})) as T
  },
  /** 서버 payload → 앱 값 */
  decode<T>(raw: unknown, fallback: T): T {
    return raw && typeof raw === 'object' ? (raw as T) : fallback
  },
}

/* ───────── 행 모양 (supabase/migrations/0001_init.sql 과 같다) ───────── */

export interface GroupRow {
  id: string
  name: string
  emoji: string
  schedule: Schedule
  config: GroupConfig
}
export interface MemberRow {
  id: string
  group_id: string
  name: string
  sort: number
  color: string | null
  emoji: string | null
  payload: { favorite?: Order }
}
export interface RecordRow {
  group_id: string
  date: DateStr
  member_id: string
  memo: string | null
  payload: { pricing?: Pricing }
}
export interface AbsenceRow {
  id: string
  group_id: string
  member_id: string
  from_date: DateStr
  to_date: DateStr
  payload: Record<string, never>
}
export interface SkipDayRow {
  group_id: string
  date: DateStr
}
export interface OrderRow {
  group_id: string
  date: DateStr
  payload: { items: OrderItem[]; updatedAt: number }
}
export interface PricesRow {
  group_id: string
  payload: { customMenus: string[]; priceList: PriceEntry[]; settings: Settings }
}

export interface GroupRows {
  group: GroupRow
  members: MemberRow[]
  records: RecordRow[]
  absences: AbsenceRow[]
  skip_days: SkipDayRow[]
  orders: OrderRow[]
  prices: PricesRow | null
}

const DEFAULT_SETTINGS: Settings = { buyerRule: 'count', defaultPriceMode: 'none' }

/* ───────── Group → 행 ───────── */

export function groupToRows(g: Group): GroupRows {
  const gid = g.id
  return {
    group: { id: gid, name: g.name, emoji: g.emoji, schedule: payloadCodec.encode(g.schedule), config: payloadCodec.encode(g.config) },
    members: g.members.map((m) => ({
      id: m.id,
      group_id: gid,
      name: m.name,
      sort: m.order,
      color: m.color ?? null,
      emoji: m.emoji ?? null,
      payload: payloadCodec.encode(m.favorite ? { favorite: m.favorite } : {}),
    })),
    records: g.records.map((r) => ({
      group_id: gid,
      date: r.date,
      member_id: r.memberId,
      memo: r.memo ?? null,
      payload: payloadCodec.encode(r.pricing ? { pricing: r.pricing } : {}),
    })),
    absences: g.absences.map((a) => ({ id: a.id, group_id: gid, member_id: a.memberId, from_date: a.from, to_date: a.to, payload: {} })),
    skip_days: g.skipDays.map((date) => ({ group_id: gid, date })),
    orders: (g.coffee?.orders ?? []).map((o) => ({ group_id: gid, date: o.date, payload: payloadCodec.encode({ items: o.items, updatedAt: o.updatedAt }) })),
    prices: g.coffee
      ? {
          group_id: gid,
          payload: payloadCodec.encode({ customMenus: g.coffee.customMenus, priceList: g.coffee.priceList, settings: g.coffee.settings }),
        }
      : null,
  }
}

/* ───────── 행 → Group ───────── */

const byDate = <T extends { date: string }>(a: T, b: T) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)

export function rowsToGroup(rows: GroupRows): Group {
  const members: Member[] = [...rows.members]
    .sort((a, b) => a.sort - b.sort || (a.id < b.id ? -1 : 1))
    .map((r) => {
      const payload = payloadCodec.decode<MemberRow['payload']>(r.payload, {})
      const m: Member = { id: r.id, name: r.name, order: r.sort }
      if (r.color) m.color = r.color
      if (r.emoji) m.emoji = r.emoji
      if (payload.favorite) m.favorite = payload.favorite
      return m
    })
  const records: Purchase[] = [...rows.records].sort(byDate).map((r) => {
    const payload = payloadCodec.decode<RecordRow['payload']>(r.payload, {})
    const p: Purchase = { date: r.date, memberId: r.member_id }
    if (r.memo) p.memo = r.memo
    if (payload.pricing) p.pricing = payload.pricing
    return p
  })
  const absences: Absence[] = [...rows.absences]
    .sort((a, b) => (a.from_date < b.from_date ? -1 : a.from_date > b.from_date ? 1 : a.id < b.id ? -1 : 1))
    .map((r) => ({ id: r.id, memberId: r.member_id, from: r.from_date, to: r.to_date }))
  const skipDays = rows.skip_days.map((r) => r.date).sort()

  const g: Group = {
    id: rows.group.id,
    name: rows.group.name,
    emoji: rows.group.emoji,
    config: rows.group.config,
    schedule: rows.group.schedule,
    members,
    records,
    absences,
    skipDays,
  }
  if (rows.group.config.fairness === 'money') {
    const prices = rows.prices ? payloadCodec.decode<PricesRow['payload']>(rows.prices.payload, {} as PricesRow['payload']) : null
    const orders: DayOrder[] = [...rows.orders].sort(byDate).map((r) => {
      const p = payloadCodec.decode<OrderRow['payload']>(r.payload, { items: [], updatedAt: 0 })
      return { date: r.date, items: p.items ?? [], updatedAt: p.updatedAt ?? 0 }
    })
    g.coffee = {
      orders,
      customMenus: prices?.customMenus ?? [],
      priceList: prices?.priceList ?? [],
      settings: prices?.settings ?? { ...DEFAULT_SETTINGS },
    }
  }
  return g
}

/* ───────── 기기 → 서버 옮기기 (RPC import_group 입력) ───────── */

/** 그룹 안의 모든 멤버 id(멤버 목록, 기록, 금액 줄, 휴가, 주문)를 바꾼다. 같은 id는 같은 값으로 바뀐다 */
export function remapMemberIds(g: Group, map: (id: string) => string): Group {
  const f = (id: string) => map(id)
  const pricing = (p: Pricing | undefined): Pricing | undefined =>
    p && {
      ...p,
      lines: p.lines?.map((l) => ({ ...l, memberId: f(l.memberId) })),
      participants: p.participants?.map(f),
    }
  const out: Group = {
    ...g,
    members: g.members.map((m) => ({ ...m, id: f(m.id) })),
    records: g.records.map((r) => {
      const next: Purchase = { ...r, memberId: f(r.memberId) }
      const pr = pricing(r.pricing)
      if (pr) next.pricing = pr
      return next
    }),
    absences: g.absences.map((a) => ({ ...a, memberId: f(a.memberId) })),
  }
  if (g.coffee) {
    out.coffee = { ...g.coffee, orders: g.coffee.orders.map((o) => ({ ...o, items: o.items.map((i) => ({ ...i, memberId: f(i.memberId) })) })) }
  }
  return out
}

export interface ImportPayload {
  import_key: string
  name: string
  emoji: string
  schedule: Schedule
  config: GroupConfig
  members: { ref: string; name: string; sort: number; color: string | null; emoji: string | null; payload: MemberRow['payload'] }[]
  records: { date: DateStr; member_ref: string; memo: string | null; payload: RecordRow['payload'] }[]
  absences: { member_ref: string; from: DateStr; to: DateStr; payload: object }[]
  skip_days: DateStr[]
  orders: { date: DateStr; payload: OrderRow['payload'] }[]
  prices?: { payload: PricesRow['payload'] }
}

/**
 * 기기의 그룹 → import_group 입력 + "옮긴 뒤 서버에서 읽었을 때 기대하는 그룹".
 * 멤버 id는 기기용(짧은 문자열)이라 서버용 uuid로 모두 바꾼다(금액·주문 안의 참조까지 함께). 서버는 uuid인 ref를 그대로 id로 쓴다(0002).
 * `idMap`을 넘기면 이미 정한 id를 그대로 쓴다(재시도해도 같은 payload가 되도록). `uuid`는 테스트에서 고정값을 넣기 위한 주입 지점.
 */
export interface ImportPlan {
  payload: ImportPayload
  /** 서버에서 다시 읽었을 때 같아야 하는 그룹 (멤버 id는 uuid로 바뀐 상태, 그룹 id와 휴가 id는 서버가 정하므로 비교에서 뺀다) */
  expected: Group
  /** 기기 멤버 id → 서버 uuid (재시도용으로 저장해 둔다) */
  idMap: Record<string, string>
}

export function planImport(g: Group, importKey: string, opts: { uuid?: () => string; idMap?: Record<string, string> } = {}): ImportPlan {
  const uuid = opts.uuid ?? (() => crypto.randomUUID())
  const ids = new Map<string, string>(Object.entries(opts.idMap ?? {}))
  const mapId = (id: string) => {
    let v = ids.get(id)
    if (!v) ids.set(id, (v = uuid()))
    return v
  }
  const remapped = remapMemberIds(g, mapId)
  const rows = groupToRows(remapped)
  const payload: ImportPayload = {
    import_key: importKey,
    name: rows.group.name,
    emoji: rows.group.emoji,
    schedule: rows.group.schedule,
    config: rows.group.config,
    members: rows.members.map((m) => ({ ref: m.id, name: m.name, sort: m.sort, color: m.color, emoji: m.emoji, payload: m.payload })),
    records: rows.records.map((r) => ({ date: r.date, member_ref: r.member_id, memo: r.memo, payload: r.payload })),
    absences: rows.absences.map((a) => ({ member_ref: a.member_id, from: a.from_date, to: a.to_date, payload: a.payload })),
    skip_days: rows.skip_days.map((s) => s.date),
    orders: rows.orders.map((o) => ({ date: o.date, payload: o.payload })),
    ...(rows.prices ? { prices: { payload: rows.prices.payload } } : {}),
  }
  return { payload, expected: remapped, idMap: Object.fromEntries(ids) }
}

/** (호환) payload만 필요할 때 */
export function groupToImport(g: Group, importKey: string, uuid: () => string = () => crypto.randomUUID()): ImportPayload {
  return planImport(g, importKey, { uuid }).payload
}

/**
 * 옮긴 결과 비교: 서버에서 읽은 그룹이 기대한 그룹과 같은 내용인지. 다른 부분의 이름 목록을 돌려준다(같으면 빈 배열).
 * 그룹 id와 휴가 id는 서버가 새로 정하므로 비교하지 않는다.
 */
export function diffContent(actual: Group, expected: Group): string[] {
  const norm = (g: Group) => ({ ...g, id: '-', absences: g.absences.map((a) => ({ ...a, id: '-' })).sort((x, y) => (x.from + x.to + x.memberId < y.from + y.to + y.memberId ? -1 : 1)) })
  const a = norm(actual) as unknown as Record<string, unknown>
  const e = norm(expected) as unknown as Record<string, unknown>
  const keys = new Set([...Object.keys(a), ...Object.keys(e)])
  return [...keys].filter((k) => stable(a[k]) !== stable(e[k])).sort()
}

/* ───────── 변경 비교 (스토어의 변경 → 서버 쓰기 목록) ───────── */

export type RowTable = 'members' | 'records' | 'absences' | 'skip_days' | 'orders'
export type RemoteOp =
  | { kind: 'group'; id: string; patch: Partial<Pick<GroupRow, 'name' | 'emoji' | 'schedule' | 'config'>> }
  | { kind: 'upsert'; table: 'members'; row: MemberRow }
  | { kind: 'upsert'; table: 'records'; row: RecordRow }
  | { kind: 'upsert'; table: 'absences'; row: AbsenceRow }
  | { kind: 'upsert'; table: 'skip_days'; row: SkipDayRow }
  | { kind: 'upsert'; table: 'orders'; row: OrderRow }
  | { kind: 'upsert'; table: 'prices'; row: PricesRow }
  | { kind: 'delete'; table: RowTable; groupId: string; key: string } // key: members/absences = id, 나머지 = date
  | { kind: 'delete'; table: 'prices'; groupId: string; key: '' }

/** 키 순서와 무관한 비교용 문자열 */
function stable(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : 1)))
      : val,
  )
}

function diffTable<R>(before: R[], after: R[], keyOf: (r: R) => string): { upserts: R[]; deletes: string[] } {
  const b = new Map(before.map((r) => [keyOf(r), stable(r)]))
  const a = new Map(after.map((r) => [keyOf(r), r]))
  const upserts = after.filter((r) => b.get(keyOf(r)) !== stable(r))
  const deletes = [...b.keys()].filter((k) => !a.has(k))
  return { upserts, deletes }
}

/** 같은 그룹의 변경 전/후를 비교해 서버에 보낼 작업을 만든다. 달라진 것이 없으면 빈 목록 */
export function diffGroups(before: Group, after: Group): RemoteOp[] {
  if (before.id !== after.id) throw new Error('diffGroups: 서로 다른 그룹이에요')
  const b = groupToRows(before)
  const a = groupToRows(after)
  const ops: RemoteOp[] = []

  const patch: Extract<RemoteOp, { kind: 'group' }>['patch'] = {}
  if (b.group.name !== a.group.name) patch.name = a.group.name
  if (b.group.emoji !== a.group.emoji) patch.emoji = a.group.emoji
  if (stable(b.group.schedule) !== stable(a.group.schedule)) patch.schedule = a.group.schedule
  if (stable(b.group.config) !== stable(a.group.config)) patch.config = a.group.config
  if (Object.keys(patch).length) ops.push({ kind: 'group', id: a.group.id, patch })

  const gid = a.group.id
  const m = diffTable(b.members, a.members, (r) => r.id)
  m.upserts.forEach((row) => ops.push({ kind: 'upsert', table: 'members', row }))
  m.deletes.forEach((key) => ops.push({ kind: 'delete', table: 'members', groupId: gid, key }))
  const r = diffTable(b.records, a.records, (x) => x.date)
  r.upserts.forEach((row) => ops.push({ kind: 'upsert', table: 'records', row }))
  r.deletes.forEach((key) => ops.push({ kind: 'delete', table: 'records', groupId: gid, key }))
  const ab = diffTable(b.absences, a.absences, (x) => x.id)
  ab.upserts.forEach((row) => ops.push({ kind: 'upsert', table: 'absences', row }))
  ab.deletes.forEach((key) => ops.push({ kind: 'delete', table: 'absences', groupId: gid, key }))
  const s = diffTable(b.skip_days, a.skip_days, (x) => x.date)
  s.upserts.forEach((row) => ops.push({ kind: 'upsert', table: 'skip_days', row }))
  s.deletes.forEach((key) => ops.push({ kind: 'delete', table: 'skip_days', groupId: gid, key }))
  const o = diffTable(b.orders, a.orders, (x) => x.date)
  o.upserts.forEach((row) => ops.push({ kind: 'upsert', table: 'orders', row }))
  o.deletes.forEach((key) => ops.push({ kind: 'delete', table: 'orders', groupId: gid, key }))

  if (a.prices && stable(a.prices) !== stable(b.prices)) ops.push({ kind: 'upsert', table: 'prices', row: a.prices })
  else if (!a.prices && b.prices) ops.push({ kind: 'delete', table: 'prices', groupId: gid, key: '' })
  return ops
}

/** 작업 목록을 행 묶음에 적용한다 (서버가 하는 일을 흉내 내는 순수 함수: 테스트와 낙관적 갱신용) */
export function applyOps(rows: GroupRows, ops: RemoteOp[]): GroupRows {
  const next: GroupRows = {
    group: { ...rows.group },
    members: [...rows.members],
    records: [...rows.records],
    absences: [...rows.absences],
    skip_days: [...rows.skip_days],
    orders: [...rows.orders],
    prices: rows.prices,
  }
  const put = <R>(list: R[], row: R, same: (x: R) => boolean) => {
    const i = list.findIndex(same)
    if (i >= 0) list[i] = row
    else list.push(row)
  }
  for (const op of ops) {
    if (op.kind === 'group') {
      next.group = { ...next.group, ...op.patch }
    } else if (op.kind === 'upsert') {
      switch (op.table) {
        case 'members': put(next.members, op.row, (x) => x.id === op.row.id); break
        case 'records': put(next.records, op.row, (x) => x.date === op.row.date); break
        case 'absences': put(next.absences, op.row, (x) => x.id === op.row.id); break
        case 'skip_days': put(next.skip_days, op.row, (x) => x.date === op.row.date); break
        case 'orders': put(next.orders, op.row, (x) => x.date === op.row.date); break
        case 'prices': next.prices = op.row; break
      }
    } else {
      switch (op.table) {
        case 'members': next.members = next.members.filter((x) => x.id !== op.key); break
        case 'records': next.records = next.records.filter((x) => x.date !== op.key); break
        case 'absences': next.absences = next.absences.filter((x) => x.id !== op.key); break
        case 'skip_days': next.skip_days = next.skip_days.filter((x) => x.date !== op.key); break
        case 'orders': next.orders = next.orders.filter((x) => x.date !== op.key); break
        case 'prices': next.prices = null; break
      }
    }
  }
  return next
}
