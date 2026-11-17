import type { Member } from '@/types'
import { memberStyle } from '@/lib/members'
import { cn } from '@/lib/utils'

const SIZES = {
  xs: 'size-6 text-[13px]',
  sm: 'size-9 text-lg',
  md: 'size-12 text-2xl',
  lg: 'size-16 text-[32px]',
  xl: 'size-20 text-[40px]',
}

interface Props {
  member?: Pick<Member, 'id' | 'color' | 'emoji'> | null
  size?: keyof typeof SIZES
  /** 휴가 중: 흐리게 + 🏖️ 뱃지 */
  absent?: boolean
  ring?: boolean
  className?: string
}

/** 멤버 고유 색상 + 이모지 아바타. 앱 전체에서 이 컴포넌트만 쓴다 */
export function Avatar({ member, size = 'md', absent, ring, className }: Props) {
  const { color, emoji } = memberStyle(member)
  return (
    <span className={cn('relative inline-grid shrink-0 place-items-center', SIZES[size], className)}>
      <span
        aria-hidden
        className={cn(
          'grid size-full place-items-center rounded-full leading-none transition-[filter,opacity]',
          absent && 'opacity-40 saturate-50',
          ring && 'ring-[3px] ring-offset-2 ring-offset-transparent',
        )}
        style={{
          background: `color-mix(in srgb, ${color} 30%, var(--surface))`,
          boxShadow: `inset 0 0 0 2px ${color}`,
          ...(ring ? { ['--tw-ring-color' as string]: color } : {}),
        }}
      >
        {emoji}
      </span>
      {absent && (
        <span
          aria-label="휴가 중"
          className="absolute -right-1 -bottom-1 grid size-[1.35em] place-items-center rounded-full bg-mint text-[0.5em] leading-none shadow-sm ring-2 ring-surface"
          style={{ fontSize: size === 'xs' ? 9 : size === 'sm' ? 11 : 14 }}
        >
          🏖️
        </span>
      )}
    </span>
  )
}
