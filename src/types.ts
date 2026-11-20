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
/** 금액 기록 방식. 기록에 pricing이 없으면 'none'(금액 없음) */
export type PriceMode = 'none' | 'detail' | 'simple'
export type BuyerRule = 'count' | 'balance'
export const DEFAULT_BRAND = 'default' // 카페 브랜드 개념이 생기기 전까지 쓰는 고정 ID

/** 우리 팀 가격표 한 줄. 사용자가 입력한 값만 저장한다 (앱이 가격을 제공하지 않음) */
export interface PriceEntry {
  cafeBrandId: string
  menu: string
  temp: Temp
  size: string // 사이즈를 안 고르면 ''
  price: number // 원
  updatedAt: number
}
export interface PricingLine {
  memberId: string
  menu: string
  temp: Temp
  size?: Size
  price: number
}
/** 구매 금액. 기록 시점의 메뉴·가격을 그대로 굳혀서 저장 (가격표를 나중에 고쳐도 지난 계산은 불변) */
export interface Pricing {
  mode: 'detail' | 'simple'
  total: number // 영수증 총액(원)
  lines?: PricingLine[] // detail: 메뉴별 가격
  participants?: string[] // simple: 마신 사람
}

export interface Purchase {
  date: DateStr // 하루 1건 (date가 키)
  memberId: string
  memo?: string
  pricing?: Pricing
}

export interface Settings {
  buyerRule: BuyerRule // 당번 기준: 횟수(기본) / 차액
  defaultPriceMode: PriceMode // [샀어요] 때 금액 입력 방식의 기본값
  balanceSince?: DateStr // 차액 계산 시작일(포함). 이 날짜 이후 기록만 당번 계산에 쓴다
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
  priceList: PriceEntry[] // 우리 팀 가격표
  settings: Settings
  updatedAt: number // 마지막 수정 시각(ms). 내보낸 파일끼리 최신 여부를 구분하는 용도
}
