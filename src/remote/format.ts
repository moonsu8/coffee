import { addDays } from '../logic/dates'

const p2 = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`

/** "마지막 업데이트" 표시용 시각: 오늘 → "오후 3:05", 어제 → "어제 오후 3:05", 그 밖 → "11/17 오후 3:05" */
export function formatSyncTime(at: number, now: Date = new Date()): string {
  const d = new Date(at)
  const h = d.getHours()
  const clock = `${h < 12 ? '오전' : '오후'} ${h % 12 === 0 ? 12 : h % 12}:${p2(d.getMinutes())}`
  const day = ymd(d)
  const today = ymd(now)
  if (day === today) return clock
  if (day === addDays(today, -1)) return `어제 ${clock}`
  return `${d.getMonth() + 1}/${d.getDate()} ${clock}`
}
