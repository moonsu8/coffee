import { Cloud, Eye, RefreshCw, TriangleAlert, X } from 'lucide-react'
import { formatSyncTime } from '@/remote/format'
import { useRemote } from '@/remote/provider'
import { useStore } from '@/store/store'

/**
 * 서버(공유) 그룹을 보는 중일 때만 화면 맨 위에 뜨는 안내.
 *  - 그룹원: 보기 전용 + 마지막 업데이트 시각
 *  - 그룹장: 저장 중 / 저장됨 / 저장하지 못함(이유) / 오프라인이라 수정할 수 없음
 */
export function SharedBanner() {
  const { access } = useStore()
  const remote = useRemote()
  if (access.kind !== 'remote') return null
  const at = access.lastSyncedAt ? formatSyncTime(access.lastSyncedAt) : '-'
  const owner = access.role === 'owner'
  const failed = owner && remote.write.state === 'failed' && !!remote.write.message
  const saving = owner && remote.write.state === 'saving'

  let icon = <Eye size={16} aria-hidden className="shrink-0" />
  let text = `보기 전용 · 마지막 업데이트 ${at}${remote.offline ? ' (연결 안 됨)' : ''}`
  if (owner) {
    icon = <Cloud size={16} aria-hidden className="shrink-0" />
    text = !remote.online
      ? `인터넷에 연결되면 수정할 수 있어요 · 마지막 저장 ${at}`
      : saving
        ? '저장 중…'
        : `그룹장 · 저장됨 ${at}${remote.offline ? ' (연결 안 됨)' : ''}`
  }
  if (failed) {
    icon = <TriangleAlert size={16} aria-hidden className="shrink-0 text-danger" />
    text = remote.write.message!
  }

  return (
    <div
      role={failed ? 'alert' : 'status'}
      className="flex shrink-0 items-start gap-2 border-b border-line bg-surface-2 px-4 py-2 text-[13px] font-semibold leading-snug text-ink-2"
    >
      <span className="mt-1.5">{icon}</span>
      <span className="min-w-0 flex-1 py-1">{text}</span>
      {failed ? (
        <button onClick={remote.dismissWrite} aria-label="안내 닫기" className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-black/5">
          <X size={16} />
        </button>
      ) : (
        <button
          onClick={() => void remote.refresh()}
          disabled={remote.refreshing}
          aria-label="새로고침"
          className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-black/5"
        >
          <RefreshCw size={16} className={remote.refreshing ? 'animate-spin' : ''} />
        </button>
      )}
    </div>
  )
}
