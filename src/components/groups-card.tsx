import { CloudUpload, Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import { GROUP_EMOJIS } from '@/logic/groups'
import { scheduleDays, scheduleLabel, WEEKDAY_NUMS } from '@/logic/schedule'
import { WEEKDAYS_KO } from '@/logic/dates'
import { configOf, CUSTOM_PRESET_ID, PRESETS, presetById, type TemplatePreset } from '@/logic/templates'
import { THEME_LABELS } from '@/logic/themes'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/store'
import { useRemote } from '@/remote/provider'
import { ShareSheet } from './share-sheet'
import { THEME_IDS, type Group, type Schedule, type ThemeId } from '@/types'
import { Card, SectionTitle } from './common'
import { useToast } from './toast'
import { Button } from './ui/button'
import { Sheet, SheetFooter } from './ui/sheet'

const presetLabel = (g: Group) => (g.config.presetId === CUSTOM_PRESET_ID ? '직접 만들기' : presetById(g.config.presetId).name)

/** 그룹 관리: 추가 · 이름/이모지 변경 · 삭제 (마지막 하나는 삭제할 수 없다) */
export function GroupsCard() {
  const { groups, data, switchGroup, addGroup, updateGroup, removeGroup, copyStatusOf } = useStore()
  const remote = useRemote()
  const toast = useToast()
  const [sharing, setSharing] = useState<Group | null>(null)
  const [form, setForm] = useState<null | { mode: 'add' } | { mode: 'edit'; group: Group }>(null)
  const [deleting, setDeleting] = useState<Group | null>(null)
  const lastDeleting = useRef<Group | null>(null)
  if (deleting) lastDeleting.current = deleting
  const del = lastDeleting.current

  return (
    <Card className="p-4">
      <SectionTitle
        right={
          <Button size="sm" variant="dark" onClick={() => setForm({ mode: 'add' })}>
            <Plus size={17} /> 그룹 추가
          </Button>
        }
      >
        그룹
      </SectionTitle>
      <ul className="space-y-2">
        {groups.map((g) => {
          const active = g.id === data.groupId
          const status = copyStatusOf(g.id)
          const remoteId = remote.links[g.id]?.remoteId
          return (
            <li key={g.id} className="flex items-center gap-2 rounded-[20px] bg-surface-2 pr-2">
              <button
                onClick={() => setForm({ mode: 'edit', group: g })}
                aria-label={`${g.name} 그룹 수정`}
                className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-[20px] pl-3.5 text-left"
              >
                <span aria-hidden className="text-2xl">
                  {g.emoji}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[16px] font-semibold">{g.name}</span>
                  <span className="block text-xs text-ink-2">
                    {presetLabel(g)} · {scheduleLabel(g.schedule)} · 멤버 {g.members.length}명 · 기록 {g.records.length}건
                  </span>
                  {status === 'moved' && <span className="block text-xs font-semibold text-caramel-ink">서버로 옮김 · 서버 그룹이 보이는 동안 숨겨져요</span>}
                  {status === 'stale' && <span className="block text-xs font-semibold text-caramel-ink">서버로 옮긴 그룹의 이전 사본</span>}
                </span>
              </button>
              {status === 'moved' ? (
                remoteId && (
                  <Button size="sm" variant="outline" onClick={() => switchGroup(remoteId)}>
                    서버 그룹 보기
                  </Button>
                )
              ) : active ? (
                <span className="shrink-0 rounded-full bg-caramel/25 px-2.5 py-1 text-xs font-bold">보는 중</span>
              ) : (
                <Button size="sm" variant="outline" onClick={() => switchGroup(g.id)}>
                  보기
                </Button>
              )}
              {remote.enabled && (status === null || status === 'pending') && (
                <button
                  onClick={() => setSharing(g)}
                  aria-label={`${g.name} 그룹을 서버로 옮기기`}
                  className="grid size-11 shrink-0 place-items-center rounded-full text-ink-2 hover:bg-black/5"
                >
                  <CloudUpload size={19} />
                </button>
              )}
            </li>
          )
        })}
      </ul>

      <ShareSheet group={sharing} onClose={() => setSharing(null)} />

      <Sheet
        open={form !== null}
        onOpenChange={(o) => !o && setForm(null)}
        title={form?.mode === 'edit' ? '그룹 수정' : '그룹 추가'}
        description={form?.mode === 'edit' ? undefined : '무엇을 돌아가며 할까요? 멤버·기록·휴가는 그룹마다 따로 관리돼요'}
      >
        {form && (
          <GroupForm
            key={form.mode === 'edit' ? form.group.id : 'add'}
            form={form}
            canDelete={groups.length > 1}
            onClose={() => setForm(null)}
            onSubmit={(v) => {
              if (form.mode === 'edit') updateGroup(form.group.id, { name: v.name, emoji: v.emoji, schedule: v.schedule })
              else addGroup(v)
              toast({
                message: form.mode === 'edit' ? '그룹을 고쳤어요' : `${v.emoji} ${v.name} 그룹을 만들었어요`,
                duration: 3000,
              })
              setForm(null)
            }}
            onDelete={() => {
              if (form.mode === 'edit') setDeleting(form.group)
              setForm(null)
            }}
          />
        )}
      </Sheet>

      <Sheet
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`'${del?.name ?? ''}' 그룹을 삭제할까요?`}
        description={`멤버 ${del?.members.length ?? 0}명, 기록 ${del?.records.length ?? 0}건, 휴가 ${del?.absences.length ?? 0}건이 함께 삭제돼요. 먼저 내보내기로 백업해 두면 안전해요.`}
      >
        <div className="flex gap-2 pt-2">
          <Button variant="soft" size="lg" className="flex-1" onClick={() => setDeleting(null)}>
            취소
          </Button>
          <Button
            variant="danger"
            size="lg"
            className="flex-1"
            onClick={() => {
              const undo = deleting ? removeGroup(deleting.id) : null
              setDeleting(null)
              if (undo) toast({ message: '그룹을 삭제했어요', actionLabel: '되돌리기', onAction: undo })
            }}
          >
            삭제
          </Button>
        </div>
      </Sheet>
    </Card>
  )
}

