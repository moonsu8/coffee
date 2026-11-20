import type { DateStr, DayOrder, Member, Order, OrderItem } from '../types'
import { formatShort } from './dates'
import { findPreset, isNoDrink, normalizeTemp, orderKey, TEMP_LABEL } from './menu'
import { getNextBuyer, isAbsent, type BuyerContext } from './nextBuyer'

export interface OrderContext extends BuyerContext {
  orders: DayOrder[]
}

export type LineStatus = 'order' | 'skipped' | 'undecided'
export interface OrderLine {
  memberId: string
  status: LineStatus
  order?: Order // status가 'order'일 때
  edited: boolean // 오늘 따로 바꾼 값인지
}

const toOrder = (i: OrderItem): Order => ({
  menu: i.menu,
  temp: i.temp,
  ...(i.size ? { size: i.size } : {}),
  ...(i.shot ? { shot: i.shot } : {}),
  ...(i.memo ? { memo: i.memo } : {}),
})

function lineFrom(memberId: string, o: Order | undefined, edited: boolean, skipped = false): OrderLine {
  if (!o) return { memberId, status: 'undecided', edited }
  if (skipped || isNoDrink(o)) return { memberId, status: 'skipped', edited }
  return { memberId, status: 'order', order: o, edited }
}

/** 휴가가 아닌 멤버(멤버 순서대로)의 기본 메뉴로 만든 초안. 기본 메뉴가 없으면 '메뉴 미정' */
export function buildDraft(date: DateStr, ctx: OrderContext): OrderLine[] {
  return [...ctx.members]
    .sort((a, b) => a.order - b.order)
    .filter((m) => !isAbsent(m.id, date, ctx.absences))
    .map((m) => lineFrom(m.id, m.favorite, false))
}

/** 초안 위에 그날 저장된 변경(오늘만 바꾼 값)을 덮어쓴 최종 주문. 휴가자·삭제된 멤버의 저장값은 무시 */
export function resolveOrder(date: DateStr, ctx: OrderContext): OrderLine[] {
  const saved = ctx.orders.find((o) => o.date === date)
  return buildDraft(date, ctx).map((line) => {
    const item = saved?.items.find((i) => i.memberId === line.memberId)
    if (!item) return line
    const fromItem = lineFrom(line.memberId, toOrder(item), false, item.skipped)
    // 복사 시점에 굳힌 값처럼 기본 메뉴와 같은 내용이면 '오늘만 바꾼 값'이 아니다
    return { ...fromItem, edited: !sameLine(fromItem, line) }
  })
}

export function sameLine(a: OrderLine, b: OrderLine): boolean {
  if (a.status !== b.status) return false
  if (a.status !== 'order') return true
  return !!a.order && !!b.order && orderKey(a.order) === orderKey(b.order) && (a.order.memo ?? '') === (b.order.memo ?? '')
}

export interface AggregatedLine {
  key: string
  order: Order
  count: number
  memberIds: string[]
}

