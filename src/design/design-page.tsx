import type { CSSProperties } from 'react'
import { Avatar } from '@/components/avatar'
import { EmptyArtFor, HeroArtFor } from '@/components/theme-art'
import { themeConfetti } from '@/lib/effects'
import { contrast, contrastPairs, SEMANTIC, THEMES, themeVars } from '@/logic/themes'
import { THEME_IDS, type ThemeId } from '@/types'

/**
 * 디자인 확인용 페이지 (개발 서버 전용: /design 또는 #/design). 배포본에는 들어가지 않는다.
 * 모든 테마를 라이트·다크 나란히 보여준다. 시스템 설정과 무관하게 각 칸이 자기 모드로 그려진다.
 */

const MEMBERS = [
  { id: 'a1', color: '#C8553D', emoji: '🐻' },
  { id: 'a2', color: '#5F86A6', emoji: '🐱' },
  { id: 'a3', color: '#7A8B4F', emoji: '🦊' },
]

function Sample({ id, scheme }: { id: ThemeId; scheme: 'light' | 'dark' }) {
  const theme = THEMES[id]
  const sem = SEMANTIC[scheme]
  const style = {
    ...themeVars(id, scheme),
    '--mint': sem.mint,
    '--mint-ink': sem.mintInk,
    '--danger': sem.danger,
    colorScheme: scheme,
  } as CSSProperties
  const pairs = contrastPairs(id, scheme).map((p) => ({ ...p, ratio: contrast(p.fg, p.bg) }))
  const failed = pairs.filter((p) => p.ratio < p.min)
  const copy = theme.copy

  return (
    <section style={style} className="overflow-hidden rounded-[28px] border border-line bg-bg p-4 text-ink shadow-card">
      <p className="mb-3 flex items-center justify-between text-[13px] font-bold text-ink-2">
        <span>
          {theme.emoji} {theme.label} · {scheme === 'light' ? '라이트' : '다크'}
        </span>
        <span className={failed.length ? 'text-danger' : 'text-caramel-ink'}>
          {failed.length ? `대비 부족 ${failed.length}` : `AA 통과 (최저 ${Math.min(...pairs.map((p) => p.ratio)).toFixed(1)}:1)`}
        </span>
      </p>

      {/* 히어로 */}
      <div
        style={{ background: 'radial-gradient(120% 80% at 85% 0%, var(--hero-glow), transparent 60%), var(--espresso)', ['--surface' as string]: 'var(--hero-surface)' }}
        className="relative overflow-hidden rounded-card p-5 text-hero-ink shadow-pop"
      >
        <div aria-hidden className="pointer-events-none absolute inset-2 rounded-[18px] border border-dashed border-hero-ink-2/25" />
        <div className="relative flex items-start justify-between">
          <div>
            <p className="text-[11px] font-bold tracking-[0.22em] text-hero-accent">{copy?.heroEyebrow ?? "TODAY'S BREW"}</p>
            <p className="mt-1 text-[15px] font-semibold text-hero-ink-2">오늘의 당번</p>
          </div>
          <HeroArtFor themeId={id} className="-mt-1 -mr-1 w-[104px]" />
        </div>
        <h3 className="relative mt-5 text-[52px] leading-none font-black tracking-tight">가람</h3>
        <p className="relative mt-2 text-[15px] text-hero-ink-2">마지막: 11/10 (4일 전)</p>
        <div aria-hidden className="relative my-4 border-t-2 border-dotted border-hero-ink-2/35" />
        <div className="relative flex items-center justify-between">
          <span className="text-[11px] font-bold tracking-[0.22em] text-hero-accent">NEXT</span>
          <div className="flex gap-3">
            {MEMBERS.map((m) => (
              <Avatar key={m.id} member={m} size="md" />
            ))}
          </div>
        </div>
        <button
          onClick={(e) => themeConfetti(id, e.currentTarget)}
          className="relative mt-4 flex min-h-14 w-full items-center justify-center rounded-[20px] bg-caramel text-[17px] font-extrabold text-on-caramel"
        >
          완료 (눌러서 컨페티 보기)
        </button>
      </div>

      {/* 카드·칩·의미 색 */}
      <div className="mt-3 rounded-card bg-surface p-4 shadow-card">
        <p className="text-[17px] font-bold">앞으로의 순번</p>
        <p className="mt-1 text-[15px] text-ink-2">보조 글자는 이 정도 진하기예요.</p>
        <div className="mt-3 flex flex-wrap gap-2 text-[13px] font-bold">
          <span className="rounded-full bg-caramel px-3 py-1 text-on-caramel">포인트(배경)</span>
          <span className="rounded-full bg-surface-2 px-3 py-1 text-caramel-ink">포인트(글자)</span>
          <span className="rounded-full bg-caramel/25 px-3 py-1 text-ink">보는 중</span>
          <span className="rounded-full bg-mint/30 px-3 py-1 text-mint-ink">휴가</span>
          <span className="rounded-full bg-danger/12 px-3 py-1 text-danger">삭제</span>
        </div>
        <div className="mt-3 flex gap-2">
          <span className="grid min-h-11 flex-1 place-items-center rounded-2xl bg-caramel text-[15px] font-semibold text-on-caramel">기본 버튼</span>
          <span className="grid min-h-11 flex-1 place-items-center rounded-2xl border border-line bg-surface text-[15px] font-semibold">외곽선</span>
          <span className="grid min-h-11 flex-1 place-items-center rounded-2xl bg-espresso text-[15px] font-semibold text-hero-ink">진한 버튼</span>
        </div>
      </div>

      {/* 빈 화면 */}
      <div className="mt-3 flex flex-col items-center rounded-card bg-surface px-5 py-6 text-center shadow-card">
        <EmptyArtFor themeId={id} className="w-32" />
        <p className="mt-3 text-[17px] font-bold">아직 기록이 없어요</p>
        <p className="mt-1 text-[14px] leading-relaxed text-ink-2">{copy?.emptyHistory ?? '첫 커피를 기록하면 여기에 차곡차곡 쌓여요.'}</p>
      </div>

      {/* 색 견본 + 대비 */}
      <div className="mt-3 grid grid-cols-6 gap-1.5 text-[10px] font-semibold">
        {(['bg', 'surface', 'surface2', 'line', 'deep', 'accent'] as const).map((k) => (
          <div key={k} className="overflow-hidden rounded-lg border border-line">
            <div className="h-8" style={{ background: theme[scheme][k] }} />
            <p className="bg-surface px-1 py-0.5 text-ink-2">{k}</p>
          </div>
        ))}
      </div>
      <ul className="mt-3 space-y-0.5 text-[11px] text-ink-2">
        {pairs.map((p) => (
          <li key={p.name} className="flex justify-between">
            <span>{p.name}</span>
            <span className={p.ratio < p.min ? 'font-bold text-danger' : ''}>
              {p.ratio.toFixed(2)}:1 {p.ratio < p.min ? '✗' : '✓'}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function DesignPage() {
  return (
    <div className="min-h-dvh bg-bg px-4 py-8 text-ink">
      <div className="mx-auto max-w-[1000px]">
        <h1 className="text-2xl font-black">테마 디자인 확인</h1>
        <p className="mt-1 mb-6 text-[15px] text-ink-2">
          개발 서버 전용 페이지예요. 각 테마를 라이트(왼쪽)·다크(오른쪽)로 나란히 보여요. 히어로의 버튼을 누르면 그 테마의 컨페티가 나와요.
        </p>
        <div className="space-y-8">
          {THEME_IDS.map((id) => (
            <div key={id} className="grid gap-4 md:grid-cols-2">
              <Sample id={id} scheme="light" />
              <Sample id={id} scheme="dark" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
