import { AnimatePresence, motion } from 'framer-motion'
import { CalendarDays, List, Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import { Avatar } from '@/components/avatar'
import { Card, EmptyState, MemberPicker, PageHeader, Segmented } from '@/components/common'
import { EmptyCup } from '@/components/illustrations'
import { MonthGrid, MonthNav } from '@/components/month-grid'
import { PricingFields } from '@/components/pricing-fields'
import { OrderHistory } from '@/components/order-card'
import { SwipeRow } from '@/components/swipe-row'
import { useToast } from '@/components/toast'
import { Button } from '@/components/ui/button'
import { Sheet, SheetFooter } from '@/components/ui/sheet'
import { memberStyle } from '@/lib/members'
import { formatShort, monthKey, weekdayKo } from '@/logic/dates'
import { diffPrices, warnsOnClear } from '@/logic/fairness'
import { isAbsent, isBusinessDay } from '@/logic/nextBuyer'
import { buildPricing, initPricingForm, priceInputsOf, type LineBase } from '@/logic/pricing-form'
import { useStore } from '@/store/store'
import type { DateStr, Pricing } from '@/types'

type View = 'calendar' | 'list'

export function HistoryScreen() {
  const { data, terms, today, memberById, removePurchase } = useStore()
  const toast = useToast()
  const [view, setView] = useState<View>('calendar')
  const [month, setMonth] = useState(monthKey(today))
  const [editing, setEditing] = useState<DateStr | null>(null)

  const monthPurchases = data.purchases.filter((p) => p.date.startsWith(month)).sort((a, b) => (a.date < b.date ? 1 : -1))
  const byDate = new Map(data.purchases.map((p) => [p.date, p]))
  const usedMembers = [...new Set(monthPurchases.map((p) => p.memberId))].map((id) => memberById(id)).filter(Boolean)

  const del = (date: DateStr) => {
    const undo = removePurchase(date)
    toast({ message: '기록을 삭제했어요', actionLabel: '되돌리기', onAction: undo })
  }

  return (
    <div className="pb-8">
      <PageHeader
        title="기록"
        subtitle="HISTORY"
        right={
          <Button size="sm" variant="dark" onClick={() => setEditing(today)}>
            <Plus size={18} /> 기록 추가
          </Button>
        }
      />
      <div className="space-y-4 px-5">
        <Segmented
          id="history-view"
          value={view}
          onChange={setView}
          options={[
            { value: 'calendar', label: (<><CalendarDays size={17} /> 캘린더</>) },
            { value: 'list', label: (<><List size={17} /> 리스트</>) },
          ]}
        />
        <MonthNav month={month} onChange={setMonth} />

        <AnimatePresence mode="wait" initial={false}>
          {view === 'calendar' ? (
            <motion.div key="cal" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}>
              <Card className="p-3">
                <MonthGrid
                  month={month}
                  today={today}
                  onSelect={setEditing}
                  dayLabel={(d) => {
                    const p = byDate.get(d)
                    return `${formatShort(d)} ${p ? memberById(p.memberId)?.name + terms.calSuffix : '기록 없음'}`
                  }}
                  dayClassName={(d) => (!isBusinessDay(d, data.skipDays) ? 'opacity-60' : '')}
                  renderDay={(d) => {
                    const p = byDate.get(d)
                    if (p) {
                      const { color } = memberStyle(memberById(p.memberId))
                      return <span className="mt-0.5 size-2.5 rounded-full" style={{ background: color }} />
                    }
                    return data.skipDays.includes(d) ? <span className="text-[10px] font-bold text-mint-ink">휴일</span> : null
                  }}
                />
              </Card>
              {usedMembers.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-2">
                  {usedMembers.map((m) => (
                    <li key={m!.id} className="flex items-center gap-1.5 text-[13px] text-ink-2">
                      <span className="size-2.5 rounded-full" style={{ background: memberStyle(m).color }} />
                      {m!.name}
                    </li>
                  ))}
                </ul>
              )}
              {monthPurchases.length === 0 && (
                <p className="mt-4 text-center text-sm text-ink-2">{terms.calHint}</p>
              )}
            </motion.div>
          ) : (
            <motion.div key="list" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.18 }}>
              {monthPurchases.length === 0 ? (
                <Card>
                  <EmptyState
                    illustration={<EmptyCup />}
                    title="이 달엔 아직 기록이 없어요"
                    body={terms.emptyHistory}
                    action={<Button onClick={() => setEditing(today)}>오늘 기록하기</Button>}
                  />
                </Card>
              ) : (
                <>
                  <ul className="space-y-2.5">
                    {monthPurchases.map((p) => {
                      const m = memberById(p.memberId)
                      const day = data.orders.find((o) => o.date === p.date)
                      return (
                        <li key={p.date} className="overflow-hidden rounded-[20px] bg-surface shadow-card">
                          <SwipeRow label={`${formatShort(p.date)} ${m?.name ?? ''}`} onEdit={() => setEditing(p.date)} onDelete={() => del(p.date)}>
                            <div className="flex min-h-[68px] items-center gap-3.5 px-4 py-3">
                              <Avatar member={m} size="md" />
                              <div className="min-w-0 flex-1">
                                <p className="text-[17px] font-bold">{m?.name ?? '탈퇴한 멤버'}</p>
                                {p.memo && <p className="truncate text-sm text-ink-2">{p.memo}</p>}
                              </div>
                              <div className="text-right">
                                <p className="text-[15px] font-bold">{formatShort(p.date).split('(')[0]}</p>
                                <p className="text-xs text-ink-2">{weekdayKo(p.date)}요일</p>
                              </div>
                            </div>
                          </SwipeRow>
                          {day && data.template === 'coffee' && <OrderHistory day={day} />}
                        </li>
                      )
                    })}
                  </ul>
                  <p className="mt-3 text-center text-[13px] text-ink-2">← 왼쪽으로 밀면 수정·삭제</p>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <PurchaseEditor date={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

/** 구매 기록 등록/수정/삭제 시트 (과거 날짜도 가능) */
function PurchaseEditor({ date, onClose }: { date: DateStr | null; onClose: () => void }) {
  const { data, terms, today, savePurchase, removePurchase } = useStore()
  const toast = useToast()
  // 닫히는 애니메이션 동안에도 내용이 유지되도록 마지막 날짜를 기억 (시트가 언마운트되면 폼 상태는 자동 초기화)
  const last = useRef<DateStr>(date ?? today)
  if (date) last.current = date
  const shown = last.current
  return (
    <Sheet open={!!date} onOpenChange={(o) => !o && onClose()} title={data.purchases.some((p) => p.date === shown) ? `${terms.recordNoun} 수정` : `${terms.recordNoun} 추가`}>
      <EditorBody initialDate={shown} onClose={onClose} save={savePurchase} remove={removePurchase} toast={toast} />
    </Sheet>
  )
}

function EditorBody({
  initialDate,
  onClose,
  save,
  remove,
  toast,
}: {
  initialDate: DateStr
  onClose: () => void
  save: ReturnType<typeof useStore>['savePurchase']
  remove: ReturnType<typeof useStore>['removePurchase']
  toast: ReturnType<typeof useToast>
}) {
  const { data, terms, today, savePrices } = useStore()
  const existing = data.purchases.find((p) => p.date === initialDate)
  const [date, setDate] = useState(initialDate)
  const [memberId, setMemberId] = useState<string | null>(existing?.memberId ?? null)
  const [memo, setMemo] = useState(existing?.memo ?? '')
  const clash = date !== initialDate && data.purchases.some((p) => p.date === date)
  const [warnClear, setWarnClear] = useState(false)

  // 금액 입력 대상: 기존 상세 기록이면 저장된 줄, 아니면 그날 주문 스냅샷. 날짜를 바꾸면 폼을 다시 만든다
  const pricingSetup = (d: DateStr) => {
    const keep = d === initialDate ? existing?.pricing : undefined
    const day = data.orders.find((o) => o.date === d)
    const lines: LineBase[] =
      keep?.mode === 'detail'
        ? keep.lines!.map((l) => ({ memberId: l.memberId, order: { menu: l.menu, temp: l.temp, ...(l.size ? { size: l.size } : {}) } }))
        : (day?.items ?? []).filter((i) => !i.skipped && i.menu !== '안 마심').map((i) => ({ memberId: i.memberId, order: i }))
    const participantsDefault = lines.length
      ? lines.map((l) => l.memberId)
      : data.members.filter((m) => !isAbsent(m.id, d, data.absences)).map((m) => m.id)
    const form = initPricingForm({
      settings: data.settings,
      lines,
      participantsDefault,
      priceList: data.priceList,
      existing: keep,
      // 금액 없이 저장돼 있던 지난 기록은 '금액 없음'에서 시작 (기존 기록은 그대로 유지)
      startMode: d === initialDate && existing && !existing.pricing ? 'none' : undefined,
    })
    return { lines, form }
  }
  const [setup, setSetup] = useState(() => ({ date: initialDate, ...pricingSetup(initialDate) }))
  if (setup.date !== date) setSetup({ date, ...pricingSetup(date) })
  const { lines, form } = setup
  const built = buildPricing(form, lines)
  // 금액은 커피 그룹에서만 다룬다
  const pricing: Pricing | undefined = data.template === 'coffee' && form.mode !== 'none' ? built.pricing : undefined

  const doSave = () => {
    if (!memberId) return
    if (form.mode === 'detail' && form.saveToList) savePrices(diffPrices(data.priceList, priceInputsOf(form, lines)))
    // 날짜를 옮긴 수정이면 원래 날짜의 기록은 지운다
    const undoOld = existing && date !== initialDate ? remove(initialDate) : undefined
    const undo = save({ date, memberId, memo, ...(pricing ? { pricing } : {}) })
    onClose()
    toast({
      message: `${formatShort(date)} 기록을 저장했어요`,
      actionLabel: '되돌리기',
      onAction: () => {
        undo()
        undoOld?.()
      },
    })
  }

  return (
    <div className="space-y-5 pb-2">
      <div>
        <label htmlFor="p-date" className="mb-2 block text-sm font-semibold text-ink-2">
          날짜
        </label>
        <input
          id="p-date"
          type="date"
          value={date}
          max={today}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          className="min-h-12 w-full rounded-2xl border border-line bg-surface-2 px-4 text-base font-semibold"
        />
        {clash && <p className="mt-1.5 text-[13px] text-caramel-ink">이 날은 이미 기록이 있어요. 저장하면 덮어써요.</p>}
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-ink-2">{terms.whoField}</p>
        <MemberPicker members={data.members} value={memberId} onChange={setMemberId} />
      </div>
      <div>
        <label htmlFor="p-memo" className="mb-2 block text-sm font-semibold text-ink-2">
          메모 (선택)
        </label>
        <input
          id="p-memo"
          value={memo}
          maxLength={40}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="예) 아아 6잔, 디저트 포함"
          className="min-h-12 w-full rounded-2xl border border-line bg-surface-2 px-4 text-base placeholder:text-ink-2/70"
        />
      </div>
      {data.template === 'coffee' && (
        <div>
          <p className="mb-2 text-sm font-semibold text-ink-2">금액 (선택)</p>
          <PricingFields
            form={form}
            onChange={(f) => setSetup({ ...setup, form: f })}
            lines={lines}
            idPrefix="edit"
            allowNone
          />
        </div>
      )}
      <SheetFooter className="flex gap-2">
        {existing && (
          <Button
            variant="danger"
            size="lg"
            onClick={() => {
              const undo = remove(initialDate)
              onClose()
              toast({ message: '기록을 삭제했어요', actionLabel: '되돌리기', onAction: undo })
            }}
          >
            삭제
          </Button>
        )}
        <Button
          size="lg"
          className="flex-1"
          disabled={!memberId || !built.ok}
          onClick={() => {
            // 차액 기준에서 금액을 지우면 당번 순서가 달라질 수 있어 먼저 확인
            if (
              warnsOnClear({
                rule: data.settings.buyerRule,
                since: data.settings.balanceSince,
                date: initialDate,
                before: existing?.pricing,
                after: pricing,
              })
            ) {
              setWarnClear(true)
              return
            }
            doSave()
          }}
        >
          저장
        </Button>
      </SheetFooter>

      <Sheet open={warnClear} onOpenChange={setWarnClear} title="금액을 지울까요?" description="차액 계산에서 빠져 당번 순서가 달라질 수 있어요">
        <div className="flex gap-2 pt-2">
          <Button variant="soft" size="lg" className="flex-1" onClick={() => setWarnClear(false)}>
            취소
          </Button>
          <Button
            variant="danger"
            size="lg"
            className="flex-1"
            onClick={() => {
              setWarnClear(false)
              doSave()
            }}
          >
            그래도 지우기
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
