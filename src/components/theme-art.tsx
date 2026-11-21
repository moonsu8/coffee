import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { themeOf } from '@/logic/themes'
import { useStore } from '@/store/store'
import type { ThemeId } from '@/types'
import { CoffeeCup, EmptyCup } from './illustrations'

/*
  테마별 히어로 일러스트. 히어로(진한 면) 위에 그려지므로 색은 모두 테마 변수:
  --hero-ink(밝은 면) / --hero-ink-2(보조) / --hero-accent(포인트) / --espresso(진한 면)
  커피 테마는 기존 CoffeeCup 그대로.
*/

const INK = 'var(--hero-ink)'
const INK2 = 'var(--hero-ink-2)'
const ACC = 'var(--hero-accent)'
const DEEP = 'var(--espresso)'

type Art = (props: { steaming: boolean }) => ReactNode

function Lunch({ steaming }: { steaming: boolean }) {
  return (
    <>
      {steaming && (
        <g fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" opacity="0.9">
          <path className="steam" d="M62 56 C54 46 70 40 62 28" />
          <path className="steam steam-2" d="M84 58 C76 46 92 38 84 24" />
          <path className="steam steam-3" d="M106 56 C98 46 114 40 106 28" />
        </g>
      )}
      <ellipse cx="80" cy="138" rx="62" ry="9" fill={INK2} opacity="0.6" />
      <rect x="22" y="62" width="116" height="72" rx="18" fill={INK} />
      <rect x="30" y="70" width="48" height="56" rx="12" fill={INK2} opacity="0.5" />
      <rect x="84" y="70" width="46" height="26" rx="10" fill={ACC} />
      <rect x="84" y="100" width="46" height="26" rx="10" fill={INK2} opacity="0.5" />
      <circle cx="54" cy="96" r="17" fill={INK} />
      <circle cx="48" cy="94" r="2.8" fill={DEEP} />
      <circle cx="60" cy="94" r="2.8" fill={DEEP} />
      <path d="M50 101 Q54 105 58 101" fill="none" stroke={DEEP} strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="107" cy="83" r="7" fill={INK} opacity="0.8" />
      <circle cx="100" cy="113" r="5" fill={ACC} />
      <circle cx="114" cy="113" r="5" fill={ACC} />
    </>
  )
}

function Notes() {
  return (
    <>
      <ellipse cx="80" cy="138" rx="56" ry="8" fill={INK2} opacity="0.5" />
      <rect x="34" y="22" width="92" height="112" rx="14" fill={INK} />
      <rect x="34" y="22" width="92" height="22" rx="14" fill={ACC} />
      <g fill={DEEP}>
        <circle cx="54" cy="22" r="5" />
        <circle cx="80" cy="22" r="5" />
        <circle cx="106" cy="22" r="5" />
      </g>
      <g stroke={INK2} strokeWidth="5" strokeLinecap="round">
        <path d="M48 62 H112" />
        <path d="M48 80 H112" />
        <path d="M48 98 H86" />
      </g>
      <g transform="rotate(35 118 102)">
        <rect x="112" y="64" width="12" height="62" rx="4" fill={ACC} />
        <path d="M112 126 L118 140 L124 126Z" fill={INK} />
      </g>
      <circle cx="62" cy="112" r="3.2" fill={DEEP} />
      <circle cx="78" cy="112" r="3.2" fill={DEEP} />
    </>
  )
}

