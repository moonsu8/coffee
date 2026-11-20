import { Info } from 'lucide-react'
import { signedWon, won } from '@/lib/format'
import { cn } from '@/lib/utils'
import { allowedModes, diffPrices, lookupPrice } from '@/logic/fairness'
import { buildPricing, priceInputsOf, type LineBase, type PricingForm } from '@/logic/pricing-form'
import { compactLabel } from '@/logic/order'
import { useStore } from '@/store/store'
import type { PriceMode } from '@/types'
import { Avatar } from './avatar'
import { Segmented } from './common'
import { NumberInput } from './number-input'

const MODE_LABEL: Record<PriceMode, string> = { detail: '상세', simple: '간단', none: '금액 없음' }

interface Props {
  form: PricingForm
  onChange: (f: PricingForm) => void
  lines: LineBase[] // 상세 모드에서 가격을 입력할 줄
  idPrefix: string
  /** 지난 기록 편집처럼 차액 기준에서도 '금액 없음'을 허용해야 하는 곳 */
  allowNone?: boolean
}

/**
 * 금액 입력: 상세(메뉴별) / 간단(총액만) / 금액 없음.
 * 차액 기준이면 '금액 없음' 선택지가 아예 없다.
 */
export function PricingFields({ form, onChange, lines, idPrefix, allowNone }: Props) {
  const { data, memberById } = useStore()
  const rule = data.settings.buyerRule
  const set = (p: Partial<PricingForm>) => onChange({ ...form, ...p })
  const b = buildPricing(form, lines)

  const modes = (allowNone ? (['detail', 'simple', 'none'] as PriceMode[]) : allowedModes(rule)).filter((m) => m !== 'detail' || lines.length > 0 || form.mode === 'detail')
  const candidates = diffPrices(data.priceList, priceInputsOf(form, lines))
  const diff = b.total - b.sum

  return (
    <div className="space-y-4">
      <Segmented<PriceMode>
        id={`${idPrefix}-mode`}
        value={form.mode}
        onChange={(mode) => set({ mode })}
        options={modes.map((m) => ({ value: m, label: MODE_LABEL[m] }))}
      />

      {form.mode === 'detail' && (
        <>
          <ul className="space-y-2">
            {lines.map((l) => {
              const m = memberById(l.memberId)
              const listed = lookupPrice(data.priceList, l.order)
              const fromList = listed !== undefined && form.prices[l.memberId] === String(listed)
              return (
                <li key={l.memberId} className="flex items-center gap-2.5">
                  <Avatar member={m} size="xs" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">{m?.name ?? '탈퇴한 멤버'}</p>
                    <p className="truncate text-xs text-ink-2">
                      {compactLabel(l.order)}
                      {fromList && ' · 가격표'}
                    </p>
                  </div>
                  <NumberInput
                    className="w-[132px] shrink-0"
                    label={`${m?.name ?? ''} 메뉴 가격`}
                    value={form.prices[l.memberId] ?? ''}
                    onChange={(v) => set({ prices: { ...form.prices, [l.memberId]: v } })}
                  />
                </li>
              )
            })}
          </ul>

          <div className="space-y-2 rounded-2xl bg-surface-2 p-3.5">
            <div className="flex min-h-9 items-center justify-between text-[15px]">
              <span className="text-ink-2">메뉴 합계</span>
              <span className="font-bold">{won(b.sum)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <label htmlFor={`${idPrefix}-total`} className="text-[15px] font-semibold">
                영수증 총액
              </label>
              <NumberInput
                id={`${idPrefix}-total`}
                className="w-[160px]"
                label="영수증 총액"
                value={form.totalTouched && form.total !== '' ? form.total : b.sum ? String(b.sum) : ''}
                onChange={(v) => set({ total: v, totalTouched: true })}
              />
            </div>
            {diff !== 0 && b.total > 0 && (
              <p className="flex items-start gap-1.5 text-[13px] leading-snug text-ink-2">
                <Info size={15} className="mt-0.5 shrink-0" />
                합계와 {signedWon(diff)} 차이예요. 메뉴 가격 비율대로 나눠 계산해요.
              </p>
            )}
          </div>

          {candidates.length > 0 && (
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl bg-surface-2 px-4">
              <input
                type="checkbox"
                checked={form.saveToList}
                onChange={(e) => set({ saveToList: e.target.checked })}
                className="size-5 shrink-0 accent-[var(--caramel)]"
              />
              <span className="text-[15px] font-semibold">가격표에도 저장 ({candidates.length}개)</span>
            </label>
          )}
          {b.missing > 0 && <p className="text-[13px] font-semibold text-caramel-ink">가격이 빈 메뉴 {b.missing}개를 채워 주세요.</p>}
        </>
      )}

      {form.mode === 'simple' && (
        <>
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 p-3.5">
            <label htmlFor={`${idPrefix}-simple-total`} className="text-[15px] font-semibold">
              영수증 총액
            </label>
            <NumberInput
              id={`${idPrefix}-simple-total`}
              className="w-[160px]"
              label="영수증 총액"
              value={form.total}
              onChange={(v) => set({ total: v, totalTouched: true })}
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-ink-2">마신 사람 (총액을 똑같이 나눠요)</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="마신 사람">
              {data.members.map((m) => {
                const on = form.participants.includes(m.id)
                return (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      set({ participants: on ? form.participants.filter((x) => x !== m.id) : [...form.participants, m.id] })
                    }
                    className={cn(
                      'flex min-h-11 items-center gap-1.5 rounded-full py-1 pr-3.5 pl-1.5 text-[15px] font-semibold transition-colors',
                      on ? 'bg-caramel text-on-caramel' : 'bg-surface-2 text-ink-2',
                    )}
                  >
                    <Avatar member={m} size="xs" />
                    {m.name}
                  </button>
                )
              })}
            </div>
          </div>
          {b.total > 0 && form.participants.length > 0 && (
            <p className="text-[13px] text-ink-2">
              {form.participants.length}명 · 1인당 약 {won(Math.round(b.total / form.participants.length))} (끝전은 결제한 사람이 부담)
            </p>
          )}
        </>
      )}

      {form.mode === 'none' && (
        <p className="rounded-2xl bg-surface-2 p-3.5 text-[14px] leading-relaxed text-ink-2">
          금액을 기록하지 않아요. 이 기록은 차액 계산에서 빠져요.
        </p>
      )}
    </div>
  )
}
