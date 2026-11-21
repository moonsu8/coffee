import type { ThemeId } from '../types'
import { THEME_IDS } from '../types'

/**
 * 그룹 테마. 색은 전부 CSS 변수 토큰으로 내려가고(`themeVars`), 최상위(html)의 data-theme 값으로 갈아 끼운다.
 * - 바뀌는 것: 배경·표면·포인트 색·히어로 일러스트·빈 화면 문구·컨페티
 * - 바뀌지 않는 것: 레이아웃·폰트·멤버 아바타 색, 휴가(민트)·경고(danger) 같은 의미 색
 * - 포인트 색(accent)은 '배경'에만 쓰고 그 위 글자는 어두운 색(onAccent). 포인트 색 글자는 accentInk.
 * - 자유 색상 선택은 없다: 목록에서 테마를 고르기만 한다.
 */

export interface Palette {
  bg: string
  surface: string
  surface2: string
  ink: string
  ink2: string
  line: string
  deep: string // 히어로·토스트 같은 진한 면 (CSS: --espresso)
  accent: string // 포인트 색, 배경 전용 (CSS: --caramel)
  accentInk: string // 포인트 계열 글자색 (CSS: --caramel-ink)
  onAccent: string // 포인트 배경 위 글자색 (CSS: --on-caramel)
  heroInk: string // deep 위의 글자
  heroInk2: string // deep 위의 보조 글자 (CSS: --latte, --hero-ink-2)
  heroAccent: string // deep 위의 포인트 글자
  heroSurface: string // 히어로 안에서 아바타 테두리 등에 쓰는 밝은 면
}

export interface Theme {
  id: ThemeId
  label: string
  emoji: string
  light: Palette
  dark: Palette
  /** 컨페티: 모양과 색 */
  confetti: { shape: 'bean' | 'circle' | 'square' | 'star'; text?: string; colors: string[] }
  /** 빈 화면·히어로 문구 (커피 테마는 기존 문구 그대로라 비어 있다) */
  copy: {
    heroEyebrow: string
    emptyMembers: string
    emptyHistory: string
    statsEmpty: string
    kingEmpty: string
  } | null
}

/** 의미 색: 테마와 무관하게 고정 (휴가=민트, 경고=danger). 표면 위 글자 대비만 테마마다 검사한다 */
export const SEMANTIC = {
  light: { mint: '#8fbfa8', mintInk: '#2d6652', danger: '#b0402b' },
  dark: { mint: '#8fbfa8', mintInk: '#9fd3bc', danger: '#f2907a' },
}

const hero = (heroInk: string, heroInk2: string, heroAccent: string, heroSurface: string) => ({ heroInk, heroInk2, heroAccent, heroSurface })

