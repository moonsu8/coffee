import { PrivacyHint } from '@/components/privacy-hint'
import { Reorder, useDragControls } from 'framer-motion'
import { Download, GripVertical, History, Plus, RotateCcw, Smartphone, Trash2, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Avatar } from '@/components/avatar'
import { Card, PageHeader, Segmented, SectionTitle } from '@/components/common'
import { GroupsCard } from '@/components/groups-card'
import { NumberInput } from '@/components/number-input'
import { InstallSheet } from '@/components/install'
import { fieldsFromOrder, OrderFields, orderFromFields } from '@/components/order-fields'
import { useToast } from '@/components/toast'
import { Button } from '@/components/ui/button'
import { Sheet, SheetFooter } from '@/components/ui/sheet'
import { downloadJson, readShadow } from '@/lib/data'
import { formatSavedAt, won } from '@/lib/format'
import { readMetrics } from '@/lib/metrics'
import { formatMD } from '@/logic/dates'
import { nextSettlementDate, priceKey, reenablePlan, type ReenablePlan } from '@/logic/fairness'
import { PRESET_MENUS } from '@/logic/menu'
import { MEMBER_COLORS, MEMBER_EMOJIS, memberStyle, suggestStyle } from '@/lib/members'
import { cn } from '@/lib/utils'
import { SharedCard } from '@/components/shared-card'
import { useRemote } from '@/remote/provider'
import { useStore } from '@/store/store'
import type { BuyerRule, Member, PriceEntry, PriceMode } from '@/types'

type Editing = { mode: 'add' } | { mode: 'edit'; member: Member } | null

