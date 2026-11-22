import { Eye, RefreshCw } from 'lucide-react'
import { formatSyncTime } from '@/remote/format'
import { useRemote } from '@/remote/provider'
import { useStore } from '@/store/store'

/** 서버(공유) 그룹을 보는 중일 때만 화면 맨 위에 뜨는 안내: 보기 전용 + 마지막 업데이트 시각 */
export function SharedBanner() {
  const { access } = useStore()
  const remote = useRemote()
  if (access.kind !== 'remote') return null
  return (
    <div role="status" className="flex shrink-0 items-center gap-2 border-b border-line bg-surface-2 px-4 py-2 text-[13px] font-semibold text-ink-2">
      <Eye size={16} aria-hidden className="shrink-0" />
      <span className="min-w-0 flex-1">
        보기 전용 · 마지막 업데이트 {access.lastSyncedAt ? formatSyncTime(access.lastSyncedAt) : '-'}
        {remote.offline ? ' (연결 안 됨)' : ''}
      </span>
      <button
        onClick={() => void remote.refresh()}
        disabled={remote.refreshing}
        aria-label="새로고침"
        className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-black/5"
      >
        <RefreshCw size={16} className={remote.refreshing ? 'animate-spin' : ''} />
      </button>
    </div>
  )
}
