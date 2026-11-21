import { motion } from 'framer-motion'
import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Avatar } from '@/components/avatar'
import { Card, EmptyState, PageHeader, SectionTitle, Segmented } from '@/components/common'
import { EmptyArt } from '@/components/theme-art'
import { memberStyle } from '@/lib/members'
import { signedWon } from '@/lib/format'
import { formatMD, monthKey } from '@/logic/dates'
import { balanceWindow, computeFairness, countUnpriced } from '@/logic/fairness'
import { countPurchases } from '@/logic/nextBuyer'
import { useStore } from '@/store/store'

type Range = 'month' | 'all'

export function StatsScreen() {
  const { data, terms, today } = useStore()
  const [range, setRange] = useState<Range>('month')
  const month = monthKey(today)

  const monthCounts = countPurchases(data.members, data.purchases, month)
  const counts = range === 'month' ? monthCounts : countPurchases(data.members, data.purchases)

  const rows = data.members
    .map((m) => ({ m, n: counts.get(m.id) ?? 0 }))
    .sort((a, b) => b.n - a.n || a.m.order - b.m.order)
  const max = Math.max(1, ...rows.map((r) => r.n))
  const total = rows.reduce((s, r) => s + r.n, 0)

  const monthMax = Math.max(0, ...monthCounts.values())
  const kings = monthMax > 0 ? data.members.filter((m) => monthCounts.get(m.id) === monthMax) : []

  return (
    <div className="pb-8">
      <PageHeader title="통계" subtitle="STATS" />
      <div className="space-y-5 px-5">
        {/* 커피왕 */}
        <section
          className="relative overflow-hidden rounded-card bg-espresso p-6 text-hero-ink shadow-pop"
          style={{ background: 'radial-gradient(100% 90% at 100% 0%, var(--hero-glow), transparent 60%), var(--espresso)', ['--surface' as string]: 'var(--hero-surface)' }}
        >
          <p className="text-[11px] font-bold tracking-[0.22em] text-hero-accent">{terms.kingEyebrow}</p>
          <h2 className="mt-1 text-[17px] font-bold text-hero-ink-2">{terms.kingTitle}</h2>
          {kings.length > 0 ? (
            <div className="mt-4 flex items-center gap-4">
              <div className="flex -space-x-3">
                {kings.slice(0, 3).map((k) => (
                  <motion.div key={k.id} initial={{ scale: 0.6, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', damping: 12 }}>
                    <Avatar member={k} size="xl" className="ring-4 ring-espresso rounded-full" />
                  </motion.div>
                ))}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[32px] leading-tight font-black tracking-tight">
                  {kings.map((k) => k.name).join(', ')}
                </p>
                <p className="text-[15px] text-hero-ink-2">
                  {kings.length > 1 ? '공동 1위 · ' : ''}
                  {terms.kingCount(monthMax)}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-[15px] leading-relaxed text-hero-ink-2">{terms.kingEmpty}</p>
          )}
        </section>

        <Segmented
          id="stats-range"
          value={range}
          onChange={setRange}
          options={[
            { value: 'month', label: '이번 달' },
            { value: 'all', label: '전체' },
          ]}
        />

        <Card>
          <SectionTitle
            right={<span className="text-sm font-semibold text-ink-2">총 {total}번</span>}
          >
            {terms.countTitle}
          </SectionTitle>
          {total === 0 ? (
            <EmptyState illustration={<EmptyArt />} title="아직 통계가 없어요" body={terms.statsEmpty} />
          ) : (
            <ul className="space-y-3.5">
              {rows.map(({ m, n }, i) => (
                <li key={m.id} className="flex items-center gap-3">
                  <Avatar member={m} size="sm" />
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="truncate text-[15px] font-semibold">{m.name}</span>
                      <span className="text-[15px] font-extrabold">{n}번</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`${m.name} ${n}번`}>
                      <motion.div
                        key={`${range}-${m.id}`}
                        className="h-full rounded-full"
                        style={{ background: memberStyle(m).color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${(n / max) * 100}%` }}
                        transition={{ duration: 0.7, delay: i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {data.template === 'coffee' && <BalanceCard range={range} month={month} />}
      </div>
    </div>
  )
}

const num = (n: number) => n.toLocaleString('ko-KR')

/**
 * 커피 수지: 낸 돈 / 마신 돈 / 차액. 멤버 순서대로 보여주고 순위·강조는 하지 않는다.
 * 기간은 위의 이번 달/전체 토글을 따르며, 당번 계산용 balanceSince와는 별개다.
 */
function BalanceCard({ range, month }: { range: Range; month: string }) {
  const { data, memberById } = useStore()
  const { buyerRule, balanceSince } = data.settings
  const fair = computeFairness(data.members, data.purchases, range === 'month' ? (d) => d.startsWith(month) : undefined)
  // 당번 순서에 반영되지 않는 기록(차액 기준일 때만): balanceSince 이후의 금액 없는 기록
  const unpriced = buyerRule === 'balance' ? countUnpriced(data.purchases, balanceWindow(data.settings)) : 0

  return (
    <Card>
      <SectionTitle right={<span className="text-xs font-semibold text-ink-2">단위: 원</span>}>커피 수지</SectionTitle>

      {unpriced > 0 && (
        <p
          role="alert"
          className="mb-3 flex items-start gap-2 rounded-2xl bg-caramel/15 p-3 text-[13px] leading-snug font-semibold text-ink"
        >
          <TriangleAlert size={17} className="mt-px shrink-0 text-caramel-ink" />
          <span>
            금액이 없는 기록 {unpriced}건이 있어요. 차액 기준 당번 순서에 반영되지 않아요.
          </span>
        </p>
      )}

      {fair.counted === 0 ? (
        <EmptyState
          illustration={<EmptyArt />}
          title="아직 금액 기록이 없어요"
          body="[샀어요]에서 금액을 적으면 누가 얼마나 냈는지 여기에 정리돼요."
        />
      ) : (
        <table className="w-full text-right text-[13px]">
          <caption className="sr-only">멤버별 낸 돈, 마신 돈, 차액</caption>
          <thead>
            <tr className="text-xs text-ink-2">
              <th scope="col" className="pb-2 text-left font-semibold">멤버</th>
              <th scope="col" className="pb-2 font-semibold">낸 돈</th>
              <th scope="col" className="pb-2 font-semibold">마신 돈</th>
              <th scope="col" className="pb-2 font-semibold">차액</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {fair.rows.map((r) => {
              const m = r.memberId ? memberById(r.memberId) : undefined
              return (
                <tr key={r.memberId ?? 'gone'} className="h-12">
                  <th scope="row" className="py-1 text-left font-semibold">
                    <span className="flex items-center gap-1.5">
                      <Avatar member={m} size="xs" />
                      <span className="max-w-[64px] truncate text-[14px]">{m?.name ?? '탈퇴한 멤버'}</span>
                    </span>
                  </th>
                  <td className="py-1">{num(r.paid)}</td>
                  <td className="py-1">{num(r.consumed)}</td>
                  <td className="py-1 font-extrabold">{signedWon(r.balance).replace('원', '')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      <p className="mt-3 text-xs leading-relaxed text-ink-2">
        차액 = 낸 돈 − 마신 돈. 플러스는 더 낸 것, 마이너스는 덜 낸 것이에요.
        {fair.excluded > 0 && ` 금액 없는 기록 ${fair.excluded}건은 계산에서 제외했어요.`}
      </p>
      {buyerRule === 'balance' && (
        <p className="mt-1 text-xs leading-relaxed text-ink-2">
          당번 순서는 {balanceSince ? `${formatMD(balanceSince)}부터의` : '전체'} 기록으로 따로 계산해요.
        </p>
      )}
    </Card>
  )
}
