import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AppData, DateStr, Member, Purchase } from '../types'
import { EMPTY_DATA, loadInitialData, parseAppData, saveData } from '../lib/data'
import { suggestStyle } from '../lib/members'
import { uid } from '../lib/utils'
import { today as todayStr } from '../logic/dates'

interface Store {
  data: AppData
  today: DateStr
  memberById: (id: string) => Member | undefined
  /** 구매 기록 등록/수정(날짜가 키). 되돌리기 함수를 반환 */
  savePurchase: (p: Purchase) => () => void
  removePurchase: (date: DateStr) => () => void
  addAbsence: (memberId: string, from: DateStr, to: DateStr) => () => void
  removeAbsence: (id: string) => () => void
  addSkipDay: (date: DateStr) => void
  removeSkipDay: (date: DateStr) => void
  addMember: (m: Pick<Member, 'name' | 'color' | 'emoji'>) => void
  updateMember: (id: string, patch: Partial<Pick<Member, 'name' | 'color' | 'emoji'>>) => void
  removeMember: (id: string) => void
  reorderMembers: (ids: string[]) => void
  importJson: (text: string) => void
  resetToInitial: () => Promise<void>
}

const Ctx = createContext<Store | null>(null)

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider 밖에서 useStore를 썼어요')
  return s
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY_DATA)
  const [ready, setReady] = useState(false)
  const [today, setToday] = useState(todayStr())
  const ref = useRef(data)
  ref.current = data

  useEffect(() => {
    loadInitialData().then((d) => {
      setData(d)
      setReady(true)
    })
  }, [])

  useEffect(() => {
    if (ready) saveData(data)
  }, [data, ready])

  // 자정을 넘기거나 앱으로 돌아왔을 때 '오늘' 갱신
  useEffect(() => {
    const tick = () => setToday((t) => (todayStr() === t ? t : todayStr()))
    const id = setInterval(tick, 30_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])

  const set = useCallback((fn: (d: AppData) => AppData) => setData((d) => fn(d)), [])

  const store = useMemo<Store>(() => {
    const putPurchase = (p: Purchase | undefined, date: DateStr) =>
      set((d) => {
        const rest = d.purchases.filter((x) => x.date !== date)
        return { ...d, purchases: p ? [...rest, p].sort((a, b) => (a.date < b.date ? -1 : 1)) : rest }
      })

    return {
      data,
      today,
      memberById: (id) => data.members.find((m) => m.id === id),

      savePurchase: (p) => {
        const prev = ref.current.purchases.find((x) => x.date === p.date)
        putPurchase({ ...p, memo: p.memo?.trim() || undefined }, p.date)
        return () => putPurchase(prev, p.date)
      },
      removePurchase: (date) => {
        const prev = ref.current.purchases.find((x) => x.date === date)
        putPurchase(undefined, date)
        return () => putPurchase(prev, date)
      },

      addAbsence: (memberId, from, to) => {
        const [f, t] = from <= to ? [from, to] : [to, from]
        const a = { id: uid(), memberId, from: f, to: t }
        set((d) => ({ ...d, absences: [...d.absences, a] }))
        return () => set((d) => ({ ...d, absences: d.absences.filter((x) => x.id !== a.id) }))
      },
      removeAbsence: (id) => {
        const prev = ref.current.absences.find((x) => x.id === id)
        set((d) => ({ ...d, absences: d.absences.filter((x) => x.id !== id) }))
        return () => {
          if (prev) set((d) => ({ ...d, absences: [...d.absences, prev] }))
        }
      },

      addSkipDay: (date) => set((d) => (d.skipDays.includes(date) ? d : { ...d, skipDays: [...d.skipDays, date].sort() })),
      removeSkipDay: (date) => set((d) => ({ ...d, skipDays: d.skipDays.filter((x) => x !== date) })),

      addMember: (m) =>
        set((d) => {
          const style = suggestStyle(d.members)
          const order = d.members.reduce((mx, x) => Math.max(mx, x.order), 0) + 1
          return {
            ...d,
            members: [
              ...d.members,
              { id: uid(), name: m.name.trim(), order, color: m.color ?? style.color, emoji: m.emoji ?? style.emoji },
            ],
          }
        }),
      updateMember: (id, patch) =>
        set((d) => ({
          ...d,
          members: d.members.map((m) =>
            m.id === id ? { ...m, ...patch, name: patch.name !== undefined ? patch.name.trim() || m.name : m.name } : m,
          ),
        })),
      removeMember: (id) =>
        set((d) => ({
          ...d,
          members: d.members.filter((m) => m.id !== id).map((m, i) => ({ ...m, order: i + 1 })),
          absences: d.absences.filter((a) => a.memberId !== id),
        })),
      reorderMembers: (ids) =>
        set((d) => ({
          ...d,
          members: ids
            .map((id, i) => {
              const m = d.members.find((x) => x.id === id)
              return m ? { ...m, order: i + 1 } : null
            })
            .filter((m): m is Member => m !== null),
        })),

      importJson: (text) => {
        const parsed = parseAppData(JSON.parse(text)) // 실패하면 throw → 호출측에서 안내
        setData(parsed)
      },
      resetToInitial: async () => {
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}data.json`, { cache: 'no-cache' })
          setData(res.ok ? parseAppData(await res.json()) : EMPTY_DATA)
        } catch {
          setData(EMPTY_DATA)
        }
      },
    }
  }, [data, today, set])

  if (!ready) return null
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}