export const THEMES: Record<ThemeId, Theme> = {
  /* 커피: index.css의 값 그대로 (테스트가 일치를 검사한다) */
  coffee: {
    id: 'coffee',
    label: '커피',
    emoji: '☕',
    light: {
      bg: '#faf6f0', surface: '#fffdf9', surface2: '#f3ebdd', ink: '#3e2723', ink2: '#6b4f46', line: '#e8dccb',
      deep: '#3e2723', accent: '#e08e45', accentInk: '#8f4e14', onAccent: '#2b1810',
      ...hero('#faf6f0', '#d7c4a8', '#f0b27a', '#fffdf9'),
    },
    dark: {
      bg: '#1c1410', surface: '#2a1e18', surface2: '#36271f', ink: '#f5ebdd', ink2: '#c2ac96', line: '#473429',
      deep: '#3e2723', accent: '#e08e45', accentInk: '#efae72', onAccent: '#2b1810',
      ...hero('#faf6f0', '#d7c4a8', '#f0b27a', '#fffdf9'),
    },
    confetti: { shape: 'bean', colors: ['#3e2723', '#5d4037', '#8d6e63', '#6b3f2a', '#e08e45', '#d7c4a8'] },
    copy: null,
  },
  lunch: {
    id: 'lunch',
    label: '점심',
    emoji: '🍱',
    light: {
      bg: '#fbf7e8', surface: '#fffdf3', surface2: '#f4ecc9', ink: '#33290a', ink2: '#655317', line: '#eadfae',
      deep: '#4a3a0c', accent: '#f2c94c', accentInk: '#7a5c00', onAccent: '#2e2305',
      ...hero('#fff9e0', '#e6d79a', '#ffd966', '#fffdf3'),
    },
    dark: {
      bg: '#1c1708', surface: '#2a230d', surface2: '#382f13', ink: '#fbf3d6', ink2: '#cdbd86', line: '#4a3f1c',
      deep: '#3d3310', accent: '#f2c94c', accentInk: '#f2c94c', onAccent: '#2e2305',
      ...hero('#fff9e0', '#e6d79a', '#ffd966', '#fffdf3'),
    },
    confetti: { shape: 'circle', text: '🍱', colors: ['#f2c94c', '#e8a33d', '#d9622b', '#7cb342', '#fff3c4'] },
    copy: {
      heroEyebrow: 'LUNCH TIME',
      emptyMembers: '함께 점심 먹을 동료를 먼저 추가해 주세요.',
      emptyHistory: '첫 점심을 기록하면 여기에 차곡차곡 쌓여요.',
      statsEmpty: '점심을 기록하면 여기에 막대그래프가 그려져요.',
      kingEmpty: '이번 달엔 아직 기록이 없어요. 첫 번째 점심 요정은 누구일까요?',
    },
  },
  notes: {
    id: 'notes',
    label: '회의록',
    emoji: '📝',
    light: {
      bg: '#f5f6fb', surface: '#ffffff', surface2: '#e8eaf6', ink: '#1f2340', ink2: '#4a5078', line: '#d9dcee',
      deep: '#2a2f5e', accent: '#8f9cf5', accentInk: '#3d4bb8', onAccent: '#141838',
      ...hero('#f4f5ff', '#c5caf0', '#aab4ff', '#ffffff'),
    },
    dark: {
      bg: '#12142a', surface: '#1b1e3a', surface2: '#252950', ink: '#eceeff', ink2: '#aeb4e0', line: '#2f3461',
      deep: '#232850', accent: '#8f9cf5', accentInk: '#aab4ff', onAccent: '#141838',
      ...hero('#f4f5ff', '#c5caf0', '#aab4ff', '#ffffff'),
    },
    confetti: { shape: 'square', text: '📝', colors: ['#8f9cf5', '#aab4ff', '#4a5ad1', '#e8eaf6', '#ffd966'] },
    copy: {
      heroEyebrow: 'MINUTES',
      emptyMembers: '회의록을 함께 쓸 동료를 먼저 추가해 주세요.',
      emptyHistory: '첫 회의록을 기록하면 여기에 차곡차곡 쌓여요.',
      statsEmpty: '기록을 남기면 여기에 막대그래프가 그려져요.',
      kingEmpty: '이번 달엔 아직 기록이 없어요. 첫 번째 서기는 누구일까요?',
    },
  },
  stage: {
    id: 'stage',
    label: '무대',
    emoji: '🎤',
    light: {
      bg: '#fbf4f8', surface: '#fffafc', surface2: '#f4e4ee', ink: '#3a1730', ink2: '#6c3f5d', line: '#ecd3e2',
      deep: '#4a1a45', accent: '#f07ab9', accentInk: '#a31f6b', onAccent: '#35091f',
      ...hero('#fff1f8', '#e8bcd6', '#ff9fd0', '#fffafc'),
    },
    dark: {
      bg: '#1d0f19', surface: '#2a1624', surface2: '#381e31', ink: '#fbe9f3', ink2: '#cca3bd', line: '#4a2a40',
      deep: '#3c1838', accent: '#f07ab9', accentInk: '#ff9fd0', onAccent: '#35091f',
      ...hero('#fff1f8', '#e8bcd6', '#ff9fd0', '#fffafc'),
    },
    confetti: { shape: 'star', text: '🎤', colors: ['#f07ab9', '#ff9fd0', '#ffd966', '#a31f6b', '#ffffff'] },
    copy: {
      heroEyebrow: 'ON STAGE',
      emptyMembers: '무대에 오를 동료를 먼저 추가해 주세요.',
      emptyHistory: '첫 발표를 기록하면 여기에 차곡차곡 쌓여요.',
      statsEmpty: '기록을 남기면 여기에 막대그래프가 그려져요.',
      kingEmpty: '이번 달엔 아직 기록이 없어요. 첫 번째 주인공은 누구일까요?',
    },
  },
  clean: {
    id: 'clean',
    label: '청소',
    emoji: '🧹',
    light: {
      bg: '#f0f8fb', surface: '#fafeff', surface2: '#dfeef5', ink: '#12303d', ink2: '#3f6070', line: '#cde3ec',
      deep: '#12485f', accent: '#5bc0eb', accentInk: '#0b6c94', onAccent: '#06222e',
      ...hero('#effaff', '#b9dcea', '#7fd3f3', '#fafeff'),
    },
    dark: {
      bg: '#0d1a20', surface: '#142630', surface2: '#1c3341', ink: '#e6f6fc', ink2: '#9fc3d2', line: '#25414f',
      deep: '#17475c', accent: '#5bc0eb', accentInk: '#7fd3f3', onAccent: '#06222e',
      ...hero('#effaff', '#b9dcea', '#7fd3f3', '#fafeff'),
    },
    confetti: { shape: 'circle', text: '🫧', colors: ['#5bc0eb', '#7fd3f3', '#b9dcea', '#ffffff', '#12485f'] },
    copy: {
      heroEyebrow: 'CLEAN DAY',
      emptyMembers: '함께 청소할 동료를 먼저 추가해 주세요.',
      emptyHistory: '첫 청소를 기록하면 여기에 차곡차곡 쌓여요.',
      statsEmpty: '기록을 남기면 여기에 막대그래프가 그려져요.',
      kingEmpty: '이번 달엔 아직 기록이 없어요. 첫 번째 반짝이는 사람은 누구일까요?',
    },
  },
  recycle: {
    id: 'recycle',
    label: '분리수거',
    emoji: '♻️',
    light: {
      bg: '#f1f8f1', surface: '#fbfffb', surface2: '#dfeede', ink: '#153019', ink2: '#3f6444', line: '#cfe3cf',
      deep: '#1d4a26', accent: '#6cc476', accentInk: '#226b2e', onAccent: '#0b2410',
      ...hero('#effaf0', '#b9dbbd', '#8ee09a', '#fbfffb'),
    },
    dark: {
      bg: '#0f1a12', surface: '#17261b', surface2: '#1f3425', ink: '#e4f6e6', ink2: '#9fc7a5', line: '#284431',
      deep: '#1c4526', accent: '#6cc476', accentInk: '#8ee09a', onAccent: '#0b2410',
      ...hero('#effaf0', '#b9dbbd', '#8ee09a', '#fbfffb'),
    },
    confetti: { shape: 'square', text: '♻️', colors: ['#6cc476', '#8ee09a', '#1d4a26', '#b9dbbd', '#f2c94c'] },
    copy: {
      heroEyebrow: 'RECYCLE DAY',
      emptyMembers: '분리수거를 함께할 동료를 먼저 추가해 주세요.',
      emptyHistory: '첫 분리수거를 기록하면 여기에 차곡차곡 쌓여요.',
      statsEmpty: '기록을 남기면 여기에 막대그래프가 그려져요.',
      kingEmpty: '이번 달엔 아직 기록이 없어요. 첫 번째 지구 지킴이는 누구일까요?',
    },
  },
  dishes: {
    id: 'dishes',
    label: '설거지',
    emoji: '🍽️',
    light: {
      bg: '#eef9f8', surface: '#fafffe', surface2: '#d9eeec', ink: '#0f3330', ink2: '#3a6764', line: '#c6e4e1',
      deep: '#0f4a46', accent: '#3cc9bb', accentInk: '#0b6b62', onAccent: '#04201d',
      ...hero('#eafffc', '#b0dcd8', '#6fe3d6', '#fafffe'),
    },
    dark: {
      bg: '#0c1a19', surface: '#132726', surface2: '#1b3534', ink: '#e0f6f4', ink2: '#98c4c0', line: '#234644',
      deep: '#14504b', accent: '#3cc9bb', accentInk: '#6fe3d6', onAccent: '#04201d',
      ...hero('#eafffc', '#b0dcd8', '#6fe3d6', '#fafffe'),
    },
    confetti: { shape: 'circle', text: '🫧', colors: ['#3cc9bb', '#6fe3d6', '#b0dcd8', '#ffffff', '#0f4a46'] },
    copy: {
      heroEyebrow: 'DISH DUTY',
      emptyMembers: '설거지를 함께할 동료를 먼저 추가해 주세요.',
      emptyHistory: '첫 설거지를 기록하면 여기에 차곡차곡 쌓여요.',
      statsEmpty: '기록을 남기면 여기에 막대그래프가 그려져요.',
      kingEmpty: '이번 달엔 아직 기록이 없어요. 첫 번째 거품 요정은 누구일까요?',
    },
  },
  walk: {
    id: 'walk',
    label: '산책',
    emoji: '🚶',
    light: {
      bg: '#fdf3f0', surface: '#fffaf8', surface2: '#f8e2dc', ink: '#3b1812', ink2: '#74423a', line: '#f0d3cb',
      deep: '#5a2218', accent: '#f28b7d', accentInk: '#a8392a', onAccent: '#3a0e08',
      ...hero('#fff2ee', '#ebc1b8', '#ffa99d', '#fffaf8'),
    },
    dark: {
      bg: '#1e1210', surface: '#2c1b17', surface2: '#3a241f', ink: '#fbe9e4', ink2: '#d0a69d', line: '#4c3029',
      deep: '#4a2019', accent: '#f28b7d', accentInk: '#ffa99d', onAccent: '#3a0e08',
      ...hero('#fff2ee', '#ebc1b8', '#ffa99d', '#fffaf8'),
    },
    confetti: { shape: 'circle', text: '👣', colors: ['#f28b7d', '#ffa99d', '#5a2218', '#f8e2dc', '#f2c94c'] },
    copy: {
      heroEyebrow: 'WALK TIME',
      emptyMembers: '함께 걸을 동료를 먼저 추가해 주세요.',
      emptyHistory: '첫 산책을 기록하면 여기에 차곡차곡 쌓여요.',
      statsEmpty: '기록을 남기면 여기에 막대그래프가 그려져요.',
      kingEmpty: '이번 달엔 아직 기록이 없어요. 첫 번째 산책왕은 누구일까요?',
    },
  },
}

