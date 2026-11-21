import { groupToView } from '../logic/groups'
import { migrate } from './migrate'

/**
 * 테스트 전용: 마이그레이션 결과의 첫 그룹(= v1/v2 데이터가 옮겨진 "커피" 그룹)을
 * v2까지의 데이터와 같은 모양으로 읽는다. v2 시절의 단언이 v3에서도 그대로 성립하는지 확인하는 용도.
 */
export function migrateView(input: unknown, now?: number) {
  const root = migrate(input, now)
  return { ...groupToView(root.groups[0]), schemaVersion: root.schemaVersion, updatedAt: root.updatedAt }
}
