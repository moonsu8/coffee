import { useRef, useState } from 'react'
import { diffPrices, type PriceInput } from '@/logic/fairness'
import { isAbsent } from '@/logic/nextBuyer'
import { resolveOrder } from '@/logic/order'
import { buildPricing, initPricingForm, priceInputsOf, type LineBase } from '@/logic/pricing-form'
import { useStore } from '@/store/store'
import type { DateStr, Pricing } from '@/types'
import { PricingFields } from './pricing-fields'
import { Button } from './ui/button'
import { Sheet, SheetFooter } from './ui/sheet'

interface Props {
  open: boolean
  memberId: string | null // 결제한 사람
  date: DateStr
  onClose: () => void
  /** pricing이 없으면 금액 없음. entries는 가격표에 저장할 항목 */
  onConfirm: (memberId: string, pricing: Pricing | undefined, entries: PriceInput[]) => void
}

/** [샀어요] 금액 시트: 메뉴별 가격 + 자동 합계 + 영수증 총액 */
export function PricePurchaseSheet({ open, memberId, date, onClose, onConfirm }: Props) {
  const { memberById } = useStore()
  const last = useRef(memberId ?? '')
  if (memberId) last.current = memberId
  const buyer = memberById(last.current)
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title={buyer ? `${buyer.name}님이 샀어요` : '구매 금액'} description="금액을 적어 두면 공평하게 정산할 수 있어요">
      <Body memberId={last.current} date={date} onConfirm={onConfirm} />
    </Sheet>
  )
}

function Body({ memberId, date, onConfirm }: { memberId: string; date: DateStr; onConfirm: Props['onConfirm'] }) {
  const { data } = useStore()
  // 오늘 주문에서 실제로 마시는 사람만 가격 입력 대상
  const lines: LineBase[] = resolveOrder(date, data)
    .filter((l) => l.status === 'order' && l.order)
    .map((l) => ({ memberId: l.memberId, order: l.order! }))
  const participantsDefault = lines.length
    ? lines.map((l) => l.memberId)
    : data.members.filter((m) => !isAbsent(m.id, date, data.absences)).map((m) => m.id)

  const [form, setForm] = useState(() =>
    initPricingForm({ settings: data.settings, lines, participantsDefault, priceList: data.priceList }),
  )
  const b = buildPricing(form, lines)

  return (
    <div className="space-y-4 pb-2">
      <PricingFields form={form} onChange={setForm} lines={lines} idPrefix="buy" />
      <SheetFooter>
      <Button
        size="lg"
        className="w-full"
        disabled={!b.ok}
        onClick={() => onConfirm(memberId, b.pricing, form.saveToList ? diffPrices(data.priceList, priceInputsOf(form, lines)) : [])}
      >
        기록하기
      </Button>
      </SheetFooter>
    </div>
  )
}
