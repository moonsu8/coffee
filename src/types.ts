export type DateStr = string // 'YYYY-MM-DD' (로컬 날짜)

/** 데이터 구조 버전. 구조를 바꿀 때마다 올리고 lib/migrate.ts에 이전 단계를 추가한다 */
export const SCHEMA_VERSION = 4

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

/**
 * 기능 묶음(화면·로직이 보는 값). 'coffee' = 금액·차액·가격표 기능을 켠 그룹(config.fairness === 'money'),
 * 'general' = 순번(횟수)만. 저장하지 않고 config에서 계산한다.
 */
export type Template = 'coffee' | 'general'

/** 담당하는 날: 평일(기본) / 매일 / 특정 요일(0=일 … 6=토) */
export type Schedule = 'weekdays' | 'daily' | number[]

/** 그룹 테마(색·일러스트·컨페티). 목록에서 고르기만 하고 자유 색상은 없다 */
export const THEME_IDS = ['coffee', 'lunch', 'notes', 'stage', 'clean', 'recycle', 'dishes', 'walk'] as const
export type ThemeId = (typeof THEME_IDS)[number]

/**
 * 그룹을 만들 때 템플릿에서 복사해 저장하는 값. 템플릿 상수를 나중에 바꿔도 기존 그룹은 변하지 않는다.
 */
export interface GroupConfig {
  presetId: string // 어떤 템플릿으로 만들었는지(참고용). 'coffee'면 커피 전용 문구를 그대로 쓴다
  actionLabel: string // 완료 버튼 문구 ("샀어요", "했어요" …)
  fairness: 'count' | 'money' // 공평함 기준: 횟수 / 금액(주문·금액·차액 기능)
  orders: boolean // 오늘의 주문(메뉴 취합) 사용. money일 때만 의미 있음
  memoPlaceholder: string
  shareFormat: string // 공유 텍스트 머리말. {emoji} {name} 치환
  themeId: ThemeId
}

/** 커피 템플릿에만 있는 데이터 */
export interface CoffeeData {
  orders: DayOrder[]
  customMenus: string[] // 프리셋 외에 사용자가 추가한 메뉴
  priceList: PriceEntry[] // 우리 팀 가격표
  settings: Settings
}

/** 돌아가며 하는 일 하나. 멤버·기록·휴가·쉬는 날은 그룹마다 따로 가진다 */
export interface Group {
  id: string
  name: string
  emoji: string
  config: GroupConfig
  schedule: Schedule
  members: Member[]
  records: Purchase[] // 날짜별 기록 (커피는 구매, 일반은 담당 기록). 날짜가 키
  absences: Absence[]
  skipDays: DateStr[]
  coffee?: CoffeeData // config.fairness가 'money'일 때만
}

/** 저장되는 전체 데이터 (v4) */
export interface AppData {
  schemaVersion: number
  groups: Group[] // 항상 1개 이상
  updatedAt: number // 마지막 수정 시각(ms). 내보낸 파일끼리 최신 여부를 구분하는 용도
}

/**
 * 화면이 쓰는 '현재 그룹'의 보기. v2까지의 데이터와 같은 모양(members, purchases, orders…)이라
 * 순번·주문·공평성 로직과 화면 코드를 그대로 쓸 수 있다. 일반 템플릿이면 커피 전용 값은 빈 기본값.
 */
export interface GroupView {
  groupId: string
  name: string
  template: Template // config에서 계산: money면 'coffee'
  emoji: string
  config: GroupConfig
  schedule: Schedule
  hasOrders: boolean // 오늘의 주문 기능 (money이면서 config.orders)
  members: Member[]
  purchases: Purchase[] // = group.records
  absences: Absence[]
  skipDays: DateStr[]
  orders: DayOrder[]
  customMenus: string[]
  priceList: PriceEntry[]
  settings: Settings
}
