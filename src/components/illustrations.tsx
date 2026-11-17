import { cn } from '@/lib/utils'

/** 김이 올라가는 커피잔. 색은 모두 팔레트(크림/라떼/카라멜/에스프레소) */
export function CoffeeCup({ className, steaming = true }: { className?: string; steaming?: boolean }) {
  return (
    <svg viewBox="0 0 160 150" className={cn('overflow-visible', className)} role="img" aria-label="커피잔">
      {steaming && (
        <g fill="none" stroke="#faf6f0" strokeWidth="5" strokeLinecap="round" opacity="0.9">
          <path className="steam" d="M60 52 C52 42 68 36 60 24 C56 18 60 12 64 8" />
          <path className="steam steam-2" d="M82 54 C74 42 90 34 82 20 C78 14 82 8 86 4" />
          <path className="steam steam-3" d="M104 52 C96 42 112 36 104 24 C100 18 104 12 108 8" />
        </g>
      )}
      {/* 받침 */}
      <ellipse cx="80" cy="136" rx="62" ry="10" fill="#d7c4a8" />
      <ellipse cx="80" cy="133" rx="52" ry="7" fill="#faf6f0" opacity="0.5" />
      {/* 손잡이 */}
      <path d="M132 76 C158 74 158 112 128 112" fill="none" stroke="#faf6f0" strokeWidth="11" strokeLinecap="round" />
      {/* 컵 */}
      <path d="M26 64 H134 V96 C134 120 112 134 80 134 C48 134 26 120 26 96 Z" fill="#faf6f0" />
      <path d="M26 64 H134 V76 H26 Z" fill="#e08e45" />
      <ellipse cx="80" cy="64" rx="54" ry="9" fill="#6b3f2a" />
      <ellipse cx="80" cy="63" rx="46" ry="6" fill="#8a5434" />
      {/* 얼굴 */}
      <circle cx="62" cy="100" r="3.6" fill="#3e2723" />
      <circle cx="98" cy="100" r="3.6" fill="#3e2723" />
      <path d="M72 108 Q80 115 88 108" fill="none" stroke="#3e2723" strokeWidth="3.2" strokeLinecap="round" />
      <circle cx="52" cy="108" r="5" fill="#e08e45" opacity="0.35" />
      <circle cx="108" cy="108" r="5" fill="#e08e45" opacity="0.35" />
    </svg>
  )
}

/** 빈 상태용: 졸린 빈 컵과 커피콩 */
export function EmptyCup({ className, variant = 'cup' }: { className?: string; variant?: 'cup' | 'palm' }) {
  if (variant === 'palm') {
    return (
      <svg viewBox="0 0 160 130" className={cn('overflow-visible', className)} role="img" aria-label="휴가 일러스트">
        <ellipse cx="80" cy="116" rx="62" ry="9" fill="#8fbfa8" opacity="0.5" />
        <path d="M82 112 C80 84 86 66 94 50" fill="none" stroke="#8a5434" strokeWidth="7" strokeLinecap="round" />
        <path d="M94 50 C76 34 56 40 46 54 C64 48 80 50 94 50Z" fill="#8fbfa8" />
        <path d="M94 50 C100 28 120 22 136 30 C120 32 108 40 94 50Z" fill="#6fa78e" />
        <path d="M94 50 C112 52 126 66 124 82 C116 68 106 58 94 50Z" fill="#8fbfa8" />
        <path d="M94 50 C80 58 74 72 78 86 C82 72 88 60 94 50Z" fill="#6fa78e" />
        <circle cx="32" cy="30" r="12" fill="#e08e45" opacity="0.8" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 160 130" className={cn('overflow-visible', className)} role="img" aria-label="빈 커피잔">
      <ellipse cx="80" cy="118" rx="58" ry="8" fill="#d7c4a8" opacity="0.7" />
      <path d="M124 62 C148 60 148 94 120 94" fill="none" stroke="#d7c4a8" strokeWidth="9" strokeLinecap="round" />
      <path d="M30 50 H124 V80 C124 100 106 112 77 112 C48 112 30 100 30 80 Z" fill="var(--surface-2)" stroke="#d7c4a8" strokeWidth="3" />
      <ellipse cx="77" cy="50" rx="47" ry="8" fill="var(--line)" />
      {/* 감은 눈 + 입 */}
      <path d="M58 82 Q64 87 70 82" fill="none" stroke="var(--ink-2)" strokeWidth="3" strokeLinecap="round" />
      <path d="M84 82 Q90 87 96 82" fill="none" stroke="var(--ink-2)" strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="77" cy="94" rx="4" ry="2.6" fill="var(--ink-2)" opacity="0.6" />
      {/* zZ */}
      <text x="112" y="34" fontSize="16" fontWeight="800" fill="#e08e45">z</text>
      <text x="126" y="20" fontSize="11" fontWeight="800" fill="#e08e45" opacity="0.7">z</text>
      {/* 커피콩 */}
      <g fill="#6b3f2a">
        <ellipse cx="22" cy="106" rx="7" ry="4.6" transform="rotate(-25 22 106)" />
        <ellipse cx="142" cy="112" rx="6" ry="4" transform="rotate(20 142 112)" />
      </g>
      <g stroke="#d7c4a8" strokeWidth="1.4" strokeLinecap="round" fill="none">
        <path d="M16 108 Q22 104 28 104" />
        <path d="M137 114 Q142 110 148 111" />
      </g>
    </svg>
  )
}

/** 앱 로고 마크 (작은 컵) */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="10" fill="#3e2723" />
      <path d="M8 13h14v5c0 3.5-3 6-7 6s-7-2.5-7-6z" fill="#faf6f0" />
      <path d="M22 14.5c3-.3 3 5 0 5" fill="none" stroke="#faf6f0" strokeWidth="2" strokeLinecap="round" />
      <rect x="8" y="13" width="14" height="2.6" fill="#e08e45" />
      <path d="M12 9.5c-1-1 1-2 0-3.2M16 9.5c-1-1 1-2 0-3.2" fill="none" stroke="#e08e45" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