export const THEME_LABELS: Record<ThemeId, { label: string; emoji: string }> = Object.fromEntries(
  THEME_IDS.map((id) => [id, { label: THEMES[id].label, emoji: THEMES[id].emoji }]),
) as Record<ThemeId, { label: string; emoji: string }>

export const themeOf = (id: ThemeId): Theme => THEMES[id] ?? THEMES.coffee

/* ───────── CSS 변수 ───────── */

const rgbTriplet = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

/** 팔레트 → CSS 변수 (index.css의 토큰 이름과 같다) */
export function paletteVars(p: Palette, scheme: 'light' | 'dark'): Record<string, string> {
  return {
    '--bg': p.bg,
    '--surface': p.surface,
    '--surface-2': p.surface2,
    '--ink': p.ink,
    '--ink-2': p.ink2,
    '--line': p.line,
    '--espresso': p.deep,
    '--caramel': p.accent,
    '--caramel-ink': p.accentInk,
    '--on-caramel': p.onAccent,
    '--latte': p.heroInk2,
    '--hero-ink': p.heroInk,
    '--hero-ink-2': p.heroInk2,
    '--hero-accent': p.heroAccent,
    '--hero-surface': p.heroSurface,
    '--accent-rgb': rgbTriplet(p.accent),
    '--hero-glow': `rgb(${rgbTriplet(p.accent)} / ${scheme === 'dark' ? 0.16 : 0.28})`,
  }
}

