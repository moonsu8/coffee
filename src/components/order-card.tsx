import { ChevronDown, ClipboardCopy } from 'lucide-react'
import { useRef, useState } from 'react'
import { copyText } from '@/lib/effects'
import { memberStyle } from '@/lib/members'
import { recordMetric } from '@/lib/metrics'
import { cn } from '@/lib/utils'
import { isNoDrink } from '@/logic/menu'
import {
  aggregate,
  aggregateLabel,
  buildDraft,
  buildOrderText,
  compactLabel,
  countDrinks,
  lineLabel,
  resolveOrder,
  sameLine,
  snapshotItems,
  type OrderLine,
} from '@/logic/order'
import { useStore } from '@/store/store'
import type { DateStr, DayOrder, Member } from '@/types'
import { Avatar } from './avatar'
import { Card, SectionTitle } from './common'
import { emptyFields, fieldsFromOrder, OrderFields, orderFromFields, type FieldsValue } from './order-fields'
import { useToast } from './toast'
import { Button } from './ui/button'
import { Sheet } from './ui/sheet'

/** 홈의 "오늘의 주문" 카드 */
export function OrderCard({ date }: { date: DateStr }) {
  const { data, memberById, snapshotOrder } = useStore()
  const toast = useToast()
  const [editing, setEditing] = useState<string | null>(null) // memberId
  const [fallback, setFallback] = useState<string | null>(null)

  const lines = resolveOrder(date, data)
  const agg = aggregate(lines)
  const drinks = countDrinks(lines)
  const undecided = lines.filter((l) => l.status === 'undecided').length

  const copy = async () => {
    const text = buildOrderText(date, data, (m) => memberStyle(m).emoji)
    snapshotOrder(date, snapshotItems(lines)) // 보낸 시점의 주문을 그날 기록으로 남김
    recordMetric('copy', date)
    if (await copyText(text)) toast({ message: '주문표를 복사했어요', duration: 2500 })
    else setFallback(text)
  }

  return (
    <Card className="mt-5">
      <SectionTitle right={<span className="text-sm font-semibold text-ink-2">{drinks}잔</span>}>오늘의 주문</SectionTitle>

      {agg.length > 0 ? (
        <ul className="space-y-2.5">
          {agg.map((a) => (
            <li key={a.key} className="flex items-center justify-between gap-3">
              <span className="text-[22px] leading-tight font-extrabold tracking-tight">{aggregateLabel(a.order)}</span>
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-caramel text-lg font-black text-on-caramel">
                {a.count}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="py-2 text-[15px] leading-relaxed text-ink-2">
          아직 정해진 메뉴가 없어요. 아래에서 이름을 눌러 메뉴를 정해 주세요.
        </p>
      )}
      {undecided > 0 && <p className="mt-2 text-sm font-semibold text-caramel-ink">메뉴 미정 {undecided}명</p>}

      <ul className="mt-4 divide-y divide-line border-t border-line">
        {lines.map((l) => {
          const m = memberById(l.memberId)
          return (
            <li key={l.memberId}>
              <button
                onClick={() => setEditing(l.memberId)}
                aria-label={`${m?.name} 메뉴 변경, 현재 ${lineLabel(l)}`}
                className="flex min-h-12 w-full items-center gap-3 py-1.5 text-left"
              >
                <Avatar member={m} size="xs" />
                <span className="w-16 shrink-0 truncate text-[15px] font-semibold">{m?.name}</span>
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-sm',
                    l.status === 'undecided' ? 'font-semibold text-caramel-ink' : 'text-ink-2',
                  )}
                >
                  {lineLabel(l)}
                </span>
                {l.edited && (
                  <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-ink-2">오늘만</span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

      <Button variant="dark" size="lg" className="mt-4 w-full" onClick={copy}>
        <ClipboardCopy size={19} /> 주문표 복사
      </Button>

      <MemberOrderSheet date={date} memberId={editing} line={lines.find((l) => l.memberId === editing)} onClose={() => setEditing(null)} />

      <Sheet open={fallback !== null} onOpenChange={(o) => !o && setFallback(null)} title="자동 복사가 안 됐어요" description="아래 글을 길게 눌러 직접 복사해 주세요">
        <textarea
          readOnly
          value={fallback ?? ''}
          rows={6}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="주문표 텍스트"
          className="w-full rounded-2xl border border-line bg-surface-2 p-4 text-base leading-relaxed"
        />
        <Button size="lg" className="mt-3 w-full" onClick={() => setFallback(null)}>
          닫기
        </Button>
      </Sheet>
    </Card>
  )
}

/** 멤버 한 명의 메뉴를 오늘만 바꾸는 바텀시트 (기본 메뉴는 체크했을 때만 바뀜) */
function MemberOrderSheet({
  date,
  memberId,
  line,
  onClose,
}: {
  date: DateStr
  memberId: string | null
  line?: OrderLine
  onClose: () => void
}) {
  // 닫히는 동안에도 내용을 유지
  const last = useRef<{ memberId: string; line?: OrderLine }>({ memberId: memberId ?? '', line })
  if (memberId) last.current = { memberId, line }
  const shown = last.current
  const { memberById } = useStore()
  const m = memberById(shown.memberId)

  return (
    <Sheet open={!!memberId} onOpenChange={(o) => !o && onClose()} title={m ? `${m.name}님 오늘 메뉴` : '오늘 메뉴'} description="오늘만 바뀌어요. 기본 메뉴는 그대로예요">
      {m && <SheetBody key={shown.memberId} date={date} member={m} line={shown.line} onClose={onClose} />}
    </Sheet>
  )
}

function SheetBody({ date, member, line, onClose }: { date: DateStr; member: Member; line?: OrderLine; onClose: () => void }) {
  const { data, saveOrderItem, resetOrderItem, updateMember } = useStore()
  const toast = useToast()
  const initial: FieldsValue =
    line?.status === 'order' ? fieldsFromOrder(line.order) : line?.status === 'skipped' ? { ...emptyFields, menu: '안 마심' } : emptyFields
  const [v, setV] = useState<FieldsValue>(initial)
  const [asDefault, setAsDefault] = useState(false)
  const order = orderFromFields(v)

  const save = () => {
    if (!order) return
    if (asDefault) {
      updateMember(member.id, { favorite: order })
      resetOrderItem(date, member.id) // 기본 메뉴가 곧 오늘 메뉴가 되므로 오늘만 값은 정리
      toast({ message: `${member.name}님 기본 메뉴를 바꿨어요`, duration: 3000 })
    } else {
      // 기본 메뉴와 같은 내용이면 '오늘만 바꾼 값'을 따로 남기지 않는다 (변경 횟수에도 넣지 않음)
      const draft = buildDraft(date, data).find((l) => l.memberId === member.id)
      const candidate: OrderLine = { memberId: member.id, status: isNoDrink(order) ? 'skipped' : 'order', order, edited: true }
      if (draft && sameLine(candidate, draft)) {
        resetOrderItem(date, member.id)
        toast({ message: '기본 메뉴와 같아서 그대로 뒀어요', duration: 3000 })
        onClose()
        return
      }
      const undo = saveOrderItem(date, { ...order, memberId: member.id, ...(isNoDrink(order) ? { skipped: true } : {}) })
      recordMetric('edit', date)
      toast({ message: `${member.name}님 오늘 메뉴를 바꿨어요`, actionLabel: '되돌리기', onAction: undo })
    }
    onClose()
  }

  return (
    <div className="space-y-5 pb-2">
      <OrderFields value={v} onChange={setV} customMenus={data.customMenus} idPrefix="today" />
      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl bg-surface-2 px-4">
        <input
          type="checkbox"
          checked={asDefault}
          onChange={(e) => setAsDefault(e.target.checked)}
          className="size-5 shrink-0 accent-[var(--caramel)]"
        />
        <span className="text-[15px] font-semibold">이걸 기본 메뉴로 저장</span>
      </label>
      <div className="flex gap-2">
        {line?.edited && (
          <Button
            variant="soft"
            size="lg"
            onClick={() => {
              const undo = resetOrderItem(date, member.id)
              toast({ message: '기본 메뉴로 되돌렸어요', actionLabel: '되돌리기', onAction: undo, duration: 4000 })
              onClose()
            }}
          >
            기본으로
          </Button>
        )}
        <Button size="lg" className="flex-1" disabled={!order} onClick={save}>
          저장
        </Button>
      </div>
    </div>
  )
}

/** 기록 화면: 그날 주문 내역(접기/펼치기) */
export function OrderHistory({ day }: { day: DayOrder }) {
  const { memberById } = useStore()
  const [open, setOpen] = useState(false)
  const drinks = day.items.filter((i) => !isNoDrink(i)).length
  if (day.items.length === 0) return null
  return (
    <div className="border-t border-line bg-surface">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between px-4 text-sm font-semibold text-ink-2"
      >
        주문 내역 {drinks}잔
        <ChevronDown size={18} className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul className="space-y-1.5 px-4 pb-3">
          {day.items.map((i) => (
            <li key={i.memberId} className="flex items-center gap-2.5 text-sm">
              <Avatar member={memberById(i.memberId)} size="xs" />
              <span className="w-16 shrink-0 truncate font-semibold">{memberById(i.memberId)?.name ?? '탈퇴한 멤버'}</span>
              <span className="text-ink-2">{isNoDrink(i) ? '안 마심' : compactLabel(i)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
