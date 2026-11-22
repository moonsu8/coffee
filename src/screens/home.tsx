import { motion, useAnimationControls } from 'framer-motion'
import { Check, Copy, RotateCcw, UserRoundPen } from 'lucide-react'
import { useRef, useState, type CSSProperties } from 'react'
import { Avatar } from '@/components/avatar'
import { Card, EmptyState, SectionTitle } from '@/components/common'
import { LogoMark } from '@/components/illustrations'
import { EmptyArt, HeroArt } from '@/components/theme-art'
import { GroupSwitcher } from '@/components/group-switcher'
import { InstallBanner } from '@/components/install'
import { OrderCard } from '@/components/order-card'
import { PricePurchaseSheet } from '@/components/price-sheet'
import { useToast } from '@/components/toast'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { MemberPicker } from '@/components/common'
import { copyText, themeConfetti } from '@/lib/effects'
import { cn, haptic } from '@/lib/utils'
import { addDays, diffDays, formatMD, formatShort, parseDate, weekdayKo } from '@/logic/dates'
import {
  forecastBuyers,
  getNextBuyer,
  isAbsent,
  lastPurchaseDate,
  nextBusinessDay,
  rankMembers,
} from '@/logic/nextBuyer'
import { needsPriceSheet, type PriceInput } from '@/logic/fairness'
import { sharePrefix } from '@/logic/groups'
import { buildShareText } from '@/logic/shareText'
import type { Pricing } from '@/types'
import { useStore } from '@/store/store'

// 히어로는 항상 에스프레소 배경이라 아바타 틴트는 밝은 크림 기준으로 계산
const HERO_VARS = { '--surface': 'var(--hero-surface)' } as CSSProperties

function relativeDays(from: string, to: string): string {
  const n = diffDays(to, from)
  return n === 0 ? '오늘' : n === 1 ? '어제' : `${n}일 전`
}

