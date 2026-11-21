import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { AppData, DateStr, DayOrder, Group, GroupView, Member, Order, OrderItem, Purchase, Settings, Template } from '../types'
import { applyRecovery, EMPTY_DATA, loadInitialData, parseAppData, readActiveGroup, restoreLastGood as restoreShadow, saveData, writeActiveGroup, type Recovery } from '../lib/data'
import { formatSavedAt } from '../lib/format'
import { Button } from '../components/ui/button'
import { Sheet } from '../components/ui/sheet'
import { suggestStyle } from '../lib/members'
import { uid } from '../lib/utils'
import { today as todayStr } from '../logic/dates'
import {
  groupToView,
  newGroup,
  planAbsenceAll,
  TEMPLATE_INFO,
  TERMS,
  updateGroupView,
  withAbsencesAdded,
  withAbsencesRemoved,
  withGroupAdded,
  withGroupEdited,
  withGroupRemoved,
  withGroupRestored,
  type Terms,
} from '../logic/groups'
import { applySettingsPatch, nextSettlementDate, priceKey, upsertPrices, type PriceInput } from '../logic/fairness'

type MemberPatch = Partial<Pick<Member, 'name' | 'color' | 'emoji'>> & { favorite?: Order | null }

interface Store {
  /** 지금 보고 있는 그룹의 데이터 (v2까지의 데이터와 같은 모양) */
  data: GroupView
  /** 저장되는 전체 데이터 (내보내기용) */
  root: AppData
  groups: Group[]
  /** 현재 그룹 템플릿의 용어 (커피는 지금 문구 그대로) */
  terms: Terms
  switchGroup: (id: string) => void
  /** 새 그룹을 만들고 그 그룹으로 이동. 새 id를 반환 */
  addGroup: (g: { name: string; emoji: string; template: Template }) => string
  updateGroup: (id: string, patch: { name?: string; emoji?: string }) => void
  /** 그룹 삭제(마지막 하나는 삭제 불가 → null). 되돌리기 함수를 반환 */
  removeGroup: (id: string) => (() => void) | null
  /** 현재 그룹의 휴가를, 이름이 같은 멤버가 있는 모든 그룹에 등록 */
  addAbsenceAll: (
    memberId: string,
    from: DateStr,
    to: DateStr,
  ) => { applied: number; noMatch: number; ambiguous: number; undo: () => void }
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
  /** 마지막 정상 상태(shadow)로 되돌림. 되돌릴 상태가 없거나 보관에 실패하면 false */
  restoreLastGood: () => boolean
}

const Ctx = createContext<Store | null>(null)

