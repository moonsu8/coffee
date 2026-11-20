import { Reorder, useDragControls } from 'framer-motion'
import { Download, GripVertical, Plus, RotateCcw, Smartphone, Trash2, Upload, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Avatar } from '@/components/avatar'
import { Card, PageHeader, SectionTitle } from '@/components/common'
import { InstallSheet } from '@/components/install'
import { fieldsFromOrder, OrderFields, orderFromFields } from '@/components/order-fields'
import { useToast } from '@/components/toast'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { downloadJson } from '@/lib/data'
import { readMetrics } from '@/lib/metrics'
import { PRESET_MENUS } from '@/logic/menu'
import { MEMBER_COLORS, MEMBER_EMOJIS, memberStyle, suggestStyle } from '@/lib/members'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/store'
import type { Member } from '@/types'

type Editing = { mode: 'add' } | { mode: 'edit'; member: Member } | null

export function SettingsScreen() {
  const { data, today, reorderMembers, removeMember, importJson, resetToInitial, addCustomMenu, removeCustomMenu } = useStore()
  const [menuInput, setMenuInput] = useState('')
  const toast = useToast()
  const [editing, setEditing] = useState<Editing>(null)
  const [deleting, setDeleting] = useState<Member | null>(null)
  const [confirm, setConfirm] = useState<null | { kind: 'reset' } | { kind: 'import'; text: string }>(null)
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
            <Button variant="soft" onClick={() => downloadJson(data, `coffee-duty-${today}.json`)}>
              <Download size={18} /> 내보내기
            </Button>
            <Button variant="soft" onClick={() => fileRef.current?.click()}>
              <Upload size={18} /> 가져오기
            </Button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <Button variant="ghost" className="mt-2 w-full" onClick={() => setConfirm({ kind: 'reset' })}>
            <RotateCcw size={17} /> 초기 데이터로 되돌리기
          </Button>
        </Card>
        <UsageStats />
        <p className="pb-2 text-center text-xs text-ink-2">커피 당번 · 서버 없이 이 브라우저에서만 동작해요</p>
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
        title={confirm?.kind === 'import' ? '이 파일로 바꿀까요?' : '초기 데이터로 되돌릴까요?'}
        description="지금 저장된 멤버·기록·휴가가 모두 교체돼요. 먼저 내보내기로 백업해 두면 안전해요."
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
                if (confirm?.kind === 'import') importJson(confirm.text)
                else await resetToInitial()
                toast({ message: '데이터를 바꿨어요', duration: 3000 })
              } catch (e) {
                toast({ message: e instanceof Error ? e.message : '가져오기에 실패했어요', duration: 4000 })
              }
              setConfirm(null)
            }}
          >
            바꾸기
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
      <div className="border-t border-line pt-5">
        <p className="mb-3 text-[15px] font-bold">기본 메뉴</p>
        <OrderFields value={fav} onChange={setFav} customMenus={data.customMenus} allowNone idPrefix="fav" />
      </div>
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
