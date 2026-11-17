import { motion } from 'framer-motion'
import type { ReactNode } from 'react'
import type { Member } from '@/types'
import { cn } from '@/lib/utils'
import { Avatar } from './avatar'

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <header className="flex items-end justify-between px-6 pt-8 pb-4">
      <div>
        {subtitle && <p className="mb-1 text-[13px] font-semibold tracking-wide text-caramel-ink">{subtitle}</p>}
        <h1 className="text-[28px] leading-tight font-extrabold tracking-tight">{title}</h1>
      </div>
      {right}
    </header>
  )
}

/** 카드 (라운드 24px + 갈색 톤 옅은 그림자) */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('rounded-card bg-surface p-5 shadow-card', className)}>{children}</section>
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-[15px] font-bold text-ink">{children}</h3>
      {right}
    </div>
  )
}

/** 세그먼트 토글 (캘린더 ↔ 리스트 등) */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  id,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
  id: string
}) {
  return (
    <div role="tablist" className="relative flex rounded-2xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className="relative z-10 flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-semibold"
        >
          {value === o.value && (
            <motion.span
              layoutId={`seg-${id}`}
              className="absolute inset-0 -z-10 rounded-xl bg-surface shadow-card"
              transition={{ type: 'spring', damping: 30, stiffness: 420 }}
            />
          )}
          <span className={cn(value === o.value ? 'text-ink' : 'text-ink-2')}>{o.label}</span>
        </button>
      ))}
    </div>
  )
}

/** 아바타 선택 (바텀시트·폼에서 공용) */
export function MemberPicker({
  members,
  value,
  onChange,
  isAbsent,
  columns = 4,
}: {
  members: Member[]
  value: string | null
  onChange: (id: string) => void
  isAbsent?: (id: string) => boolean
  columns?: 3 | 4
}) {
  return (
    <div className={cn('grid gap-2', columns === 4 ? 'grid-cols-4' : 'grid-cols-3')} role="radiogroup">
      {members.map((m) => {
        const selected = value === m.id
        return (
          <button
            key={m.id}
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(m.id)}
            className={cn(
              'flex min-h-[88px] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 px-1 py-2 transition-colors',
              selected ? 'border-caramel bg-caramel/15' : 'border-transparent bg-surface-2 hover:brightness-95',
            )}
          >
            <Avatar member={m} size="md" absent={isAbsent?.(m.id)} />
            <span className="max-w-full truncate text-[13px] font-semibold">{m.name}</span>
          </button>
        )
      })}
    </div>
  )
}

export function EmptyState({
  illustration,
  title,
  body,
  action,
}: {
  illustration: ReactNode
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="w-40">
        {illustration}
      </motion.div>
      <p className="mt-4 text-lg font-bold">{title}</p>
      <p className="mt-1 text-[15px] leading-relaxed text-ink-2">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