export const themeVars = (id: ThemeId, scheme: 'light' | 'dark') => paletteVars(themeOf(id)[scheme], scheme)

const block = (selector: string, vars: Record<string, string>) =>
  `${selector}{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')}}`

/**
 * 커피 외 테마의 CSS. 커피는 index.css가 기본값이라 여기에 없다.
 * 라이트·다크는 시스템 설정(prefers-color-scheme)을 따른다.
 */
export function themeCss(): string {
  return THEME_IDS.filter((id) => id !== 'coffee')
    .map((id) => {
      const sel = `:root[data-theme="${id}"]`
      return `${block(sel, themeVars(id, 'light'))}@media (prefers-color-scheme: dark){${block(sel, themeVars(id, 'dark'))}}`
    })
    .join('\n')
}

/* ───────── 대비 (WCAG 2.x) ───────── */

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

export interface ContrastPair {
  name: string
  fg: string
  bg: string
  min: number
}

/** 글자 대비를 검사하는 짝 (본문·보조·버튼·포인트 글자·히어로·의미 색). 모두 AA(4.5:1) 이상이어야 한다 */
export function contrastPairs(id: ThemeId, scheme: 'light' | 'dark'): ContrastPair[] {
  const p = themeOf(id)[scheme]
  const s = SEMANTIC[scheme]
  const AA = 4.5
  return [
    { name: '본문 / 배경', fg: p.ink, bg: p.bg, min: AA },
    { name: '본문 / 카드', fg: p.ink, bg: p.surface, min: AA },
    { name: '본문 / 보조면', fg: p.ink, bg: p.surface2, min: AA },
    { name: '보조 글자 / 배경', fg: p.ink2, bg: p.bg, min: AA },
    { name: '보조 글자 / 카드', fg: p.ink2, bg: p.surface, min: AA },
    { name: '보조 글자 / 보조면', fg: p.ink2, bg: p.surface2, min: AA },
    { name: '버튼 글자 / 포인트색', fg: p.onAccent, bg: p.accent, min: AA },
    { name: '포인트 글자 / 배경', fg: p.accentInk, bg: p.bg, min: AA },
    { name: '포인트 글자 / 카드', fg: p.accentInk, bg: p.surface, min: AA },
    { name: '히어로 글자 / 진한 면', fg: p.heroInk, bg: p.deep, min: AA },
    { name: '히어로 보조 / 진한 면', fg: p.heroInk2, bg: p.deep, min: AA },
    { name: '히어로 포인트 글자 / 진한 면', fg: p.heroAccent, bg: p.deep, min: AA },
    { name: '휴가 글자 / 카드', fg: s.mintInk, bg: p.surface, min: AA },
    { name: '경고 글자 / 카드', fg: s.danger, bg: p.surface, min: AA },
  ]
}
