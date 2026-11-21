import type { AppData, Absence, CoffeeData, DateStr, Group, GroupView, Settings, Template } from '../types'

/** 그룹 이모지 선택지 */
export const GROUP_EMOJIS = ['☕', '🍱', '🧹', '📝', '🎤', '🛒', '🚗', '🎲', '🍚', '📚', '🧺', '🎁']

/** v1/v2 데이터를 옮길 때 만드는 "커피" 그룹의 고정 id (몇 번을 옮겨도 같은 결과가 되도록) */
export const COFFEE_GROUP_ID = 'g-coffee'

export const DEFAULT_SETTINGS: Settings = { buyerRule: 'count', defaultPriceMode: 'none' }

export const emptyCoffee = (): CoffeeData => ({
  orders: [],
  customMenus: [],
  priceList: [],
  settings: { ...DEFAULT_SETTINGS },
})

export const TEMPLATE_INFO: Record<Template, { label: string; emoji: string; defaultName: string; blurb: string }> = {
  coffee: { label: '커피', emoji: '☕', defaultName: '커피', blurb: '주문 취합, 금액 정산까지 지금 기능 전부' },
  general: { label: '일반', emoji: '🧹', defaultName: '청소', blurb: '순번만 돌려요 (점심·청소·회의록·발표 등)' },
}

export function newGroup(id: string, template: Template, name: string, emoji: string): Group {
  return {
    id,
    name,
    template,
    emoji,
    members: [],
    records: [],
    absences: [],
    skipDays: [],
    ...(template === 'coffee' ? { coffee: emptyCoffee() } : {}),
  }
}

/** 저장 구조(그룹) → 화면/로직이 쓰는 보기. 일반 템플릿의 커피 전용 값은 빈 기본값 */
export function groupToView(g: Group): GroupView {
  const c = g.template === 'coffee' ? (g.coffee ?? emptyCoffee()) : emptyCoffee()
  return {
    groupId: g.id,
    name: g.name,
    template: g.template,
    emoji: g.emoji,
    members: g.members,
    purchases: g.records,
    absences: g.absences,
    skipDays: g.skipDays,
    orders: c.orders,
    customMenus: c.customMenus,
    priceList: c.priceList,
    settings: c.settings,
  }
}

/** 보기에서 바뀐 값을 그룹에 되돌려 쓴다 (이름·이모지·템플릿은 보기로 바꾸지 않는다) */
export function applyView(g: Group, v: GroupView): Group {
  const base: Group = {
    id: g.id,
    name: g.name,
    template: g.template,
    emoji: g.emoji,
    members: v.members,
    records: v.purchases,
    absences: v.absences,
    skipDays: v.skipDays,
  }
  return g.template === 'coffee'
    ? { ...base, coffee: { orders: v.orders, customMenus: v.customMenus, priceList: v.priceList, settings: v.settings } }
    : base
}

/* ───────── 템플릿별 용어 (커피는 지금 문구 그대로) ───────── */

export interface Terms {
  heroEyebrow: string
  doneBadge: string
  lastLabel: string
  never: string
  doneBtn: string
  otherBtn: string
  changeBuyer: string
  whoSheet: string
  changeSheet: string
  recordNoun: string
  whoField: string
  calSuffix: string
  calHint: string
  emptyHistory: string
  emptyMembers: string
  kingEyebrow: string
  kingTitle: string
  kingCount: (n: number) => string
  kingEmpty: string
  countTitle: string
  statsEmpty: string
}

export const TERMS: Record<Template, Terms> = {
  coffee: {
    heroEyebrow: "TODAY'S BREW",
    doneBadge: '오늘 구매 완료',
    lastLabel: '마지막 구매',
    never: '아직 한 번도 안 샀어요',
    doneBtn: '샀어요',
    otherBtn: '다른 사람이 샀어요',
    changeBuyer: '구매자 변경',
    whoSheet: '누가 샀어요?',
    changeSheet: '구매자를 바꿀까요?',
    recordNoun: '구매 기록',
    whoField: '누가 샀나요?',
    calSuffix: ' 구매',
    calHint: '날짜를 누르면 그날의 구매 기록을 남길 수 있어요',
    emptyHistory: '첫 커피를 기록하면 여기에 차곡차곡 쌓여요.',
    emptyMembers: '함께 커피를 마실 동료를 먼저 추가해 주세요.',
    kingEyebrow: 'COFFEE KING',
    kingTitle: '이번 달 커피왕 👑',
    kingCount: (n) => `${n}번 샀어요`,
    kingEmpty: '이번 달엔 아직 기록이 없어요. 첫 번째 커피왕은 누구일까요?',
    countTitle: '1인당 구매 횟수',
    statsEmpty: '커피를 기록하면 여기에 막대그래프가 그려져요.',
  },
  general: {
    heroEyebrow: "TODAY'S TURN",
    doneBadge: '오늘 완료',
    lastLabel: '마지막 담당',
    never: '아직 한 번도 안 했어요',
    doneBtn: '했어요',
    otherBtn: '다른 사람이 했어요',
    changeBuyer: '담당자 변경',
    whoSheet: '누가 했어요?',
    changeSheet: '담당자를 바꿀까요?',
    recordNoun: '기록',
    whoField: '누가 했나요?',
    calSuffix: ' 담당',
    calHint: '날짜를 누르면 그날의 기록을 남길 수 있어요',
    emptyHistory: '첫 기록을 남기면 여기에 차곡차곡 쌓여요.',
    emptyMembers: '함께할 멤버를 먼저 추가해 주세요.',
    kingEyebrow: 'TOP TURN',
    kingTitle: '이번 달 가장 많이 한 사람 👑',
    kingCount: (n) => `${n}번 했어요`,
    kingEmpty: '이번 달엔 아직 기록이 없어요. 첫 번째 주인공은 누구일까요?',
    countTitle: '1인당 횟수',
    statsEmpty: '기록을 남기면 여기에 막대그래프가 그려져요.',
  },
}

