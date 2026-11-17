import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { addDays, toDateStr, WEEKDAYS_KO } from '@/logic/dates'
import type { DateStr } from '@/types'
import { cn } from '@/lib/utils'

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return toDateStr(d).slice(0, 7)
}

export function MonthNav({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const [y, m] = month.split('-').map(Number)
  return (
    <div className="flex items-center justify-between">
      <button aria-label="이전 달" onClick={() => onChange(shiftMonth(month, -1))} className="grid size-11 place-items-center rounded-full text-ink-2 hover:bg-surface-2">
        <ChevronLeft size={22} />
      </button>
      <h2 className="text-lg font-bold tracking-tight">
        {y}년 {m}월
      </h2>
      <button aria-label="다음 달" onClick={() => onChange(shiftMonth(month, 1))} className="grid size-11 place-items-center rounded-full text-ink-2 hover:bg-surface-2">
        <ChevronRight size={22} />
      </button>
    </div>
  )
}

interface Props {
  month: string // 'YYYY-MM'
  onSelect: (date: DateStr) => void
  /** 칸 안쪽 내용 (날짜 숫자 아래) */
  renderDay?: (date: DateStr) => ReactNode
  /** 칸 배경/강조 클래스 */
  dayClassName?: (date: DateStr) => string
  /** 접근성 라벨 */
  dayLabel?: (date: DateStr) => string
  today?: DateStr
}

/** 월 달력 그리드 (일~토). 한 칸 최소 높이 48px → 터치 영역 확보 */
export function MonthGrid({ month, onSelect, renderDay, dayClassName, dayLabel, today }: Props) {
  const [y, m] = month.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const start = addDays(toDateStr(first), -first.getDay())
  const days: DateStr[] = []
  const lastDay = new Date(y, m, 0).getDate()
  const weeks = Math.ceil((first.getDay() + lastDay) / 7)
  for (let i = 0; i < weeks * 7; i++) days.push(addDays(start, i))

  return (
    <div>
      <div className="grid grid-cols-7 pb-1 text-center text-xs font-semibold">
        {WEEKDAYS_KO.map((w, i) => (
          <div key={w} className={cn('py-2', i === 0 ? 'text-danger' : 'text-ink-2')}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-1">
        {days.map((date) => {
          const inMonth = date.startsWith(month)
          const dow = new Date(date.replace(/-/g, '/')).getDay()
          if (!inMonth) return <div key={date} aria-hidden />
          const isToday = date === today
          return (
            <button
              key={date}
              onClick={() => onSelect(date)}
              aria-label={dayLabel?.(date) ?? date}
              className={cn(
                'relative mx-auto flex min-h-12 w-full max-w-[52px] flex-col items-center justify-start gap-0.5 rounded-2xl pt-1.5 text-[15px] font-medium transition-colors hover:bg-surface-2',
                dow === 0 && 'text-danger',
                dow === 6 && 'text-ink-2',
                dayClassName?.(date),
              )}
            >
              <span
                className={cn(
                  'grid size-6 place-items-center rounded-full text-[14px] leading-none',
                  isToday && 'bg-espresso font-bold text-[#faf6f0]',
                )}
              >
                {Number(date.slice(8))}
              </span>
              {renderDay?.(date)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
