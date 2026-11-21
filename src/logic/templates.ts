import type { GroupConfig, Schedule, ThemeId } from '../types'

/** 테마 이름(목록에서 고르는 용도) */
export const THEME_LABELS: Record<ThemeId, { label: string; emoji: string }> = {
  coffee: { label: '커피', emoji: '☕' },
  lunch: { label: '점심', emoji: '🍱' },
  notes: { label: '회의록', emoji: '📝' },
  stage: { label: '무대', emoji: '🎤' },
  clean: { label: '청소', emoji: '🧹' },
  recycle: { label: '분리수거', emoji: '♻️' },
  dishes: { label: '설거지', emoji: '🍽️' },
  walk: { label: '산책', emoji: '🚶' },
}

/**
 * 템플릿 프리셋(코드 상수). 그룹을 만들 때 값이 그룹에 복사되므로
 * 여기를 나중에 바꿔도 이미 만든 그룹은 변하지 않는다.
 */
export interface TemplatePreset {
  id: string
  name: string // 기본 그룹 이름
  emoji: string
  blurb: string
  actionLabel: string
  schedule: Schedule
  fairness: 'count' | 'money'
  orders: boolean
  memoPlaceholder: string
  shareFormat: string
  themeId: ThemeId
}

export const CUSTOM_PRESET_ID = 'custom'
export const SHARE_WITH_NAME = '{emoji} {name}'

const base = { orders: false, shareFormat: SHARE_WITH_NAME, memoPlaceholder: '예) 간단한 메모' } as const

export const PRESETS: TemplatePreset[] = [
  {
    id: 'coffee',
    name: '커피',
    emoji: '☕',
    blurb: '주문 취합·금액 정산까지',
    actionLabel: '샀어요',
    schedule: 'weekdays',
    fairness: 'money',
    orders: true,
    memoPlaceholder: '예) 아아 6잔, 디저트 포함',
    shareFormat: '☕',
    themeId: 'coffee',
  },
  {
    id: 'lunch',
    name: '점심 쏘기',
    emoji: '🍱',
    blurb: '금액·차액으로 공평하게',
    actionLabel: '쐈어요',
    schedule: 'weekdays',
    fairness: 'money',
    ...base,
    memoPlaceholder: '예) 김치찜 6인',
    themeId: 'lunch',
  },
  {
    id: 'notes',
    name: '회의록',
    emoji: '📝',
    blurb: '회의록 쓰는 사람 돌려막기',
    actionLabel: '썼어요',
    schedule: 'weekdays',
    fairness: 'count',
    ...base,
    memoPlaceholder: '예) 주간 회의',
    themeId: 'notes',
  },
  {
    id: 'stage',
    name: '발표',
    emoji: '🎤',
    blurb: '돌아가며 발표해요',
    actionLabel: '발표했어요',
    schedule: [5],
    fairness: 'count',
    ...base,
    memoPlaceholder: '예) 발표 주제',
    themeId: 'stage',
  },
  {
    id: 'clean',
    name: '청소',
    emoji: '🧹',
    blurb: '청소 당번',
    actionLabel: '청소했어요',
    schedule: 'weekdays',
    fairness: 'count',
    ...base,
    themeId: 'clean',
  },
  {
    id: 'recycle',
    name: '분리수거',
    emoji: '♻️',
    blurb: '분리수거 당번',
    actionLabel: '버렸어요',
    schedule: [3],
    fairness: 'count',
    ...base,
    themeId: 'recycle',
  },
  {
    id: 'dishes',
    name: '설거지',
    emoji: '🍽️',
    blurb: '설거지 당번',
    actionLabel: '설거지했어요',
    schedule: 'weekdays',
    fairness: 'count',
    ...base,
    themeId: 'dishes',
  },
  {
    id: 'walk',
    name: '산책',
    emoji: '🚶',
    blurb: '산책 같이 가는 순서',
    actionLabel: '다녀왔어요',
    schedule: 'weekdays',
    fairness: 'count',
    ...base,
    themeId: 'walk',
  },
  {
    id: CUSTOM_PRESET_ID,
    name: '내 그룹',
    emoji: '✨',
    blurb: '이름·버튼 문구·요일·기준을 직접',
    actionLabel: '했어요',
    schedule: 'weekdays',
    fairness: 'count',
    ...base,
    themeId: 'coffee',
  },
]

export const presetById = (id: string): TemplatePreset => PRESETS.find((p) => p.id === id) ?? PRESETS[PRESETS.length - 1]

/** 프리셋 → 그룹에 복사해 저장할 값 */
export function configOf(p: Pick<TemplatePreset, 'id' | 'actionLabel' | 'fairness' | 'orders' | 'memoPlaceholder' | 'shareFormat' | 'themeId'>): GroupConfig {
  return {
    presetId: p.id,
    actionLabel: p.actionLabel,
    fairness: p.fairness,
    orders: p.fairness === 'money' && p.orders, // 주문은 금액 기능이 있을 때만
    memoPlaceholder: p.memoPlaceholder,
    shareFormat: p.shareFormat,
    themeId: p.themeId,
  }
}
