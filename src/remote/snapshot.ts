import type { GroupRows, PricesRow } from '../logic/remote-map'

/**
 * RPC get_group_snapshot 의 결과(jsonb) → 행 묶음. 서버 값을 그대로 믿지 않고 모양을 검사한다.
 * (잘못된 값이면 throw → 호출한 쪽은 캐시를 그대로 둔다)
 */
export class SnapshotError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const arr = (v: unknown, name: string): Record<string, unknown>[] => {
  if (!Array.isArray(v) || !v.every(isObj)) throw new SnapshotError(`${name} 모양이 달라요`)
  return v as Record<string, unknown>[]
}
const str = (v: unknown, name: string): string => {
  if (typeof v !== 'string') throw new SnapshotError(`${name}가 문자열이 아니에요`)
  return v
}
const num = (v: unknown, name: string): number => {
  if (typeof v !== 'number') throw new SnapshotError(`${name}가 숫자가 아니에요`)
  return v
}
const date = (v: unknown, name: string): string => {
  const s = str(v, name)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new SnapshotError(`${name} 날짜 형식이 달라요`)
  return s
}

/** 행 묶음과 서버의 변경 번호(rev). rev가 없으면(0004 이전 서버) null */
export function parseSnapshotFull(raw: unknown): { rows: GroupRows; rev: number | null } {
  const rows = parseSnapshot(raw)
  const rev = isObj(raw) && typeof raw.rev === 'number' ? raw.rev : null
  return { rows, rev }
}

export function parseSnapshot(raw: unknown): GroupRows {
  if (!isObj(raw)) throw new SnapshotError('스냅샷이 비어 있어요')
  const g = raw.group
  if (!isObj(g)) throw new SnapshotError('그룹 정보가 없어요')
  const config = g.config
  if (!isObj(config) || typeof config.fairness !== 'string') throw new SnapshotError('그룹 설정이 달라요')
  const gid = str(g.id, 'group.id')

  return {
    group: {
      id: gid,
      name: str(g.name, 'group.name'),
      emoji: str(g.emoji, 'group.emoji'),
      schedule: g.schedule as GroupRows['group']['schedule'],
      config: config as unknown as GroupRows['group']['config'],
    },
    members: arr(raw.members, 'members').map((m) => ({
      id: str(m.id, 'member.id'),
      group_id: gid,
      name: str(m.name, 'member.name'),
      sort: num(m.sort, 'member.sort'),
      color: typeof m.color === 'string' ? m.color : null,
      emoji: typeof m.emoji === 'string' ? m.emoji : null,
      payload: (isObj(m.payload) ? m.payload : {}) as GroupRows['members'][number]['payload'],
    })),
    records: arr(raw.records, 'records').map((r) => ({
      group_id: gid,
      date: date(r.date, 'record.date'),
      member_id: str(r.member_id, 'record.member_id'),
      memo: typeof r.memo === 'string' ? r.memo : null,
      payload: (isObj(r.payload) ? r.payload : {}) as GroupRows['records'][number]['payload'],
    })),
    absences: arr(raw.absences, 'absences').map((a) => ({
      id: str(a.id, 'absence.id'),
      group_id: gid,
      member_id: str(a.member_id, 'absence.member_id'),
      from_date: date(a.from_date, 'absence.from_date'),
      to_date: date(a.to_date, 'absence.to_date'),
      payload: {},
    })),
    skip_days: arr(raw.skip_days, 'skip_days').map((s) => ({ group_id: gid, date: date(s.date, 'skip_day.date') })),
    orders: arr(raw.orders, 'orders').map((o) => ({
      group_id: gid,
      date: date(o.date, 'order.date'),
      payload: (isObj(o.payload) ? o.payload : { items: [], updatedAt: 0 }) as GroupRows['orders'][number]['payload'],
    })),
    prices: isObj(raw.prices) ? { group_id: gid, payload: (isObj(raw.prices.payload) ? raw.prices.payload : {}) as PricesRow['payload'] } : null,
  }
}
