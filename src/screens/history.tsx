import { AnimatePresence, motion } from 'framer-motion'
import { CalendarDays, List, Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import { Avatar } from '@/components/avatar'
import { Card, EmptyState, MemberPicker, PageHeader, Segmented } from '@/components/common'
import { EmptyCup } from '@/components/illustrations'
import { MonthGrid, MonthNav } from '@/components/month-grid'
import { OrderHistory } from '@/components/order-card'
import { SwipeRow } from '@/components/swipe-row'
import { useToast } from '@/components/toast'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { memberStyle } from '@/lib/members'
import { formatShort, monthKey, weekdayKo } from '@/logic/dates'
import { isBusinessDay } from '@/logic/nextBuyer'
import { useStore } from '@/store/store'
import type { DateStr } from '@/types'

type View = 'calendar' | 'list'

export function HistoryScreen() {
  const { data, today, memberById, removePurchase } = useStore()
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
                    return `${formatShort(d)} ${p ? memberById(p.memberId)?.name + ' 구매' : '기록 없음'}`
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
                <p className="mt-4 text-center text-sm text-ink-2">날짜를 누르면 그날의 구매 기록을 남길 수 있어요</p>
              )}
            </motion.div>
          ) : (
            <motion.div key="list" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.18 }}>
              {monthPurchases.length === 0 ? (
                <Card>
                  <EmptyState
                    illustration={<EmptyCup />}
                    title="이 달엔 아직 기록이 없어요"
                    body="첫 커피를 기록하면 여기에 차곡차곡 쌓여요."
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
                          {day && <OrderHistory day={day} />}
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
  const { data, today, savePurchase, removePurchase } = useStore()
  const toast = useToast()
  // 닫히는 애니메이션 동안에도 내용이 유지되도록 마지막 날짜를 기억 (시트가 언마운트되면 폼 상태는 자동 초기화)
  const last = useRef<DateStr>(date ?? today)
  if (date) last.current = date
  const shown = last.current
  return (
    <Sheet open={!!date} onOpenChange={(o) => !o && onClose()} title={data.purchases.some((p) => p.date === shown) ? '구매 기록 수정' : '구매 기록 추가'}>
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
  const { data, today } = useStore()
  const existing = data.purchases.find((p) => p.date === initialDate)
  const [date, setDate] = useState(initialDate)
  const [memberId, setMemberId] = useState<string | null>(existing?.memberId ?? null)
  const [memo, setMemo] = useState(existing?.memo ?? '')
  const clash = date !== initialDate && data.purchases.some((p) => p.date === date)

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
        <p className="mb-2 text-sm font-semibold text-ink-2">누가 샀나요?</p>
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
      <div className="flex gap-2 pt-1">
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
          disabled={!memberId}
          onClick={() => {
            if (!memberId) return
            // 날짜를 옮긴 수정이면 원래 날짜의 기록은 지운다
            const undoOld = existing && date !== initialDate ? remove(initialDate) : undefined
            const undo = save({ date, memberId, memo })
            onClose()
            toast({
              message: `${formatShort(date)} 기록을 저장했어요`,
              actionLabel: '되돌리기',
              onAction: () => {
                undo()
                undoOld?.()
              },
            })
          }}
        >
          저장
        </Button>
      </div>
    </div>
  )
}