export function SettingsScreen() {
  const { data, root, groups, today, reorderMembers, removeMember, importJson, resetToInitial, restoreLastGood, addCustomMenu, removeCustomMenu, access } = useStore()
  const canWrite = access.canWrite
  const remote = useRemote()
  const [menuInput, setMenuInput] = useState('')
  const toast = useToast()
  const [editing, setEditing] = useState<Editing>(null)
  const [deleting, setDeleting] = useState<Member | null>(null)
  const [confirm, setConfirm] = useState<null | { kind: 'reset' } | { kind: 'restore' } | { kind: 'import'; text: string }>(null)
  const lastGood = readShadow() // 마지막 정상 상태(저장 때마다 갱신되는 복사본)
  const [installOpen, setInstallOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  // 드래그 중에는 로컬 상태로 부드럽게, 드롭 시점에 저장
  const [order, setOrder] = useState<string[] | null>(null)
  const ids = order ?? data.members.map((m) => m.id)
  const list = ids.map((id) => data.members.find((m) => m.id === id)).filter((m): m is Member => !!m)

  const onFile = async (file?: File) => {
    if (!file) return
    try {
      const text = await file.text()
      JSON.parse(text)
      setConfirm({ kind: 'import', text })
    } catch {
      toast({ message: '읽을 수 없는 파일이에요', duration: 3000 })
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="pb-8">
      <PageHeader title="설정" subtitle="SETTINGS" />
      <div className="space-y-5 px-5">
        <GroupsCard />
        <SharedCard />

        {canWrite && (
          <>
        <Card className="p-4">
          <SectionTitle
            right={
              <Button size="sm" variant="dark" onClick={() => setEditing({ mode: 'add' })}>
                <Plus size={17} /> 멤버 추가
              </Button>
            }
          >
            멤버 · 순서
          </SectionTitle>
          {groups.length > 1 && (
            <p className="mb-1 text-[13px] font-semibold">
              {data.emoji} {data.name} 그룹의 멤버예요
            </p>
          )}
          <p className="mb-3 text-[13px] text-ink-2">손잡이를 잡고 끌어서 순서를 바꿔요. 순서는 같은 조건일 때 우선순위가 돼요.</p>
          <Reorder.Group axis="y" values={ids} onReorder={setOrder} className="space-y-2">
            {list.map((m, i) => (
              <MemberRow
                key={m.id}
                member={m}
                index={i}
                onDrop={() => {
                  if (order) reorderMembers(order)
                  setOrder(null)
                }}
                onEdit={() => setEditing({ mode: 'edit', member: m })}
                onDelete={() => setDeleting(m)}
              />
            ))}
          </Reorder.Group>
          {list.length === 0 && <p className="py-6 text-center text-ink-2">멤버를 추가해 주세요</p>}
        </Card>

        {data.hasOrders && (
          <>
        <Card>
          <SectionTitle>메뉴 목록</SectionTitle>
          <p className="mb-3 text-[13px] text-ink-2">기본 메뉴 외에 우리 팀만 쓰는 메뉴를 추가할 수 있어요.</p>
          <ul className="flex flex-wrap gap-2">
            {PRESET_MENUS.map((p) => (
              <li key={p.name} className="rounded-full bg-surface-2 px-3.5 py-2 text-sm font-semibold text-ink-2">
                {p.name}
              </li>
            ))}
            {data.customMenus.map((m) => (
              <li key={m} className="flex items-center rounded-full bg-caramel/20 pl-3.5 text-sm font-semibold">
                {m}
                <button aria-label={`${m} 메뉴 삭제`} onClick={() => removeCustomMenu(m)} className="grid size-11 place-items-center rounded-full">
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              addCustomMenu(menuInput)
              setMenuInput('')
            }}
          >
            <input
              aria-label="추가할 메뉴 이름"
              value={menuInput}
              maxLength={14}
              onChange={(e) => setMenuInput(e.target.value)}
              placeholder="예) 유자차"
              className="min-h-12 min-w-0 flex-1 rounded-2xl border border-line bg-surface-2 px-4 text-base placeholder:text-ink-2/70"
            />
            <Button variant="dark" type="submit" disabled={!menuInput.trim()}>
              추가
            </Button>
          </form>
        </Card>

          </>
        )}
        {data.template === 'coffee' && <BuyerRuleCard />}
        {data.hasOrders && <PriceListCard />}
          </>
        )}

        <Card>
          <SectionTitle>앱</SectionTitle>
          <Button variant="soft" className="w-full justify-start" onClick={() => setInstallOpen(true)}>
            <Smartphone size={18} /> 앱 설치 방법
          </Button>
        </Card>

        <Card>
          <SectionTitle>데이터</SectionTitle>
          <p className="mb-3 text-[13px] leading-relaxed text-ink-2">
            이 기기의 브라우저에 저장돼요. 다른 기기로 옮기거나 백업하려면 파일로 내보내 주세요.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="soft" onClick={() => downloadJson(root, `coffee-duty-${today}.json`)}>
              <Download size={18} /> 내보내기
            </Button>
            <Button variant="soft" onClick={() => fileRef.current?.click()}>
              <Upload size={18} /> 가져오기
            </Button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <Button variant="ghost" className="mt-2 w-full" disabled={!lastGood} onClick={() => setConfirm({ kind: 'restore' })}>
            <History size={17} /> 마지막 정상 상태로 되돌리기
          </Button>
          <p className="mt-1 text-center text-[13px] text-ink-2">
            {lastGood ? `저장 시각: ${formatSavedAt(lastGood.savedAt)}` : '저장된 정상 상태가 없어요'}
          </p>
          <Button variant="ghost" className="mt-1 w-full" onClick={() => setConfirm({ kind: 'reset' })}>
            <RotateCcw size={17} /> 초기 데이터로 되돌리기
          </Button>
        </Card>
        <UsageStats />
        <p className="pb-2 text-center text-xs text-ink-2">{remote.enabled ? '커피 당번 · 내 기기 그룹은 이 브라우저에만 저장돼요' : '커피 당번 · 서버 없이 이 브라우저에서만 동작해요'}</p>
      </div>

      <InstallSheet open={installOpen} onOpenChange={setInstallOpen} />
      <MemberEditor editing={editing} onClose={() => setEditing(null)} />

      <Sheet open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)} title={`${deleting?.name ?? ''}님을 삭제할까요?`} description="휴가 기록은 함께 지워지고, 과거 구매 기록은 '탈퇴한 멤버'로 남아요.">
        <div className="flex gap-2 pt-2">
          <Button variant="soft" size="lg" className="flex-1" onClick={() => setDeleting(null)}>
            취소
          </Button>
          <Button
            variant="danger"
            size="lg"
            className="flex-1"
            onClick={() => {
              if (deleting) removeMember(deleting.id)
              setDeleting(null)
            }}
          >
            삭제
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.kind === 'import' ? '이 파일로 바꿀까요?' : confirm?.kind === 'restore' ? '마지막 정상 상태로 되돌릴까요?' : '초기 데이터로 되돌릴까요?'}
        description={
          confirm?.kind === 'restore'
            ? `${lastGood ? formatSavedAt(lastGood.savedAt) : ''} 상태로 되돌려요. 지금 상태는 백업으로 남겨 두지만, 그 이후의 변경은 화면에서 사라져요.`
            : '지금 저장된 멤버·기록·휴가가 모두 교체돼요. 먼저 내보내기로 백업해 두면 안전해요.'
        }
      >
        <div className="flex gap-2 pt-2">
          <Button variant="soft" size="lg" className="flex-1" onClick={() => setConfirm(null)}>
            취소
          </Button>
          <Button
            size="lg"
            className="flex-1"
            onClick={async () => {
              try {
                if (confirm?.kind === 'restore') {
                  if (!restoreLastGood()) throw new Error('되돌릴 수 없었어요. 저장 공간을 확인해 주세요')
                  toast({ message: '마지막 정상 상태로 되돌렸어요', duration: 3000 })
                } else {
                  if (confirm?.kind === 'import') importJson(confirm.text)
                  else await resetToInitial()
                  toast({ message: '데이터를 바꿨어요', duration: 3000 })
                }
              } catch (e) {
                toast({ message: e instanceof Error ? e.message : '가져오기에 실패했어요', duration: 4000 })
              }
              setConfirm(null)
            }}
          >
            {confirm?.kind === 'restore' ? '되돌리기' : '바꾸기'}
          </Button>
        </div>
      </Sheet>
    </div>
  )
}

