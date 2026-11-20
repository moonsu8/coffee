import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AppData, DateStr, DayOrder, Member, Order, OrderItem, Purchase, Settings } from '../types'
import { EMPTY_DATA, loadInitialData, parseAppData, saveData } from '../lib/data'
import { suggestStyle } from '../lib/members'
import { uid } from '../lib/utils'
import { today as todayStr } from '../logic/dates'
import { nextSettlementDate, priceKey, upsertPrices, type PriceInput } from '../logic/fairness'

type MemberPatch = Partial<Pick<Member, 'name' | 'color' | 'emoji'>> & { favorite?: Order | null }

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
  addMember: (m: Pick<Member, 'name' | 'color' | 'emoji'> & { favorite?: Order }) => void
  updateMember: (id: string, patch: MemberPatch) => void
  removeMember: (id: string) => void
  reorderMembers: (ids: string[]) => void
  /** 그날 한 명의 주문을 (기본 메뉴 대신) 따로 저장. 되돌리기 함수를 반환 */
  saveOrderItem: (date: DateStr, item: OrderItem) => () => void
  /** 그날 한 명의 따로 저장한 주문을 지워 기본 메뉴로 되돌림 */
  resetOrderItem: (date: DateStr, memberId: string) => () => void
  /** 공유(복사) 시점의 최종 주문을 그날 기록으로 굳힘 */
  snapshotOrder: (date: DateStr, items: OrderItem[]) => void
  addCustomMenu: (name: string) => void
  removeCustomMenu: (name: string) => void
  /** 가격표에 저장 (새 항목은 추가, 같은 항목은 가격 갱신) */
  savePrices: (inputs: PriceInput[]) => void
  removePrice: (key: string) => void
  /** 당번 기준 등 설정. 차액 기준을 켜면 balanceSince가 없을 때 오늘로 정하고, 금액 기본값 '없음'은 '상세'로 바꾼다 */
  setSettings: (patch: Partial<Settings>) => void
  /** 정산 완료: 이 시점까지의 기록은 빼고 다시 계산 (balanceSince 갱신) */
  settleBalance: () => void
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
  const [blocked, setBlocked] = useState<string | undefined>()
  const [today, setToday] = useState(todayStr())
  const ref = useRef(data)
  ref.current = data

  useEffect(() => {
    loadInitialData().then((r) => {
      setData(r.data)
      setBlocked(r.blocked)
      setReady(true)
    })
  }, [])

  useEffect(() => {
    if (ready && !blocked) saveData(data)
  }, [data, ready, blocked])

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

  // 모든 변경은 updatedAt을 갱신한다
  const set = useCallback((fn: (d: AppData) => AppData) => setData((d) => ({ ...fn(d), updatedAt: Date.now() })), [])

  const store = useMemo<Store>(() => {
    const putPurchase = (p: Purchase | undefined, date: DateStr) =>
      set((d) => {
        const rest = d.purchases.filter((x) => x.date !== date)
        return { ...d, purchases: p ? [...rest, p].sort((a, b) => (a.date < b.date ? -1 : 1)) : rest }
      })
    const putDay = (day: DayOrder | undefined, date: DateStr) =>
      set((d) => {
        const rest = d.orders.filter((x) => x.date !== date)
        return { ...d, orders: day && day.items.length ? [...rest, day].sort((a, b) => (a.date < b.date ? -1 : 1)) : rest }
      })
    const dayOf = (date: DateStr) => ref.current.orders.find((o) => o.date === date)

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
              {
                id: uid(),
                name: m.name.trim(),
                order,
                color: m.color ?? style.color,
                emoji: m.emoji ?? style.emoji,
                ...(m.favorite ? { favorite: m.favorite } : {}),
              },
            ],
          }
        }),
      updateMember: (id, patch) =>
        set((d) => ({
          ...d,
          members: d.members.map((m) => {
            if (m.id !== id) return m
            const { favorite, ...rest } = patch
            const next: Member = {
              ...m,
              ...rest,
              name: rest.name !== undefined ? rest.name.trim() || m.name : m.name,
            }
            if (favorite === null) delete next.favorite
            else if (favorite) next.favorite = favorite
            return next
          }),
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

      saveOrderItem: (date, item) => {
        const prev = dayOf(date)
        const items = [...(prev?.items ?? []).filter((i) => i.memberId !== item.memberId), item]
        putDay({ date, items, updatedAt: Date.now() }, date)
        return () => putDay(prev, date)
      },
      resetOrderItem: (date, memberId) => {
        const prev = dayOf(date)
        const items = (prev?.items ?? []).filter((i) => i.memberId !== memberId)
        putDay({ date, items, updatedAt: Date.now() }, date)
        return () => putDay(prev, date)
      },
      snapshotOrder: (date, items) => putDay({ date, items, updatedAt: Date.now() }, date),

      addCustomMenu: (name) => {
        const n = name.trim()
        if (n) set((d) => (d.customMenus.includes(n) ? d : { ...d, customMenus: [...d.customMenus, n] }))
      },
      removeCustomMenu: (name) => set((d) => ({ ...d, customMenus: d.customMenus.filter((m) => m !== name) })),

      savePrices: (inputs) => {
        if (inputs.length) set((d) => ({ ...d, priceList: upsertPrices(d.priceList, inputs, Date.now()) }))
      },
      removePrice: (key) => set((d) => ({ ...d, priceList: d.priceList.filter((e) => priceKey(e) !== key) })),
      setSettings: (patch) =>
        set((d) => {
          const s = { ...d.settings, ...patch }
          if (patch.buyerRule === 'balance') {
            if (!s.balanceSince) s.balanceSince = todayStr()
            if (s.defaultPriceMode === 'none') s.defaultPriceMode = 'detail'
          }
          return { ...d, settings: s }
        }),
      settleBalance: () =>
        set((d) => ({ ...d, settings: { ...d.settings, balanceSince: nextSettlementDate(todayStr(), d.purchases) } })),

      importJson: (text) => {
        setData(parseAppData(JSON.parse(text))) // 실패(형식 오류·미래 버전)하면 throw → 호출측에서 안내
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
  if (blocked) {
    return (
      <div className="mx-auto flex h-dvh max-w-[430px] flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="text-xl font-bold">앱을 업데이트해 주세요</p>
        <p className="text-[15px] leading-relaxed text-ink-2">{blocked}</p>
        <p className="text-sm text-ink-2">저장된 기록은 그대로 안전해요. 이 화면에서는 아무것도 덮어쓰지 않아요.</p>
        <button onClick={() => location.reload()} className="mt-2 min-h-12 rounded-2xl bg-caramel px-6 font-bold text-on-caramel">
          다시 불러오기
        </button>
      </div>
    )
  }
  return <Ctx.Provider value={store}>{children}</Ctx.Provider>
}
