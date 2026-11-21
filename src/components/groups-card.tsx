import { Plus } from 'lucide-react'
import { useRef, useState } from 'react'
import { GROUP_EMOJIS, TEMPLATE_INFO } from '@/logic/groups'
import { cn } from '@/lib/utils'
import { useStore } from '@/store/store'
import type { Group, Template } from '@/types'
import { Card, SectionTitle } from './common'
import { useToast } from './toast'
import { Button } from './ui/button'
import { Sheet } from './ui/sheet'

/** 그룹 관리: 추가 · 이름/이모지 변경 · 삭제 (마지막 하나는 삭제할 수 없다) */
export function GroupsCard() {
  const { groups, data, switchGroup, addGroup, updateGroup, removeGroup } = useStore()
  const toast = useToast()
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
                    {TEMPLATE_INFO[g.template].label} · 멤버 {g.members.length}명 · 기록 {g.records.length}건
                  </span>
                </span>
              </button>
              {active ? (
                <span className="shrink-0 rounded-full bg-caramel/25 px-2.5 py-1 text-xs font-bold">보는 중</span>
              ) : (
                <Button size="sm" variant="outline" onClick={() => switchGroup(g.id)}>
                  보기
                </Button>
              )}
            </li>
          )
        })}
      </ul>

      <Sheet
        open={form !== null}
        onOpenChange={(o) => !o && setForm(null)}
        title={form?.mode === 'edit' ? '그룹 수정' : '그룹 추가'}
        description={form?.mode === 'edit' ? undefined : '멤버·기록·휴가는 그룹마다 따로 관리돼요'}
      >
        {form && (
          <GroupForm
            key={form.mode === 'edit' ? form.group.id : 'add'}
            form={form}
            canDelete={groups.length > 1}
            onClose={() => setForm(null)}
            onSubmit={(v) => {
              if (form.mode === 'edit') updateGroup(form.group.id, { name: v.name, emoji: v.emoji })
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
  onSubmit: (v: { name: string; emoji: string; template: Template }) => void
  onDelete: () => void
}) {
  const editing = form.mode === 'edit' ? form.group : null
  const [template, setTemplate] = useState<Template>(editing?.template ?? 'general')
  const [name, setName] = useState(editing?.name ?? '')
  const [emoji, setEmoji] = useState(editing?.emoji ?? TEMPLATE_INFO.general.emoji)
  const [emojiTouched, setEmojiTouched] = useState(!!editing)
  const placeholder = TEMPLATE_INFO[template].defaultName

  return (
    <div className="space-y-5 pb-2">
      {!editing && (
        <div>
          <p className="mb-2 text-sm font-semibold text-ink-2">템플릿</p>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="템플릿">
            {(['general', 'coffee'] as Template[]).map((t) => (
              <button
                key={t}
                role="radio"
                aria-checked={template === t}
                onClick={() => {
                  setTemplate(t)
                  if (!emojiTouched) setEmoji(TEMPLATE_INFO[t].emoji)
                }}
                className={cn(
                  'flex min-h-[96px] flex-col items-start gap-1 rounded-2xl border-2 p-3 text-left transition-colors',
                  template === t ? 'border-caramel bg-caramel/15' : 'border-transparent bg-surface-2',
                )}
              >
                <span className="text-2xl">{TEMPLATE_INFO[t].emoji}</span>
                <span className="text-[15px] font-bold">{TEMPLATE_INFO[t].label}</span>
                <span className="text-xs leading-snug text-ink-2">{TEMPLATE_INFO[t].blurb}</span>
              </button>
            ))}
          </div>
        </div>
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
          placeholder={`예) ${placeholder}`}
          className="min-h-12 w-full rounded-2xl border border-line bg-surface-2 px-4 text-base font-semibold placeholder:font-normal placeholder:text-ink-2/70"
        />
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-ink-2">이모지</p>
        <div className="grid grid-cols-6 gap-1" role="radiogroup" aria-label="그룹 이모지">
          {GROUP_EMOJIS.map((e) => (
            <button
              key={e}
              role="radio"
              aria-checked={emoji === e}
              aria-label={e}
              onClick={() => {
                setEmoji(e)
                setEmojiTouched(true)
              }}
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
      <div className="flex gap-2">
        {editing && (
          <Button variant="danger" size="lg" disabled={!canDelete} onClick={onDelete}>
            삭제
          </Button>
        )}
        <Button variant="soft" size="lg" onClick={onClose}>
          취소
        </Button>
        <Button
          size="lg"
          className="flex-1"
          disabled={!!editing && !name.trim()}
          onClick={() => onSubmit({ name: name.trim() || placeholder, emoji, template })}
        >
          {editing ? '저장' : '추가하기'}
        </Button>
      </div>
      {editing && !canDelete && <p className="-mt-2 text-[13px] text-ink-2">마지막 그룹은 삭제할 수 없어요.</p>}
    </div>
  )
}