function MemberRow({
  member,
  index,
  onDrop,
  onEdit,
  onDelete,
}: {
  member: Member
  index: number
  onDrop: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  const controls = useDragControls()
  return (
    <Reorder.Item
      value={member.id}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDrop}
      whileDrag={{ scale: 1.03, boxShadow: '0 16px 32px -12px rgb(62 39 35 / 0.35)' }}
      className="relative flex min-h-16 items-center rounded-[20px] bg-surface-2 pr-1"
    >
      <button
        aria-label={`${member.name} 순서 바꾸기`}
        onPointerDown={(e) => controls.start(e)}
        className="grid size-11 shrink-0 cursor-grab touch-none place-items-center text-ink-2 active:cursor-grabbing"
      >
        <GripVertical size={20} />
      </button>
      <span className="w-5 text-center text-sm font-bold text-ink-2">{index + 1}</span>
      <button onClick={onEdit} className="flex min-h-14 flex-1 items-center gap-3 rounded-xl pl-2 text-left" aria-label={`${member.name} 수정`}>
        <Avatar member={member} size="sm" />
        <span className="text-[16px] font-semibold">{member.name}</span>
      </button>
      <button aria-label={`${member.name} 삭제`} onClick={onDelete} className="grid size-11 place-items-center rounded-full text-ink-2 hover:bg-danger/10 hover:text-danger">
        <Trash2 size={18} />
      </button>
    </Reorder.Item>
  )
}

