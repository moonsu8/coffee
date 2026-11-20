import { digitsOnly, groupDigits } from '@/lib/format'
import { cn } from '@/lib/utils'

interface Props {
  value: string // 숫자만 담은 문자열
  onChange: (digits: string) => void
  label: string
  id?: string
  placeholder?: string
  className?: string
}

/** 숫자 키패드(inputmode numeric) + 천 단위 쉼표 + '원' 표시 */
export function NumberInput({ value, onChange, label, id, placeholder = '0', className }: Props) {
  return (
    <div className={cn('relative', className)}>
      <input
        id={id}
        aria-label={label}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        enterKeyHint="done"
        value={groupDigits(value)}
        placeholder={placeholder}
        onChange={(e) => onChange(digitsOnly(e.target.value))}
        className="min-h-12 w-full rounded-2xl border border-line bg-surface-2 pr-9 pl-3 text-right text-base font-bold placeholder:font-normal placeholder:text-ink-2/70"
      />
      <span aria-hidden className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-ink-2">
        원
      </span>
    </div>
  )
}