export function useStore(): Store {
  const s = useContext(Ctx)
  if (!s) throw new Error('StoreProvider 밖에서 useStore를 썼어요')
  return s
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [root, setRoot] = useState<AppData>(EMPTY_DATA)
  // 이 기기에서 보고 있는 그룹 (데이터가 아니라 화면 상태라 데이터·섀도를 다시 쓰지 않는다)
  const [activeId, setActiveId] = useState<string | null>(() => readActiveGroup())
  const [ready, setReady] = useState(false)
  const [blocked, setBlocked] = useState<string | undefined>()
  // 옛 버전 앱이 덮어썼을 가능성이 있을 때: 사용자가 고르기 전까지 저장하지 않는다
  const [recovery, setRecovery] = useState<Recovery | undefined>()
  const [recoveryFailed, setRecoveryFailed] = useState(false)
  const [today, setToday] = useState(todayStr())
  const rootRef = useRef(root)
  rootRef.current = root
  const group = root.groups.find((g) => g.id === activeId) ?? root.groups[0]
  const data = useMemo(() => groupToView(group), [group])

  useEffect(() => {
    loadInitialData().then((r) => {
      setRoot(r.data)
      setBlocked(r.blocked)
      setRecovery(r.recovery)
      setReady(true)
    })
  }, [])

  useEffect(() => {
    if (ready && !blocked && !recovery) saveData(root)
  }, [root, ready, blocked, recovery])

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

  const store = useMemo<Store>(() => {
    // 모든 변경은 '만들어질 때의 그룹'에 묶인다: 되돌리기(undo)가 그룹을 바꾼 뒤에 눌려도 엉뚱한 그룹을 건드리지 않는다.
    // 그리고 updatedAt을 갱신한다.
    const gid = group.id
    const set = (fn: (v: GroupView) => GroupView) => setRoot((r) => updateGroupView(r, gid, fn))
    const cur = () => groupToView(rootRef.current.groups.find((g) => g.id === gid) ?? group)
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
    const dayOf = (date: DateStr) => cur().orders.find((o) => o.date === date)

    return {
      data,
      root,
      today,
      groups: root.groups,
      terms: TERMS[group.template],
      switchGroup: (id) => {
        if (!rootRef.current.groups.some((g) => g.id === id)) return
        setActiveId(id)
        writeActiveGroup(id)
      },
      addGroup: ({ name, emoji, template }) => {
        const id = uid()
        const g = newGroup(id, template, name.trim() || TEMPLATE_INFO[template].defaultName, emoji)
        setRoot((r) => withGroupAdded(r, g))
        setActiveId(id)
        writeActiveGroup(id)
        return id
      },
      updateGroup: (id, patch) => setRoot((r) => withGroupEdited(r, id, patch)),
      removeGroup: (id) => {
        const res = withGroupRemoved(rootRef.current, id)
        if (!res) return null // 마지막 그룹은 삭제할 수 없다
        setRoot((r) => withGroupRemoved(r, id)?.root ?? r)
        if (group.id === id) {
          const next = res.root.groups[0]
          setActiveId(next.id)
          writeActiveGroup(next.id)
        }
        return () => setRoot((r) => withGroupRestored(r, res.removed, res.index))
      },
      addAbsenceAll: (memberId, from, to) => {
        const plan = planAbsenceAll(rootRef.current, gid, memberId, from, to, uid)
        const ids = new Set(plan.items.map((i) => i.absence.id))
        setRoot((r) => withAbsencesAdded(r, plan.items))
        return {
          applied: plan.items.length,
          noMatch: plan.noMatch,
          ambiguous: plan.ambiguous,
          undo: () => setRoot((r) => withAbsencesRemoved(r, ids)),
        }
      },
      memberById: (id) => data.members.find((m) => m.id === id),

      savePurchase: (p) => {
        const prev = cur().purchases.find((x) => x.date === p.date)
        putPurchase({ ...p, memo: p.memo?.trim() || undefined }, p.date)
        return () => putPurchase(prev, p.date)
      },
      removePurchase: (date) => {
        const prev = cur().purchases.find((x) => x.date === date)
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
        const prev = cur().absences.find((x) => x.id === id)
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
      setSettings: (patch) => set((d) => ({ ...d, settings: applySettingsPatch(d.settings, patch, todayStr()) })),
      settleBalance: () =>
        set((d) => ({ ...d, settings: { ...d.settings, balanceSince: nextSettlementDate(todayStr(), d.purchases) } })),

      importJson: (text) => {
        setRoot(parseAppData(JSON.parse(text))) // 실패(형식 오류·미래 버전)하면 throw → 호출측에서 안내
      },
      restoreLastGood: () => {
        const restored = restoreShadow(rootRef.current)
        if (!restored) return false
        setRoot({ ...restored, updatedAt: Date.now() })
        return true
      },
      resetToInitial: async () => {
        try {
          const res = await fetch(`${import.meta.env.BASE_URL}data.json`, { cache: 'no-cache' })
          setRoot(res.ok ? parseAppData(await res.json()) : EMPTY_DATA)
        } catch {
          setRoot(EMPTY_DATA)
        }
      },
    }
  }, [root, today, group, data])

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
  return (
    <Ctx.Provider value={store}>
      {children}
      <RecoverySheet
        recovery={recovery}
        failed={recoveryFailed}
        onChoose={(choice) => {
          if (!recovery) return
          const r = applyRecovery(choice, recovery, rootRef.current)
          if (!r.ok) return setRecoveryFailed(true) // 보관에 실패하면 선택을 확정하지 않는다
          setRoot(r.data)
          setRecovery(undefined)
        }}
      />
    </Ctx.Provider>
  )
}

/** 옛 버전 앱이 데이터를 지웠을 수 있을 때 묻는 시트. 버튼으로만 닫힌다(실수로 넘기지 않도록) */
function RecoverySheet({
  recovery,
  failed,
  onChoose,
}: {
  recovery?: Recovery
  failed: boolean
  onChoose: (c: 'restore' | 'keep') => void
}) {
  const last = useRef(recovery)
  if (recovery) last.current = recovery
  const r = last.current
  return (
    <Sheet
      open={!!recovery}
      onOpenChange={() => {}}
      title="마지막 정상 상태로 되돌릴까요?"
      description={`이전 버전 앱이 일부 데이터를 지웠을 수 있어요. 마지막 정상 상태(${r ? formatSavedAt(r.savedAt) : ''})로 되돌릴까요?`}
    >
      <div className="space-y-3 pb-2">
        <p className="text-[13px] leading-relaxed text-ink-2">
          되돌리면 지금 상태는 백업으로 남겨 둬요. 그대로 두면 지금 상태를 새 형식으로 옮기고, 정상 상태였던 데이터는 따로 보관해요.
        </p>
        {failed && <p className="text-[13px] font-semibold text-danger">저장 공간이 부족해서 보관하지 못했어요. 다시 시도하거나 공간을 확보해 주세요.</p>}
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <Button variant="soft" size="lg" className="w-full" onClick={() => onChoose('keep')}>
              그대로 두기
            </Button>
            <p className="mt-1.5 text-center text-xs text-ink-2">이 선택은 되돌릴 수 없어요</p>
          </div>
          <Button size="lg" className="flex-1" onClick={() => onChoose('restore')}>
            되돌리기
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