/** 공유 텍스트 머리말: 커피는 지금 그대로 "☕", 일반은 "🧹 청소" */
export function sharePrefix(g: Pick<GroupView, 'template' | 'emoji' | 'name'>): string {
  return g.template === 'coffee' ? '☕' : `${g.emoji} ${g.name}`
}

/* ───────── 휴가 "모든 그룹에 적용" ───────── */

/** 이름 비교용: 앞뒤 공백을 없애고 한글 조합 방식을 통일 */
export const normalizeName = (s: string) => s.normalize('NFC').trim()

export interface AbsencePlan {
  items: { groupId: string; absence: Absence }[]
  noMatch: number // 같은 이름의 멤버가 없어 건너뛴 그룹 수
  ambiguous: number // 같은 이름이 둘 이상이라 건너뛴 그룹 수 (오적용 방지)
}

/**
 * 한 그룹의 멤버 휴가를 다른 그룹에도 적용하기 위한 계획.
 * 멤버는 그룹마다 따로라 이름이 같은 멤버로 연결한다. 이미 같은 휴가가 있으면 중복으로 만들지 않는다.
 */
export function planAbsenceAll(
  root: Pick<AppData, 'groups'>,
  sourceGroupId: string,
  memberId: string,
  from: DateStr,
  to: DateStr,
  makeId: () => string,
): AbsencePlan {
  const plan: AbsencePlan = { items: [], noMatch: 0, ambiguous: 0 }
  const src = root.groups.find((g) => g.id === sourceGroupId)
  const who = src?.members.find((m) => m.id === memberId)
  if (!src || !who) return plan
  const [f, t] = from <= to ? [from, to] : [to, from]
  const key = normalizeName(who.name)

  for (const g of root.groups) {
    let targetId: string
    if (g.id === sourceGroupId) targetId = memberId
    else {
      const matches = g.members.filter((m) => normalizeName(m.name) === key)
      if (matches.length === 0) {
        plan.noMatch++
        continue
      }
      if (matches.length > 1) {
        plan.ambiguous++
        continue
      }
      targetId = matches[0].id
    }
    if (g.absences.some((a) => a.memberId === targetId && a.from === f && a.to === t)) continue
    plan.items.push({ groupId: g.id, absence: { id: makeId(), memberId: targetId, from: f, to: t } })
  }
  return plan
}

/* ───────── 루트 데이터 변경 (스토어가 그대로 사용하는 순수 함수) ───────── */

/** 한 그룹의 보기를 바꾸는 변경을 루트에 반영. 없는 그룹이면 그대로 */
export function updateGroupView(root: AppData, gid: string, fn: (v: GroupView) => GroupView, now = Date.now()): AppData {
  if (!root.groups.some((g) => g.id === gid)) return root
  return { ...root, groups: root.groups.map((g) => (g.id === gid ? applyView(g, fn(groupToView(g))) : g)), updatedAt: now }
}

export function withGroupAdded(root: AppData, g: Group, now = Date.now()): AppData {
  return { ...root, groups: [...root.groups, g], updatedAt: now }
}

/** 이름·이모지 변경 (빈 이름은 무시). 템플릿은 바꾸지 않는다 */
export function withGroupEdited(
  root: AppData,
  id: string,
  patch: { name?: string; emoji?: string },
  now = Date.now(),
): AppData {
  return {
    ...root,
    groups: root.groups.map((g) =>
      g.id === id
        ? { ...g, name: patch.name !== undefined ? patch.name.trim() || g.name : g.name, emoji: patch.emoji || g.emoji }
        : g,
    ),
    updatedAt: now,
  }
}

/** 그룹 삭제. 마지막 하나이거나 없는 그룹이면 null (그룹은 항상 1개 이상) */
export function withGroupRemoved(
  root: AppData,
  id: string,
  now = Date.now(),
): { root: AppData; removed: Group; index: number } | null {
  const index = root.groups.findIndex((g) => g.id === id)
  if (index < 0 || root.groups.length <= 1) return null
  return { root: { ...root, groups: root.groups.filter((g) => g.id !== id), updatedAt: now }, removed: root.groups[index], index }
}

/** 삭제 되돌리기: 원래 자리에 다시 넣는다 (이미 있으면 그대로) */
export function withGroupRestored(root: AppData, removed: Group, index: number, now = Date.now()): AppData {
  if (root.groups.some((g) => g.id === removed.id)) return root
  return { ...root, groups: [...root.groups.slice(0, index), removed, ...root.groups.slice(index)], updatedAt: now }
}

export function withAbsencesAdded(root: AppData, items: AbsencePlan['items'], now = Date.now()): AppData {
  return {
    ...root,
    groups: root.groups.map((g) => {
      const add = items.filter((i) => i.groupId === g.id).map((i) => i.absence)
      return add.length ? { ...g, absences: [...g.absences, ...add] } : g
    }),
    updatedAt: now,
  }
}

export function withAbsencesRemoved(root: AppData, ids: ReadonlySet<string>, now = Date.now()): AppData {
  return { ...root, groups: root.groups.map((g) => ({ ...g, absences: g.absences.filter((a) => !ids.has(a.id)) })), updatedAt: now }
}