/** 같은 메뉴+온도+옵션끼리 묶어 개수 집계. 안 마심·메뉴 미정은 제외. 많은 순, 같으면 먼저 나온 순 */
export function aggregate(lines: OrderLine[]): AggregatedLine[] {
  const map = new Map<string, AggregatedLine>()
  for (const l of lines) {
    if (l.status !== 'order' || !l.order) continue
    const key = orderKey(l.order)
    const cur = map.get(key)
    if (cur) {
      cur.count++
      cur.memberIds.push(l.memberId)
    } else {
      map.set(key, {
        key,
        order: { ...l.order, temp: normalizeTemp(l.order.menu, l.order.temp), memo: undefined },
        count: 1,
        memberIds: [l.memberId],
      })
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
}

function optionText(o: Order, withTemp: boolean): string[] {
  const parts: string[] = []
  const preset = findPreset(o.menu)
  const temp = normalizeTemp(o.menu, o.temp)
  if (withTemp && !preset?.fixedTemp && temp !== (preset?.defaultTemp ?? 'ice')) {
    parts.push(TEMP_LABEL[temp] === '아이스' ? '아이스' : '따뜻')
  }
  if (o.size) parts.push(o.size)
  if (o.shot) parts.push('샷추가')
  if (o.memo) parts.push(o.memo)
  return parts
}

/** 집계 줄용 이름. 예: "아이스 아메리카노", "따뜻한 라떼" */
export function aggregateLabel(o: Order, opts = true): string {
  const preset = findPreset(o.menu)
  const temp = normalizeTemp(o.menu, o.temp)
  const base = preset?.short ?? o.menu
  const prefix = preset?.fixedTemp ? '' : `${TEMP_LABEL[temp]} `
  const extra = opts ? [o.size, o.shot ? '샷추가' : ''].filter(Boolean).join(', ') : ''
  return `${prefix}${base}${extra ? ` (${extra})` : ''}`
}

/** 개인별 줄용 줄임말. 예: "아아", "라떼(따뜻)", "티" */
export function compactLabel(o: Order): string {
  const preset = findPreset(o.menu)
  const temp = normalizeTemp(o.menu, o.temp)
  const name = temp === 'ice' && preset?.iceAlias ? preset.iceAlias : (preset?.short ?? o.menu)
  // 줄임말(아아)은 이미 온도를 담고 있으므로 괄호 생략
  const aliasUsed = temp === 'ice' && !!preset?.iceAlias
  const parts = optionText(o, !aliasUsed)
  return parts.length ? `${name}(${parts.join('·')})` : name
}

export function lineLabel(l: OrderLine): string {
  if (l.status === 'skipped') return '안 마심'
  if (l.status === 'undecided' || !l.order) return '메뉴 미정'
  return compactLabel(l.order)
}

export function countDrinks(lines: OrderLine[]): number {
  return lines.filter((l) => l.status === 'order').length
}

/** 오늘 당번 (이미 산 사람이 기록돼 있으면 그 사람) */
export function buyerOf(date: DateStr, ctx: OrderContext): Member | null {
  const bought = ctx.purchases.find((p) => p.date === date)
  if (bought) return ctx.members.find((m) => m.id === bought.memberId) ?? null
  return getNextBuyer(date, ctx)
}

/**
 * 단톡방 공유 텍스트
 *   ☕ 11/20(금) 커피 주문 · 당번 🐻 철수
 *   아이스 아메리카노 3 / 따뜻한 라떼 2
 *   ─ 철수 아아, 영희 라떼(따뜻), 민수 메뉴 미정
 *   바꿀 분만 답장 주세요!
 */
export function buildOrderText(
  date: DateStr,
  ctx: OrderContext,
  emojiOf: (m: Member) => string = () => '',
): string {
  const lines = resolveOrder(date, ctx)
  const name = (id: string) => ctx.members.find((m) => m.id === id)?.name ?? ''
  const buyer = buyerOf(date, ctx)
  const head = `☕ ${formatShort(date)} 커피 주문${buyer ? ` · 당번 ${[emojiOf(buyer), buyer.name].filter(Boolean).join(' ')}` : ''}`

  const agg = aggregate(lines)
  const aggText = agg.length ? agg.map((a) => `${aggregateLabel(a.order)} ${a.count}`).join(' / ') : '아직 정해진 주문이 없어요'
  const people = lines
    .filter((l) => l.status !== 'skipped')
    .map((l) => `${name(l.memberId)} ${lineLabel(l)}`)
    .join(', ')
  return [head, aggText, people ? `─ ${people}` : '', '바꿀 분만 답장 주세요!'].filter(Boolean).join('\n')
}

/** 복사(공유) 시점의 최종 주문을 그날 기록으로 굳히기 위한 아이템. 이후 기본 메뉴가 바뀌어도 그날 기록은 그대로 */
export function snapshotItems(lines: OrderLine[]): OrderItem[] {
  const items: OrderItem[] = []
  for (const l of lines) {
    if (l.status === 'order' && l.order) items.push({ ...l.order, memberId: l.memberId })
    else if (l.status === 'skipped') items.push({ memberId: l.memberId, menu: '안 마심', temp: 'ice', skipped: true })
  }
  return items
}