/* ───────── 요일 선택 ───────── */

function ScheduleField({ value, onChange }: { value: Schedule; onChange: (s: Schedule) => void }) {
  const days = scheduleDays(value)
  const toggle = (d: number) => {
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d]
    if (next.length === 0) return // 최소 하루는 있어야 한다
    const sorted = [...next].sort((a, b) => a - b)
    if (sorted.join() === '1,2,3,4,5') onChange('weekdays')
    else if (sorted.length === 7) onChange('daily')
    else onChange(sorted)
  }
  const quick = (label: string, v: Schedule) => (
    <button
      type="button"
      onClick={() => onChange(v)}
      aria-pressed={scheduleLabel(value) === label}
      className={cn(
        'min-h-9 rounded-full px-3 text-[13px] font-bold',
        scheduleLabel(value) === label ? 'bg-caramel text-on-caramel' : 'bg-surface-2 text-ink-2',
      )}
    >
      {label}
    </button>
  )
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-ink-2">담당하는 요일</p>
        <div className="flex gap-1.5">
          {quick('평일', 'weekdays')}
          {quick('매일', 'daily')}
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1" role="group" aria-label="요일">
        {WEEKDAY_NUMS.map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={days.includes(d)}
            onClick={() => toggle(d)}
            className={cn(
              'grid min-h-11 place-items-center rounded-xl text-[15px] font-bold',
              days.includes(d) ? 'bg-caramel text-on-caramel' : 'bg-surface-2 text-ink-2',
            )}
          >
            {WEEKDAYS_KO[d]}
          </button>
        ))}
      </div>
    </div>
  )
}

/* ───────── 그룹 추가(템플릿 고르기 → 이름·멤버) / 수정 ───────── */