function Stage() {
  return (
    <>
      <path d="M80 4 L132 138 H28 Z" fill={ACC} opacity="0.18" />
      <ellipse cx="80" cy="138" rx="58" ry="9" fill={INK2} opacity="0.55" />
      <rect x="76" y="92" width="8" height="40" rx="3" fill={INK2} />
      <rect x="56" y="130" width="48" height="7" rx="3.5" fill={INK2} />
      <rect x="54" y="30" width="52" height="66" rx="26" fill={INK} />
      <g stroke={INK2} strokeWidth="3" strokeLinecap="round">
        <path d="M54 52 H106" />
        <path d="M54 64 H106" />
        <path d="M54 76 H106" />
      </g>
      <rect x="54" y="82" width="52" height="16" rx="8" fill={ACC} />
      <circle cx="68" cy="56" r="3" fill={DEEP} />
      <circle cx="92" cy="56" r="3" fill={DEEP} />
      <path d="M72 66 Q80 73 88 66" fill="none" stroke={DEEP} strokeWidth="3" strokeLinecap="round" />
      <path d="M128 36 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" fill={ACC} />
      <path d="M26 50 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z" fill={INK} />
    </>
  )
}

function Clean({ steaming }: { steaming: boolean }) {
  return (
    <>
      <ellipse cx="80" cy="138" rx="56" ry="8" fill={INK2} opacity="0.5" />
      <g transform="rotate(18 80 80)">
        <rect x="76" y="6" width="8" height="82" rx="4" fill={INK2} />
        <path d="M52 86 H108 L116 132 H44 Z" fill={ACC} />
        <g stroke={INK} strokeWidth="4" strokeLinecap="round">
          <path d="M56 100 L52 130" />
          <path d="M68 100 L66 130" />
          <path d="M80 100 L80 130" />
          <path d="M92 100 L94 130" />
          <path d="M104 100 L108 130" />
        </g>
      </g>
      <g fill="none" stroke={INK} strokeWidth="3.5">
        <circle className={cn(steaming && 'steam')} cx="124" cy="46" r="11" />
        <circle className={cn(steaming && 'steam steam-2')} cx="140" cy="76" r="7" />
        <circle className={cn(steaming && 'steam steam-3')} cx="30" cy="52" r="8" />
      </g>
      <path d="M124 40 a6 6 0 0 1 6 5" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
    </>
  )
}

function Recycle() {
  return (
    <>
      <ellipse cx="80" cy="140" rx="52" ry="8" fill={INK2} opacity="0.5" />
      <path d="M40 54 H120 L112 134 H48 Z" fill={INK} />
      <rect x="32" y="40" width="96" height="16" rx="8" fill={ACC} />
      <rect x="66" y="30" width="28" height="10" rx="5" fill={ACC} />
      <g fill="none" stroke={DEEP} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M64 86 A18 18 0 0 1 96 80" />
        <path d="M98 100 A18 18 0 0 1 70 112" />
        <path d="M60 106 A18 18 0 0 1 56 88" />
      </g>
      <g fill={DEEP}>
        <path d="M100 70 L102 86 L88 82Z" />
        <path d="M80 118 L66 110 L78 104Z" />
        <path d="M50 98 L48 82 L62 88Z" />
      </g>
    </>
  )
}

function Dishes({ steaming }: { steaming: boolean }) {
  return (
    <>
      <g fill="none" stroke={INK} strokeWidth="3.5">
        <circle className={cn(steaming && 'steam')} cx="40" cy="48" r="10" />
        <circle className={cn(steaming && 'steam steam-2')} cx="122" cy="40" r="13" />
        <circle className={cn(steaming && 'steam steam-3')} cx="136" cy="76" r="7" />
        <circle cx="26" cy="82" r="6" />
      </g>
      <ellipse cx="80" cy="138" rx="60" ry="9" fill={INK2} opacity="0.55" />
      <ellipse cx="80" cy="120" rx="54" ry="12" fill={INK} />
      <ellipse cx="80" cy="120" rx="38" ry="7" fill={INK2} opacity="0.6" />
      <ellipse cx="80" cy="100" rx="50" ry="11" fill={ACC} />
      <ellipse cx="80" cy="100" rx="34" ry="6" fill={INK} opacity="0.35" />
      <ellipse cx="80" cy="82" rx="46" ry="10" fill={INK} />
      <ellipse cx="80" cy="82" rx="31" ry="6" fill={INK2} opacity="0.6" />
      <circle cx="68" cy="74" r="2.8" fill={DEEP} />
      <circle cx="92" cy="74" r="2.8" fill={DEEP} />
      <path d="M74 80 Q80 85 86 80" fill="none" stroke={DEEP} strokeWidth="2.6" strokeLinecap="round" />
    </>
  )
}