function MemberEditor({ editing, onClose }: { editing: Editing; onClose: () => void }) {
  const last = useRef<Editing>(editing)
  if (editing) last.current = editing
  const shown = last.current
  return (
    <Sheet open={!!editing} onOpenChange={(o) => !o && onClose()} title={shown?.mode === 'edit' ? '멤버 수정' : '멤버 추가'}>
      {shown && <EditorBody editing={shown} onClose={onClose} />}
    </Sheet>
  )
}

function EditorBody({ editing, onClose }: { editing: NonNullable<Editing>; onClose: () => void }) {
  const { data, addMember, updateMember } = useStore()
  const base = editing.mode === 'edit' ? editing.member : null
  const suggested = suggestStyle(data.members)
  const init = base ? memberStyle(base) : suggested
  const [name, setName] = useState(base?.name ?? '')
  const [fav, setFav] = useState(() => fieldsFromOrder(base?.favorite))
  const [color, setColor] = useState(init.color)
  const [emoji, setEmoji] = useState(init.emoji)
  const preview = { id: base?.id ?? 'new', color, emoji }
  const valid = name.trim().length > 0

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <Avatar member={preview} size="xl" />
        <div className="flex-1">
          <label htmlFor="m-name" className="mb-1.5 block text-sm font-semibold text-ink-2">
            이름
          </label>
          <input
            id="m-name"
            value={name}
            maxLength={8}
            autoFocus={!base}
            onChange={(e) => setName(e.target.value)}
            placeholder="예) 김철수"
            className="min-h-12 w-full rounded-2xl border border-line bg-surface-2 px-4 text-base font-semibold placeholder:font-normal placeholder:text-ink-2/70"
          />
          <PrivacyHint kind="name" />
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-ink-2">색상</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="멤버 색상">
          {MEMBER_COLORS.map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={color === c}
              aria-label={c}
              onClick={() => setColor(c)}
              className={cn('grid size-11 place-items-center rounded-full ring-offset-2 ring-offset-surface transition-shadow', color === c && 'ring-[3px] ring-ink')}
            >
              <span className="size-8 rounded-full" style={{ background: c }} />
            </button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-ink-2">이모지</p>
        <div className="grid grid-cols-8 gap-1" role="radiogroup" aria-label="멤버 이모지">
          {MEMBER_EMOJIS.map((e) => (
            <button
              key={e}
              role="radio"
              aria-checked={emoji === e}
              aria-label={e}
              onClick={() => setEmoji(e)}
              className={cn('grid aspect-square min-h-11 place-items-center rounded-xl text-[22px]', emoji === e ? 'bg-caramel/30 ring-2 ring-caramel' : 'hover:bg-surface-2')}
            >
              {e}
            </button>
          ))}
        </div>
      </div>
      {data.hasOrders && (
        <div className="border-t border-line pt-5">
          <p className="mb-3 text-[15px] font-bold">기본 메뉴</p>
          <OrderFields value={fav} onChange={setFav} customMenus={data.customMenus} allowNone idPrefix="fav" />
        </div>
      )}
      <SheetFooter>
      <Button
        size="lg"
        className="w-full"
        disabled={!valid}
        onClick={() => {
          const favorite = orderFromFields(fav)
          if (base) updateMember(base.id, { name, color, emoji, favorite: favorite ?? null })
          else addMember({ name, color, emoji, ...(favorite ? { favorite } : {}) })
          onClose()
        }}
      >
        {base ? '저장' : '추가하기'}
      </Button>
      </SheetFooter>
    </div>
  )
}

