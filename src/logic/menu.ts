import type { Order, Temp } from '../types'

export interface MenuPreset {
  name: string // 선택지에 보이는 이름 (저장되는 값)
  short: string // 집계 줄에 쓰는 이름
  iceAlias?: string // 아이스일 때 개인별 줄에서 쓰는 줄임말 (예: 아아)
  defaultTemp: Temp // 이 온도는 개인별 줄에서 괄호 표기를 생략
  fixedTemp?: Temp // 온도 선택이 없는 메뉴
}

export const NO_DRINK = '안 마심'

export const PRESET_MENUS: MenuPreset[] = [
  { name: '아메리카노', short: '아메리카노', iceAlias: '아아', defaultTemp: 'ice' },
  { name: '카페라떼', short: '라떼', defaultTemp: 'ice' },
  { name: '바닐라라떼', short: '바닐라라떼', defaultTemp: 'ice' },
  { name: '콜드브루', short: '콜드브루', defaultTemp: 'ice', fixedTemp: 'ice' },
  { name: '디카페인 아메리카노', short: '디카페인 아메리카노', iceAlias: '디카페인 아아', defaultTemp: 'ice' },
  { name: '차/티', short: '차/티', defaultTemp: 'hot' },
]

export function findPreset(menu: string): MenuPreset | undefined {
  return PRESET_MENUS.find((p) => p.name === menu)
}

/** 선택지 전체: 프리셋 → 사용자 추가 → 안 마심 */
export function allMenus(customMenus: string[]): string[] {
  return [...PRESET_MENUS.map((p) => p.name), ...customMenus.filter((m) => !findPreset(m) && m !== NO_DRINK), NO_DRINK]
}

export const TEMP_LABEL: Record<Temp, string> = { ice: '아이스', hot: '따뜻한' }

export function isNoDrink(o: { menu: string; skipped?: boolean }): boolean {
  return !!o.skipped || o.menu === NO_DRINK
}

/** 온도를 고를 수 없는 메뉴면 그 온도로 고정 */
export function normalizeTemp(menu: string, temp: Temp): Temp {
  return findPreset(menu)?.fixedTemp ?? temp
}

/** 같은 주문인지 판단하는 키 (메모는 제외: 묶음이 쪼개지지 않게) */
export function orderKey(o: Order): string {
  return [o.menu, normalizeTemp(o.menu, o.temp), o.size ?? '', o.shot ?? 0].join('|')
}