function Walk() {
  const foot = (x: number, y: number, r: number, c: string) => (
    <g transform={`translate(${x} ${y}) rotate(${r})`} fill={c}>
      <ellipse cx="0" cy="0" rx="13" ry="19" />
      <ellipse cx="0" cy="26" rx="10" ry="7" />
      <circle cx="-9" cy="-26" r="4.4" />
      <circle cx="-3" cy="-30" r="4.4" />
      <circle cx="4" cy="-30" r="4.4" />
      <circle cx="10" cy="-25" r="4.4" />
    </g>
  )
  return (
    <>
      <ellipse cx="80" cy="140" rx="60" ry="8" fill={INK2} opacity="0.45" />
      {foot(52, 96, -12, INK)}
      {foot(104, 66, 10, ACC)}
      <g fill={INK2} opacity="0.8">
        <circle cx="30" cy="132" r="3" />
        <circle cx="132" cy="120" r="3" />
        <circle cx="134" cy="26" r="3.5" />
      </g>
    </>
  )
}

const ARTS: Partial<Record<ThemeId, Art>> = {
  lunch: Lunch,
  notes: Notes,
  stage: Stage,
  clean: Clean,
  recycle: Recycle,
  dishes: Dishes,
  walk: Walk,
}

const LABELS: Record<ThemeId, string> = {
  coffee: '커피잔',
  lunch: '도시락',
  notes: '메모장',
  stage: '마이크',
  clean: '빗자루',
  recycle: '분리수거함',
  dishes: '접시',
  walk: '발자국',
}

/** 홈 히어로 일러스트. 커피 테마는 지금의 커피잔 그대로 */
export function HeroArtFor({ themeId, className, steaming = true }: { themeId: ThemeId; className?: string; steaming?: boolean }) {
  if (themeId === 'coffee') return <CoffeeCup className={className} steaming={steaming} />
  const Art = ARTS[themeId]
  return (
    <svg viewBox="0 0 160 150" className={cn('overflow-visible', className)} role="img" aria-label={LABELS[themeId]}>
      {Art ? <Art steaming={steaming} /> : null}
    </svg>
  )
}

export function HeroArt({ className, steaming }: { className?: string; steaming?: boolean }) {
  const { data } = useStore()
  return <HeroArtFor themeId={data.config.themeId} className={className} steaming={steaming} />
}

/** 빈 화면 일러스트 (표면 위). 커피 테마는 지금의 졸린 커피잔 그대로, 나머지는 테마 이모지 + zZ */
export function EmptyArtFor({ themeId, className }: { themeId: ThemeId; className?: string }) {
  if (themeId === 'coffee') return <EmptyCup className={className} />
  return (
    <svg viewBox="0 0 160 130" className={cn('overflow-visible', className)} role="img" aria-label={`빈 ${LABELS[themeId]}`}>
      <ellipse cx="80" cy="118" rx="52" ry="8" fill="var(--line)" opacity="0.8" />
      <circle cx="80" cy="64" r="50" fill="var(--surface-2)" stroke="var(--line)" strokeWidth="3" />
      <text x="80" y="82" fontSize="48" textAnchor="middle" opacity="0.75">
        {themeOf(themeId).emoji}
      </text>
      <text x="124" y="30" fontSize="16" fontWeight="800" fill="var(--caramel)">z</text>
      <text x="138" y="16" fontSize="11" fontWeight="800" fill="var(--caramel)" opacity="0.7">z</text>
    </svg>
  )
}

export function EmptyArt({ className }: { className?: string }) {
  const { data } = useStore()
  return <EmptyArtFor themeId={data.config.themeId} className={className} />
}