/** 이 기기에서만 집계한 사용 지표 (외부로 전송하지 않음) */
function UsageStats() {
  const m = readMetrics()
  const last = m.usedDates[m.usedDates.length - 1]
  const rows: [string, string][] = [
    ['주문표 복사', `${m.copyCount}회`],
    ['주문표를 쓴 날', `${m.usedDates.length}일${last ? ` (최근 ${last.slice(5).replace('-', '/')})` : ''}`],
    ['당일 메뉴 변경', `${m.editCount}회`],
  ]
  return (
    <Card>
      <SectionTitle>사용 통계 (이 기기)</SectionTitle>
      <dl className="divide-y divide-line">
        {rows.map(([k, v]) => (
          <div key={k} className="flex min-h-11 items-center justify-between">
            <dt className="text-[15px] text-ink-2">{k}</dt>
            <dd className="text-[15px] font-bold">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-2">이 기기에만 저장되고 어디로도 전송되지 않아요.</p>
    </Card>
  )
}

/** 당번 기준(횟수/차액), 정산, 금액 입력 기본값 */
function BuyerRuleCard() {
  const { data, today, setSettings, settleBalance } = useStore()
  const toast = useToast()
  const { buyerRule, defaultPriceMode, balanceSince } = data.settings
  const [confirm, setConfirm] = useState(false)
  const [reenable, setReenable] = useState<ReenablePlan | null>(null)
  const lastPlan = useRef<ReenablePlan | null>(null)
  if (reenable) lastPlan.current = reenable
  const plan = lastPlan.current
  const nextStart = nextSettlementDate(today, data.purchases)

  const modeOptions: { value: PriceMode; label: string }[] = [
    ...(buyerRule === 'balance' ? [] : [{ value: 'none' as PriceMode, label: '없음' }]),
    { value: 'detail', label: '상세' },
    { value: 'simple', label: '간단' },
  ]

  return (
    <Card>
      <SectionTitle>당번 기준</SectionTitle>
      <Segmented<BuyerRule>
        id="buyer-rule"
        value={buyerRule}
        onChange={(v) => {
          // 차액 기준을 다시 켤 때, 이전 시작일 이후에 금액 없는 기록이 있으면 먼저 물어본다
          const p = v === 'balance' ? reenablePlan(data.settings, data.purchases, today) : null
          if (p) setReenable(p)
          else setSettings({ buyerRule: v })
        }}
        options={[
          { value: 'count', label: '횟수' },
          { value: 'balance', label: '차액' },
        ]}
      />
      <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
        {buyerRule === 'count'
          ? '가장 오래 안 산 사람이 다음 당번이에요.'
          : '낸 돈이 마신 돈보다 가장 적은(차액이 가장 작은) 사람이 다음 당번이에요. 차액이 같으면 오래 안 산 사람이 먼저예요. 금액 없는 기록은 계산에서 빠져서, [샀어요]에서 금액을 꼭 적어야 해요.'}
      </p>

      {buyerRule === 'balance' && (
        <div className="mt-4 rounded-2xl bg-surface-2 p-3.5">
          <p className="text-[15px]">
            계산 시작일 <b>{balanceSince ? formatMD(balanceSince) : '처음부터'}</b>
            <span className="text-ink-2"> · 이 날 이후 기록만 당번 계산에 써요</span>
          </p>
          <Button variant="outline" className="mt-3 w-full" onClick={() => setConfirm(true)}>
            정산 완료, 오늘부터 다시 계산
          </Button>
        </div>
      )}

      <p className="mt-5 mb-2 text-sm font-semibold text-ink-2">[샀어요] 때 금액 입력</p>
      <Segmented<PriceMode>
        id="price-mode"
        value={defaultPriceMode}
        onChange={(v) => setSettings({ defaultPriceMode: v })}
        options={modeOptions}
      />
      <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
        {defaultPriceMode === 'none' ? '금액을 묻지 않고 한 번 탭으로 기록해요.' : '[샀어요]를 누르면 금액 입력 창이 열려요.'}
      </p>

      <Sheet
        open={!!reenable}
        onOpenChange={(o) => !o && setReenable(null)}
        title={`금액 없는 기록 ${plan?.unpriced ?? 0}건이 있어요`}
        description={`오늘부터 새로 계산할까요? 정산과 같은 규칙으로 ${plan ? formatMD(plan.newSince) : ''} 기록부터 다시 계산해요. 아니요를 누르면 이전 시작일(${data.settings.balanceSince ? formatMD(data.settings.balanceSince) : ''})을 그대로 써요.`}
      >
        <div className="flex gap-2 pt-2">
          <Button
            variant="soft"
            size="lg"
            className="flex-1"
            onClick={() => {
              setSettings({ buyerRule: 'balance' })
              setReenable(null)
            }}
          >
            아니요
          </Button>
          <Button
            size="lg"
            className="flex-1"
            onClick={() => {
              if (plan) setSettings({ buyerRule: 'balance', balanceSince: plan.newSince })
              setReenable(null)
              toast({ message: `${plan ? formatMD(plan.newSince) : ''}부터 새로 계산해요`, duration: 3000 })
            }}
          >
            예, 새로 계산
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={confirm}
        onOpenChange={setConfirm}
        title="정산을 완료할까요?"
        description={`지금까지의 낸 돈·마신 돈은 정산된 것으로 보고, ${formatMD(nextStart)} 기록부터 차액을 다시 계산해요. 지난 구매 기록은 지워지지 않아요.`}
      >
        <div className="flex gap-2 pt-2">
          <Button variant="soft" size="lg" className="flex-1" onClick={() => setConfirm(false)}>
            취소
          </Button>
          <Button
            size="lg"
            className="flex-1"
            onClick={() => {
              settleBalance()
              setConfirm(false)
              toast({ message: `${formatMD(nextStart)}부터 다시 계산해요`, duration: 3000 })
            }}
          >
            정산 완료
          </Button>
        </div>
      </Sheet>
    </Card>
  )
}

/** 우리 팀 가격표 (사용자가 입력한 값만) */
function PriceListCard() {
  const { data, savePrices, removePrice } = useStore()
  const [editing, setEditing] = useState<PriceEntry | null>(null)
  const [value, setValue] = useState('')
  const list = [...data.priceList].sort((a, b) => a.menu.localeCompare(b.menu, 'ko') || a.temp.localeCompare(b.temp) || a.size.localeCompare(b.size))
  const label = (e: PriceEntry) => `${e.menu} · ${e.temp === 'hot' ? '따뜻' : '아이스'}${e.size ? ` · ${e.size}` : ''}`

  return (
    <Card>
      <SectionTitle>가격표</SectionTitle>
      {list.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-ink-2">
          아직 비어 있어요. [샀어요]에서 메뉴 가격을 적으면 여기에 쌓이고, 다음 주문부터 자동으로 채워져요. 앱이 가격을 미리 넣어 두지는 않아요.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {list.map((e) => (
            <li key={priceKey(e)}>
              <button
                onClick={() => {
                  setEditing(e)
                  setValue(String(e.price))
                }}
                aria-label={`${label(e)} ${won(e.price)} 수정`}
                className="flex min-h-12 w-full items-center justify-between gap-3 text-left"
              >
                <span className="min-w-0 truncate text-[15px] font-semibold">{label(e)}</span>
                <span className="shrink-0 text-[15px] font-bold">{won(e.price)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title={editing ? label(editing) : '가격'} description="가격표에서 고치거나 지울 수 있어요. 지난 기록의 금액은 바뀌지 않아요.">
        <div className="space-y-4 pb-2">
          <NumberInput label="가격" value={value} onChange={setValue} />
          <div className="flex gap-2">
            <Button
              variant="danger"
              size="lg"
              onClick={() => {
                if (editing) removePrice(priceKey(editing))
                setEditing(null)
              }}
            >
              삭제
            </Button>
            <Button
              size="lg"
              className="flex-1"
              disabled={!value}
              onClick={() => {
                if (editing) savePrices([{ menu: editing.menu, temp: editing.temp, size: editing.size, price: Number(value) }])
                setEditing(null)
              }}
            >
              저장
            </Button>
          </div>
        </div>
      </Sheet>
    </Card>
  )
}
