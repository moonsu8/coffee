import { motion } from 'framer-motion'
import { useState } from 'react'
import { Avatar } from '@/components/avatar'
import { Card, EmptyState, PageHeader, SectionTitle, Segmented } from '@/components/common'
import { EmptyCup } from '@/components/illustrations'
import { memberStyle } from '@/lib/members'
import { monthKey } from '@/logic/dates'
import { countPurchases } from '@/logic/nextBuyer'
import { useStore } from '@/store/store'

type Range = 'month' | 'all'

export function StatsScreen() {
  const { data, today } = useStore()
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
          className="relative overflow-hidden rounded-card bg-espresso p-6 text-[#faf6f0] shadow-pop"
          style={{ background: 'radial-gradient(100% 90% at 100% 0%, var(--hero-glow), transparent 60%), var(--espresso)', ['--surface' as string]: '#fffdf9' }}
        >
          <p className="text-[11px] font-bold tracking-[0.22em] text-[#f0b27a]">COFFEE KING</p>
          <h2 className="mt-1 text-[17px] font-bold text-[#d7c4a8]">이번 달 커피왕 👑</h2>
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
                <p className="text-[15px] text-[#d7c4a8]">
                  {kings.length > 1 ? '공동 1위 · ' : ''}
                  {monthMax}번 샀어요
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-[15px] leading-relaxed text-[#d7c4a8]">이번 달엔 아직 기록이 없어요. 첫 번째 커피왕은 누구일까요?</p>
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
            1인당 구매 횟수
          </SectionTitle>
          {total === 0 ? (
            <EmptyState illustration={<EmptyCup />} title="아직 통계가 없어요" body="커피를 기록하면 여기에 막대그래프가 그려져요." />
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
      </div>
    </div>
  )
}
