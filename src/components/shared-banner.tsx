import { Cloud, CopyX, Eye, RefreshCw, TriangleAlert, X } from 'lucide-react'
import { useState } from 'react'
import { formatSyncTime } from '@/remote/format'
import { goneMessage } from '@/remote/gone'
import { useRemote } from '@/remote/provider'
import { useStore } from '@/store/store'
import { Button } from './ui/button'
import { Sheet, SheetFooter } from './ui/sheet'

/**
 * 서버(공유) 그룹을 보는 중일 때만 화면 맨 위에 뜨는 안내.
 *  - 그룹원: 보기 전용 + 마지막 업데이트 시각
 *  - 그룹장: 저장 중 / 저장됨 / 저장하지 못함(이유) / 오프라인이라 수정할 수 없음
 */
export function SharedBanner() {
  const { access } = useStore()
  const remote = useRemote()
  if (access.staleCopy) return <StaleCopyBanner />
  if (access.kind !== 'remote') return null
  const at = access.lastSyncedAt ? formatSyncTime(access.lastSyncedAt) : '-'
  const owner = access.role === 'owner'
  const failed = owner && remote.write.state === 'failed' && !!remote.write.message
  const saving = owner && remote.write.state === 'saving'

  let icon = <Eye size={16} aria-hidden className="shrink-0" />
  const live = remote.realtime === 'live' && !remote.offline ? ' · 실시간' : ''
  let text = `보기 전용 · 마지막 업데이트 ${at}${remote.offline ? ' (연결 안 됨)' : live}`
  if (owner) {
    icon = <Cloud size={16} aria-hidden className="shrink-0" />
    text = !remote.online
      ? `인터넷에 연결되면 수정할 수 있어요 · 마지막 저장 ${at}`
      : saving
        ? '저장 중…'
        : `그룹장 · 저장됨 ${at}${remote.offline ? ' (연결 안 됨)' : live}`
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

/** 서버 그룹이 삭제됐거나 내가 빠져서 목록에서 사라졌을 때의 안내 (어느 화면에서든 보인다) */
export function GoneNotices() {
  const remote = useRemote()
  if (!remote.notices.length) return null
  return (
    <div className="shrink-0">
      {remote.notices.map((n) => (
        <div key={n.id} role="alert" className="flex items-start gap-2 border-b border-line bg-surface-2 px-4 py-2 text-[13px] font-semibold leading-snug text-ink-2">
          <span className="mt-1.5">
            <TriangleAlert size={16} aria-hidden className="shrink-0 text-danger" />
          </span>
          <span className="min-w-0 flex-1 py-1">{goneMessage(n)}</span>
          <button onClick={() => remote.dismissNotice(n.id)} aria-label="안내 닫기" className="grid size-9 shrink-0 place-items-center rounded-full hover:bg-black/5">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}

/**
 * 서버로 옮긴 그룹의 "이전 사본"(서버 그룹이 지금 안 보이는 내 기기 그룹).
 * 기본은 수정할 수 없고, 경고를 확인해야 이번 실행 동안 수정할 수 있다.
 */
function StaleCopyBanner() {
  const { access, data, unlockCopy } = useStore()
  const [ask, setAsk] = useState(false)
  return (
    <>
      <div role="status" className="flex shrink-0 items-start gap-2 border-b border-line bg-surface-2 px-4 py-2 text-[13px] font-semibold leading-snug text-ink-2">
        <span className="mt-1.5">
          <CopyX size={16} aria-hidden className="shrink-0" />
        </span>
        <span className="min-w-0 flex-1 py-1">
          {access.canWrite
            ? '서버로 옮긴 그룹의 이전 사본 · 여기서 고친 내용은 서버 그룹에 반영되지 않아요'
            : '서버로 옮긴 그룹의 이전 사본이에요. 서버 그룹은 로그인하면 볼 수 있어요'}
        </span>
        {!access.canWrite && (
          <Button size="sm" variant="soft" onClick={() => setAsk(true)}>
            수정하기
          </Button>
        )}
      </div>
      <Sheet open={ask} onOpenChange={setAsk} title="이전 사본을 수정할까요?" description="이 그룹은 서버로 옮긴 그룹의 이전 사본이에요">
        <p className="mb-2 rounded-2xl bg-surface-2 p-3 text-[13px] leading-relaxed text-ink-2">
          여기서 기록하거나 고쳐도 <b>서버 그룹에는 반영되지 않아요.</b> 그룹원은 서버 그룹을 보기 때문에, 이 사본에만 남은 기록은 따로 어긋나요. 서버 그룹에서 수정하려면 로그인해서 서버 그룹을 열어 주세요.
        </p>
        <SheetFooter className="flex gap-2">
          <Button variant="soft" size="lg" className="flex-1" onClick={() => setAsk(false)}>
            취소
          </Button>
          <Button
            size="lg"
            className="flex-1"
            onClick={() => {
              unlockCopy(data.groupId)
              setAsk(false)
            }}
          >
            그래도 수정하기
          </Button>
        </SheetFooter>
      </Sheet>
    </>
  )
}