interface FormValue {
  name: string
  emoji: string
  schedule: Schedule
  config: Group['config']
  memberNames: string[]
}

function GroupForm({
  form,
  canDelete,
  onClose,
  onSubmit,
  onDelete,
}: {
  form: { mode: 'add' } | { mode: 'edit'; group: Group }
  canDelete: boolean
  onClose: () => void
  onSubmit: (v: FormValue) => void
  onDelete: () => void
}) {
  const editing = form.mode === 'edit' ? form.group : null
  const [preset, setPreset] = useState<TemplatePreset | null>(null)

  if (!editing && !preset) {
    return (
      <div className="pb-4">
        <div className="grid grid-cols-2 gap-2" role="list" aria-label="템플릿">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              role="listitem"
              onClick={() => setPreset(p)}
              className="flex min-h-[104px] flex-col items-start gap-1 rounded-2xl border-2 border-transparent bg-surface-2 p-3 text-left transition-colors active:border-caramel"
            >
              <span className="text-2xl">{p.emoji}</span>
              <span className="text-[15px] font-bold">{p.id === CUSTOM_PRESET_ID ? '직접 만들기' : p.name}</span>
              <span className="text-xs leading-snug text-ink-2">{p.blurb}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }
  return (
    <GroupFields
      editing={editing}
      preset={preset}
      onBack={() => setPreset(null)}
      canDelete={canDelete}
      onClose={onClose}
      onSubmit={onSubmit}
      onDelete={onDelete}
    />
  )
}

function GroupFields({
  editing,
  preset,
  onBack,
  canDelete,
  onClose,
  onSubmit,
  onDelete,
}: {
  editing: Group | null
  preset: TemplatePreset | null
  onBack: () => void
  canDelete: boolean
  onClose: () => void
  onSubmit: (v: FormValue) => void
  onDelete: () => void
}) {
  const p = preset ?? presetById(CUSTOM_PRESET_ID)
  const custom = !editing && p.id === CUSTOM_PRESET_ID
  const [name, setName] = useState(editing?.name ?? '')
  const [emoji, setEmoji] = useState(editing?.emoji ?? p.emoji)
  const [schedule, setSchedule] = useState<Schedule>(editing?.schedule ?? p.schedule)
  const [members, setMembers] = useState('')
  const [action, setAction] = useState(p.actionLabel)
  const [money, setMoney] = useState(p.fairness === 'money')
  const [themeId, setThemeId] = useState<ThemeId>(p.themeId)

  const submit = () => {
    const config = editing
      ? editing.config
      : configOf({
          ...p,
          actionLabel: custom ? action.trim() || p.actionLabel : p.actionLabel,
          fairness: custom ? (money ? 'money' : 'count') : p.fairness,
          orders: custom ? false : p.orders, // 직접 만들기에는 주문(커피 메뉴) 기능이 없다
          themeId: custom ? themeId : p.themeId,
        })
    onSubmit({
      name: name.trim() || p.name,
      emoji,
      schedule,
      config,
      memberNames: members
        .split(/[\n,]/)
        .map((x) => x.trim())
        .filter(Boolean),
    })
  }

  return (
    <div className="space-y-5 pb-2">
      {!editing && (
        <button type="button" onClick={onBack} className="-mt-1 min-h-9 text-[13px] font-semibold text-ink-2">
          ← 템플릿 다시 고르기 ({p.emoji} {p.id === CUSTOM_PRESET_ID ? '직접 만들기' : p.name})
        </button>
      )}
      <div>
        <label htmlFor="g-name" className="mb-2 block text-sm font-semibold text-ink-2">
          이름
        </label>
        <input
          id="g-name"
          value={name}
          maxLength={10}
          onChange={(e) => setName(e.target.value)}
          placeholder={`예) ${p.name}`}
          className="min-h-12 w-full rounded-2xl border border-line bg-surface-2 px-4 text-base font-semibold placeholder:font-normal placeholder:text-ink-2/70"
        />
      </div>
      {!editing && (
        <div>
          <label htmlFor="g-members" className="mb-2 block text-sm font-semibold text-ink-2">
            멤버 (선택)
          </label>
          <textarea
            id="g-members"
            value={members}
            rows={2}
            onChange={(e) => setMembers(e.target.value)}
            placeholder="이름을 쉼표나 줄바꿈으로 구분해요. 나중에 설정에서도 추가할 수 있어요"
            className="w-full resize-none rounded-2xl border border-line bg-surface-2 px-4 py-3 text-base placeholder:text-[14px] placeholder:text-ink-2/70"
          />
        </div>
      )}
      <ScheduleField value={schedule} onChange={setSchedule} />
      {(editing || custom) && (
        <div>
          <p className="mb-2 text-sm font-semibold text-ink-2">이모지</p>
          <div className="grid grid-cols-6 gap-1" role="radiogroup" aria-label="그룹 이모지">
            {GROUP_EMOJIS.map((e) => (
              <button
                key={e}
                role="radio"
                aria-checked={emoji === e}
                aria-label={e}
                onClick={() => setEmoji(e)}
                className={cn(
                  'grid min-h-11 place-items-center rounded-xl text-[22px]',
                  emoji === e ? 'bg-caramel/30 ring-2 ring-caramel' : 'hover:bg-surface-2',
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
      )}
      {custom && (
        <>
          <div>
            <label htmlFor="g-action" className="mb-2 block text-sm font-semibold text-ink-2">
              완료 버튼 문구
            </label>
            <input
              id="g-action"
              value={action}
              maxLength={8}
              onChange={(e) => setAction(e.target.value)}
              placeholder="예) 했어요"
              className="min-h-12 w-full rounded-2xl border border-line bg-surface-2 px-4 text-base font-semibold placeholder:font-normal placeholder:text-ink-2/70"
            />
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-ink-2">공평함 기준</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="공평함 기준">
              {[
                { v: false, t: '횟수', d: '많이 안 한 사람이 먼저' },
                { v: true, t: '금액', d: '낸 돈·차액까지 계산' },
              ].map((o) => (
                <button
                  key={o.t}
                  role="radio"
                  aria-checked={money === o.v}
                  onClick={() => setMoney(o.v)}
                  className={cn(
                    'flex min-h-[72px] flex-col items-start gap-0.5 rounded-2xl border-2 p-3 text-left',
                    money === o.v ? 'border-caramel bg-caramel/15' : 'border-transparent bg-surface-2',
                  )}
                >
                  <span className="text-[15px] font-bold">{o.t}</span>
                  <span className="text-xs text-ink-2">{o.d}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-ink-2">테마</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="테마">
              {THEME_IDS.map((t) => (
                <button
                  key={t}
                  role="radio"
                  aria-checked={themeId === t}
                  onClick={() => setThemeId(t)}
                  className={cn(
                    'min-h-10 rounded-full px-3.5 text-sm font-semibold',
                    themeId === t ? 'bg-caramel text-on-caramel' : 'bg-surface-2 text-ink-2',
                  )}
                >
                  {THEME_LABELS[t].emoji} {THEME_LABELS[t].label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
      <SheetFooter className="flex gap-2">
        {editing && (
          <Button variant="danger" size="lg" disabled={!canDelete} onClick={onDelete}>
            삭제
          </Button>
        )}
        <Button variant="soft" size="lg" onClick={onClose}>
          취소
        </Button>
        <Button size="lg" className="flex-1" disabled={!!editing && !name.trim()} onClick={submit}>
          {editing ? '저장' : '추가하기'}
        </Button>
      </SheetFooter>
      {editing && !canDelete && <p className="-mt-2 text-[13px] text-ink-2">마지막 그룹은 삭제할 수 없어요.</p>}
      {editing && <p className="-mt-2 text-[12px] text-ink-2">종류와 버튼 문구는 만든 뒤 바꿀 수 없어요.</p>}
    </div>
  )
}