export function HomeScreen({ goSettings }: { goSettings: () => void }) {
  const { data, terms, today, memberById, savePurchase, removePurchase, savePrices, access } = useStore()
  const isMoney = data.template === 'coffee'
  const toast = useToast()
  const [sheetOpen, setSheetOpen] = useState(false)
  const [priceFor, setPriceFor] = useState<{ memberId: string; fromButton: boolean } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const pulse = useAnimationControls()

  if (data.members.length === 0) {
    return (
      <div className="px-5 pt-8">
        <GroupSwitcher />
        <EmptyState
          illustration={<EmptyArt />}
          title="아직 멤버가 없어요"
          body={terms.emptyMembers}
          action={access.canWrite ? <Button onClick={goSettings}>멤버 추가하러 가기</Button> : undefined}
        />
      </div>
    )
  }

  const target = nextBusinessDay(today, data.skipDays, data.schedule)
  const isToday = target === today
  const todayPurchase = isToday ? data.purchases.find((p) => p.date === today) : undefined
  const buyer = todayPurchase ? memberById(todayPurchase.memberId) : getNextBuyer(target, data)
  const done = !!todayPurchase

  const queueDate = done ? nextBusinessDay(addDays(today, 1), data.skipDays, data.schedule) : target
  const queue = rankMembers(queueDate, data)
    .filter((r) => r.member.id !== buyer?.id)
    .slice(0, 3)
  const last = buyer ? lastPurchaseDate(buyer.id, data.purchases, done ? today : target) : null
  const forecast = forecastBuyers(target, 5, data)

  /** 구매 기록 확정 (금액이 있으면 함께, 가격표 저장 항목도 함께) */
  const record = (memberId: string, fromButton: boolean, pricing?: Pricing, entries: PriceInput[] = []) => {
    const m = memberById(memberId)
    savePrices(entries)
    const undo = savePurchase({ date: today, memberId, ...(pricing ? { pricing } : {}) })
    haptic([18, 40, 18])
    themeConfetti(data.config.themeId, fromButton ? btnRef.current : null)
    if (fromButton) pulse.start({ scale: [1, 0.9, 1.07, 1], transition: { duration: 0.45 } })
    toast({ message: `${m?.name ?? ''}님 기록했어요`, actionLabel: '되돌리기', onAction: undo })
  }

  /** [샀어요] / 구매자 선택. 금액 기록을 쓰는 설정이면 금액 시트를 먼저 연다 */
  const askBuy = (memberId: string, fromButton = false) => {
    if (todayPurchase) {
      // 이미 기록된 날의 구매자 변경: 금액 기록은 그대로 두고 결제자만 바꾼다
      const undo = savePurchase({ ...todayPurchase, memberId })
      toast({ message: `${memberById(memberId)?.name ?? ''}님으로 바꿨어요`, actionLabel: '되돌리기', onAction: undo })
    } else if (isMoney && needsPriceSheet(data.settings)) setPriceFor({ memberId, fromButton })
    else record(memberId, fromButton)
  }

  const share = async () => {
    const ok = await copyText(buildShareText(today, data, 2, sharePrefix(data)))
    toast({ message: ok ? '공유용 텍스트를 복사했어요' : '복사에 실패했어요', duration: 2500 })
  }

  const nameSize = (buyer?.name.length ?? 0) > 4 ? 'text-[48px]' : 'text-[64px]'

  return (
    <div className="px-5 pb-8">
      <div className="flex items-center justify-between px-1 pt-6 pb-4">
        <div className="flex items-center gap-2.5">
          <LogoMark className="size-8" />
          <span className="text-[17px] font-extrabold tracking-tight">커피 당번</span>
        </div>
        <span className="text-sm font-semibold text-ink-2">
          {parseDate(today).getMonth() + 1}월 {parseDate(today).getDate()}일 {weekdayKo(today)}요일
        </span>
      </div>
      <GroupSwitcher />

      {/* ───── 오늘의 당번 히어로 (메뉴판 느낌) ───── */}
      <motion.section
        key={`${buyer?.id}-${done}`}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        style={{
          ...HERO_VARS,
          background: 'radial-gradient(120% 80% at 85% 0%, var(--hero-glow), transparent 60%), var(--espresso)',
        }}
        className="relative flex min-h-[47dvh] flex-col overflow-hidden rounded-card p-6 text-hero-ink shadow-pop md:min-h-[420px]"
      >
        {/* 메뉴판 안쪽 테두리 */}
        <div aria-hidden className="pointer-events-none absolute inset-2.5 rounded-[18px] border border-dashed border-hero-ink-2/25" />

        <div className="relative flex items-start justify-between">
          <div>
            <p className="text-[11px] font-bold tracking-[0.22em] text-hero-accent">{terms.heroEyebrow}</p>
            <p className="mt-1 text-[15px] font-semibold text-hero-ink-2">
              {isToday ? '오늘의 당번' : `${formatShort(target)} 당번`}
            </p>
          </div>
          <HeroArt className="-mt-1 -mr-1 w-[118px]" steaming={!done && !!buyer} />
        </div>

        <div className="relative mt-auto pt-4">
          {!isToday && (
            <p className="mb-2 inline-block rounded-full bg-white/10 px-3 py-1 text-[13px] font-semibold text-hero-ink-2">
              오늘은 쉬는 날이에요
            </p>
          )}
          {buyer ? (
            <>
              <h2 className={cn('font-black leading-[1.05] tracking-tight break-keep', nameSize)}>{buyer.name}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-hero-ink-2">
                {done ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-caramel px-3 py-1 text-[13px] font-bold text-on-caramel">
                    <Check size={14} strokeWidth={3} /> {terms.doneBadge}
                  </span>
                ) : null}
                <span>
                  {last
                    ? `${terms.lastLabel}: ${formatMD(last)} (${relativeDays(last, done ? today : target)})`
                    : terms.never}
                </span>
              </div>
              {todayPurchase?.memo && <p className="mt-1 text-sm text-hero-ink-2/80">“{todayPurchase.memo}”</p>}
            </>
          ) : (
            <>
              <h2 className="text-4xl leading-tight font-black tracking-tight">당번이 없어요</h2>
              <p className="mt-2 text-[15px] text-hero-ink-2">모두 휴가 중이에요. 푹 쉬고 오세요.</p>
            </>
          )}

          {/* 메뉴판식 점선 구분 */}
          <div aria-hidden className="my-5 border-t-2 border-dotted border-hero-ink-2/35" />

          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold tracking-[0.22em] text-hero-accent">NEXT</span>
            <ul className="flex gap-4">
              {queue.map((r, i) => (
                <li key={r.member.id} className="flex w-[58px] flex-col items-center gap-1">
                  <Avatar member={r.member} size="md" absent={r.absent} />
                  <span className={cn('max-w-full truncate text-[13px] font-semibold', r.absent && 'opacity-55')}>
                    {r.member.name}
                  </span>
                  <span className="sr-only">{`${i + 1}번째 다음 당번${r.absent ? ', 휴가 중' : ''}`}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 액션 */}
          {buyer && access.canWrite && (
            <div className="mt-5">
              {done ? (
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1 border-white/20 bg-white/10 text-hero-ink hover:bg-white/15" onClick={() => setSheetOpen(true)}>
                    <UserRoundPen size={18} /> {terms.changeBuyer}
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 border-white/20 bg-white/10 text-hero-ink hover:bg-white/15"
                    onClick={() => {
                      const undo = removePurchase(today)
                      toast({ message: '기록을 취소했어요', actionLabel: '되돌리기', onAction: undo })
                    }}
                  >
                    <RotateCcw size={18} /> 기록 취소
                  </Button>
                </div>
              ) : isToday ? (
                <>
                  <motion.div animate={pulse}>
                    <motion.button
                      ref={btnRef}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => askBuy(buyer.id, true)}
                      className="breathe flex min-h-16 w-full items-center justify-center gap-2.5 rounded-[22px] bg-caramel text-[19px] font-extrabold text-on-caramel"
                    >
                      <Check size={22} strokeWidth={3} /> {terms.doneBtn}
                    </motion.button>
                  </motion.div>
                  <button
                    onClick={() => setSheetOpen(true)}
                    className="mt-1 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl text-[15px] font-semibold text-hero-ink-2 underline decoration-hero-ink-2/40 underline-offset-4 hover:bg-white/5"
                  >
                    {terms.otherBtn}
                  </button>
                </>
              ) : null}
            </div>
          )}
        </div>
      </motion.section>

      {isToday && data.hasOrders && <OrderCard date={today} />}

      {/* ───── 앞으로 5영업일 ───── */}
      <Card className="mt-5">
        <SectionTitle>{data.schedule === 'weekdays' ? '앞으로 5영업일' : '앞으로 5번'}</SectionTitle>
        <ul className="divide-y divide-line">
          {forecast.map((f, i) => {
            const m = f.memberId ? memberById(f.memberId) : undefined
            const off = data.members.filter((x) => isAbsent(x.id, f.date, data.absences))
            return (
              <li key={f.date} className="flex min-h-14 items-center gap-3 py-2">
                <div className="w-[62px] shrink-0">
                  <p className="text-[15px] font-bold">{f.date === today ? '오늘' : `${weekdayKo(f.date)}요일`}</p>
                  <p className="text-xs text-ink-2">{formatMD(f.date)}</p>
                </div>
                {m ? (
                  <>
                    <Avatar member={m} size="sm" />
                    <span className={cn('flex-1 text-[16px] font-semibold', i === 0 && 'text-ink')}>{m.name}</span>
                  </>
                ) : (
                  <span className="flex-1 text-[15px] text-ink-2">당번 없음</span>
                )}
                {f.actual && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold text-ink-2">확정</span>}
                {off.length > 0 && (
                  <span className="max-w-[120px] truncate rounded-full bg-mint/30 px-2.5 py-1 text-xs font-semibold text-mint-ink">
                    {off.map((x) => x.name).join(', ')} 휴가
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </Card>

      <Button variant="soft" size="lg" className="mt-4 w-full" onClick={share}>
        <Copy size={19} /> 메신저 공유용 텍스트 복사
      </Button>

      <InstallBanner className="mt-4" />

      {/* ───── 다른 사람이 샀어요 ───── */}
      <Sheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title={done ? terms.changeSheet : terms.whoSheet}
        description="아바타를 누르면 바로 기록돼요"
      >
        <MemberPicker
          members={data.members}
          value={todayPurchase?.memberId ?? null}
          isAbsent={(id) => isAbsent(id, today, data.absences)}
          onChange={(id) => {
            setSheetOpen(false)
            askBuy(id)
          }}
        />
      </Sheet>

      <PricePurchaseSheet
        open={!!priceFor}
        memberId={priceFor?.memberId ?? null}
        date={today}
        onClose={() => setPriceFor(null)}
        onConfirm={(id, pricing, entries) => {
          const fromButton = priceFor?.fromButton ?? false
          setPriceFor(null)
          record(id, fromButton, pricing, entries)
        }}
      />
    </div>
  )
}
