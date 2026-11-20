export type DateStr = string // 'YYYY-MM-DD' (로컬 날짜)

/** 데이터 구조 버전. 구조를 바꿀 때마다 올리고 lib/migrate.ts에 이전 단계를 추가한다 */
export const SCHEMA_VERSION = 2

export type Temp = 'ice' | 'hot'
export type Size = 'S' | 'M' | 'L'

/** 한 잔의 주문 내용 */
export interface Order {
  menu: string // 프리셋 이름 또는 사용자 추가 메뉴 이름
  temp: Temp
  size?: Size
  shot?: number // 추가 샷 수 (UI에서는 0/1)
  memo?: string
}

export interface Member {
  id: string
  name: string
  order: number
  color?: string // 멤버 고유 색상 (hex)
  emoji?: string // 아바타 이모지
  favorite?: Order // 기본 메뉴
}
export interface Purchase {
  date: DateStr // 하루 1건 (date가 키)
  memberId: string
  memo?: string
}
export interface Absence {
  id: string
  memberId: string
  from: DateStr
  to: DateStr
}

export interface OrderItem extends Order {
  memberId: string
  skipped?: boolean // 오늘은 안 마심
}
/** 하루의 주문. items는 기본 메뉴(favorite)보다 우선하는 값 */
export interface DayOrder {
  date: DateStr
  items: OrderItem[]
  updatedAt: number
}

export interface AppData {
  schemaVersion: number
  members: Member[]
  purchases: Purchase[]
  absences: Absence[]
  skipDays: DateStr[]
  orders: DayOrder[]
  customMenus: string[] // 프리셋 외에 사용자가 추가한 메뉴
  updatedAt: number // 마지막 수정 시각(ms). 내보낸 파일끼리 최신 여부를 구분하는 용도
}
