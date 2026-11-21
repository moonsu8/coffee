import { cn } from '@/lib/utils'
import { useStore } from '@/store/store'

/**
 * 홈 상단 그룹 전환. 그룹이 하나뿐이면 아무것도 그리지 않아서 지금 화면과 똑같이 보인다.
 * (그룹 추가·이름 변경·삭제는 설정에서)
 */
export function GroupSwitcher() {
  const { groups, data, switchGroup } = useStore()
  if (groups.length < 2) return null
  return (
    <div
      role="radiogroup"
      aria-label="그룹 전환"
      className="scroll-clean -mx-5 mb-3 flex gap-2 overflow-x-auto px-5 pb-1"
    >
      {groups.map((g) => {
        const active = g.id === data.groupId
        return (
          <button
            key={g.id}
            role="radio"
            aria-checked={active}
            onClick={() => switchGroup(g.id)}
            className={cn(
              'flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-[15px] font-semibold transition-colors',
              active ? 'bg-caramel text-on-caramel' : 'bg-surface-2 text-ink hover:brightness-95',
            )}
          >
            <span aria-hidden>{g.emoji}</span>
            {g.name}
          </button>
        )
      })}
    </div>
  )
}
