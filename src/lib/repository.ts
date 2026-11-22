import type { AppData } from '../types'
import {
  applyRecovery,
  fetchInitial,
  loadInitialData,
  readActiveGroup,
  restoreLastGood,
  saveData,
  writeActiveGroup,
  type LoadResult,
  type Recovery,
  type StorageLike,
} from './data'

/**
 * 이 기기에 저장되는 전체 데이터의 저장 계층. 스토어는 저장소 종류를 모르고 이 인터페이스만 쓴다.
 * 지금 구현은 localStorage(`localRepository`)뿐이다. 서버 그룹(공유)은 그룹 단위라 모양이 달라서
 * `logic/remote-map.ts`의 diff/행 변환을 쓰는 별도 계층(1-C)으로 붙이고, 이 로컬 계층은 그대로 둔다.
 *
 * 마이그레이션·shadow·복구·미래 버전 차단·옛 앱 보호 표식은 모두 `lib/data.ts`/`lib/migrate.ts` 안에 그대로 있다.
 * 여기서는 그 함수들을 감싸 부를 뿐이다(저장 형식이 바뀌지 않는다).
 */
export interface AppRepository {
  readonly kind: 'local'
  /** 저장된 데이터를 읽는다(없으면 초기 데이터). 복구 질문·저장 금지 상태도 함께 돌려준다 */
  load(): Promise<LoadResult>
  /** 메인과 shadow에 함께 저장 */
  save(data: AppData): void
  /** 복구 질문에 대한 선택 적용 */
  applyRecovery(choice: 'restore' | 'keep', recovery: Recovery, current: AppData): { data: AppData; ok: boolean }
  /** 마지막 정상 상태(shadow)로 되돌림. 되돌릴 상태가 없거나 보관 실패면 null */
  restoreLastGood(current: AppData): AppData | null
  /** 배포본의 초기 데이터 */
  loadInitial(): Promise<AppData>
  /** 이 기기에서 보고 있는 그룹(화면 상태) */
  readActiveGroup(): string | null
  writeActiveGroup(id: string): void
}

/**
 * storage를 넣으면 그 저장소를, 안 넣으면(undefined) 브라우저 localStorage를 쓴다(테스트에서 메모리 저장소로 교체).
 * undefined를 그대로 넘기면 data.ts 함수의 기본값(브라우저 저장소)이 적용된다.
 */
export function createLocalRepository(storage?: StorageLike | null): AppRepository {
  return {
    kind: 'local',
    load: () => loadInitialData(storage),
    save: (data) => saveData(data, storage),
    applyRecovery: (choice, recovery, current) => applyRecovery(choice, recovery, current, storage),
    restoreLastGood: (current) => restoreLastGood(current, storage),
    loadInitial: fetchInitial,
    readActiveGroup: () => readActiveGroup(storage),
    writeActiveGroup: (id) => writeActiveGroup(id, storage),
  }
}

export const localRepository: AppRepository = createLocalRepository()

/** 지금 보고 있는 그룹이 어디에 저장되고 누가 쓸 수 있는지. 로컬 그룹은 항상 쓸 수 있다 */
export interface Access {
  kind: 'local' | 'remote'
  /** 서버 그룹: 그룹장이고 인터넷이 연결돼 있을 때만 true */
  role?: 'owner' | 'viewer'
  canWrite: boolean
  /** 서버 그룹의 마지막 동기화 시각(ms). 로컬은 null */
  lastSyncedAt: number | null
}
export const LOCAL_ACCESS: Access = { kind: 'local', canWrite: true, lastSyncedAt: null }
