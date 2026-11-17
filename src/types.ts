export type DateStr = string // 'YYYY-MM-DD' (로컬 날짜)

export interface Member {
  id: string
  name: string
  order: number
  color?: string // 멤버 고유 색상 (hex)
  emoji?: string // 아바타 이모지
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
export interface AppData {
  members: Member[]
  purchases: Purchase[]
  absences: Absence[]
  skipDays: DateStr[]
}
