import type { Group } from '../types'
import { defaultCoffeeGroup, groupToView, newGroup } from '../logic/groups'
import { configOf, presetById } from '../logic/templates'
import { migrate } from './migrate'

/**
 * 테스트 전용: 마이그레이션 결과의 첫 그룹(= v1/v2 데이터가 옮겨진 "커피" 그룹)을
 * v2까지의 데이터와 같은 모양으로 읽는다. v2 시절의 단언이 v3에서도 그대로 성립하는지 확인하는 용도.
 */
export function migrateView(input: unknown, now?: number) {
  const root = migrate(input, now)
  return { ...groupToView(root.groups[0]), schemaVersion: root.schemaVersion, updatedAt: root.updatedAt }
}

/** 테스트 전용: v3 시절의 newGroup(id, 'coffee'|'general', name, emoji)과 같은 그룹을 만든다 */
export function legacyGroup(id: string, template: 'coffee' | 'general', name: string, emoji: string) {
  const p = presetById(template === 'coffee' ? 'coffee' : 'custom')
  return newGroup(id, { name, emoji, config: configOf(p), schedule: 'weekdays' })
}

/** 값이 풍부한 커피 그룹: 금액(상세·간단), 주문, 가격표, 휴가, 쉬는 날, 기본 메뉴, 탈퇴한 멤버의 기록 */
export function richCoffeeGroup(): Group {
  const g = defaultCoffeeGroup()
  return {
    ...g,
    id: 'g-fix',
    name: '커피',
    emoji: '☕',
    schedule: [1, 2, 3, 4, 5],
    members: [
      { id: 'm1', name: '가람', order: 1, color: '#C8553D', emoji: '🐻', favorite: { menu: '아메리카노', temp: 'ice', size: 'M', shot: 1, memo: '연하게' } },
      { id: 'm2', name: '나래', order: 2 },
      { id: 'm3', name: '다온', order: 5, color: '#5F86A6' },
    ],
    records: [
      { date: '2026-11-16', memberId: 'm1', memo: '첫 기록' },
      {
        date: '2026-11-17',
        memberId: 'm2',
        pricing: {
          mode: 'detail',
          total: 9500,
          lines: [
            { memberId: 'm1', menu: '아메리카노', temp: 'ice', size: 'M', price: 4500 },
            { memberId: 'm2', menu: '라떼', temp: 'hot', price: 5000 },
          ],
        },
      },
      { date: '2026-11-18', memberId: 'gone', pricing: { mode: 'simple', total: 12000, participants: ['m1', 'gone', 'm3'] } }, // 탈퇴한 멤버
    ],
    absences: [{ id: 'a1', memberId: 'm3', from: '2026-11-19', to: '2026-11-20' }],
    skipDays: ['2026-12-25'],
    coffee: {
      orders: [
        {
          date: '2026-11-17',
          updatedAt: 1763000000000,
          items: [
            { memberId: 'm1', menu: '아메리카노', temp: 'ice', size: 'M' },
            { memberId: 'm2', menu: '안 마심', temp: 'ice', skipped: true },
          ],
        },
      ],
      customMenus: ['유자차'],
      priceList: [{ cafeBrandId: 'default', menu: '아메리카노', temp: 'ice', size: 'M', price: 4500, updatedAt: 1763000000000 }],
      settings: { buyerRule: 'balance', defaultPriceMode: 'detail', balanceSince: '2026-11-01' },
    },
  }
}

export const richGeneralGroup = (): Group => ({
  ...legacyGroup('g-gen', 'general', '청소', '🧹'),
  members: [{ id: 'x1', name: '라온', order: 1 }],
  records: [{ date: '2026-11-17', memberId: 'x1', memo: '화장실' }],
})
