import { Crown, Trash2, UserMinus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { isNetworkError, loadClient } from '@/remote/api'
import { listViewers, viewerLabel, type ViewerRow } from '@/remote/admin-api'
import { formatSyncTime } from '@/remote/format'
import { useRemote, type SharedGroup } from '@/remote/provider'
import { useToast } from './toast'
import { Button } from './ui/button'
import { Sheet, SheetFooter } from './ui/sheet'

type Mode = { kind: 'main' } | { kind: 'transfer'; viewer: ViewerRow; label: string } | { kind: 'delete' }

const joinedText = (iso: string) => {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  const d = new Date(t)
  return `${d.getMonth() + 1}/${d.getDate()} 참여`
}

/**
 * 그룹장: 그룹 관리. 참여 요청 승인/거절 · 그룹원 보기 · 내보내기 · 그룹장 넘기기 · 그룹 삭제.
 * 그룹원은 항상 보기 전용이고, 쓰기는 그룹장만 한다.
 */
export function ManageSheet({ shared, onClose }: { shared: SharedGroup | null; onClose: () => void }) {
  const remote = useRemote()
  const toast = useToast()
  const g = shared?.group
  const gid = g?.id
  const [viewers, setViewers] = useState<ViewerRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>({ kind: 'main' })
  const [confirmUser, setConfirmUser] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [typed, setTyped] = useState('')
  const timer = useRef<number | undefined>(undefined)

  const load = useCallback(async () => {
    if (!gid) return
    try {
      setViewers(await listViewers(await loadClient(), gid))
      setError(null)
    } catch (e) {
      setError(isNetworkError(e) ? '인터넷에 연결되면 불러올 수 있어요' : '그룹원을 불러오지 못했어요. 잠시 후 다시 시도해 주세요')
    }
  }, [gid])

  useEffect(() => {
    if (!gid) return
    setViewers(null)
    setMode({ kind: 'main' })
    setConfirmUser(null)
    setTyped('')
    setError(null)
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gid])

  // 참여 요청이 새로 오거나 그룹원이 바뀌면(실시간 신호 → 다시 읽기) 목록도 새로 읽는다
  const reqCount = gid ? (remote.requests[gid]?.length ?? 0) : 0
  useEffect(() => {
    if (gid) void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqCount, remote.groups.length])

  if (!shared || !g) return <Sheet open={false} onOpenChange={() => {}} title="그룹 관리" children={null} />

  const online = remote.online
  const requests = remote.requests[g.id] ?? []
  const labelOf = (v: ViewerRow) => viewerLabel(v, (viewers ?? []).indexOf(v))

  const remove = async (v: ViewerRow) => {
    if (confirmUser !== v.user_id) {
      setConfirmUser(v.user_id)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setConfirmUser(null), 3500)
      return
    }
    setConfirmUser(null)
    const r = await remote.removeViewer(g.id, v.user_id)
    if (r.ok) {
      toast({ message: `${labelOf(v)}님을 내보냈어요`, duration: 3000 })
      await load()
    } else setError(r.message ?? '내보내지 못했어요')
  }

  const decide = async (id: string, approve: boolean) => {
    setBusy(true)
    const r = await remote.resolveRequest(id, approve)
    setBusy(false)
    if (r.ok) {
      toast({ message: approve ? '참여를 승인했어요' : '참여 요청을 거절했어요', duration: 2500 })
      await load()
    } else setError(r.message ?? '처리하지 못했어요')
  }

  const doTransfer = async (v: ViewerRow) => {
    setBusy(true)
    const r = await remote.transferOwnership(g.id, v.user_id)
    setBusy(false)
    if (r.ok) {
      toast({ message: '그룹장을 넘겼어요. 이제 이 그룹은 보기 전용이에요', duration: 4000 })
      onClose()
    } else {
      setMode({ kind: 'main' })
      setError(r.message ?? '넘기지 못했어요')
    }
  }

  const doDelete = async () => {
    setBusy(true)
    const r = await remote.deleteGroup(g.id)
    setBusy(false)
    if (r.ok) {
      toast({ message: `${g.name} 그룹을 지웠어요`, duration: 4000 })
      onClose()
    } else {
      setMode({ kind: 'main' })
      setError(r.message ?? '지우지 못했어요')
    }
  }

  const close = () => {
    setMode({ kind: 'main' })
    setTyped('')
    onClose()
  }

  /* ───── 그룹장 넘기기 확인 ───── */
  if (mode.kind === 'transfer') {
    return (
      <Sheet open onOpenChange={(o) => !o && close()} title="그룹장을 넘길까요?" description={`${g.emoji} ${g.name}`}>
        <p className="mb-2 rounded-2xl bg-surface-2 p-3 text-[13px] leading-relaxed text-ink-2">
          <b>{mode.label}</b>님이 새 그룹장이 돼요. 넘기면 나는 이 그룹을 <b>보기만</b> 할 수 있고, 기록 수정·초대·그룹 삭제는 새 그룹장만 할 수 있어요. 되돌리려면 새 그룹장이 다시 넘겨 줘야 해요.
        </p>
        <SheetFooter className="flex gap-2">
          <Button variant="soft" size="lg" className="flex-1" onClick={() => setMode({ kind: 'main' })}>
            취소
          </Button>
          <Button size="lg" className="flex-1" disabled={busy || !online} onClick={() => void doTransfer(mode.viewer)}>
            {busy ? '넘기는 중…' : '그룹장 넘기기'}
          </Button>
        </SheetFooter>
      </Sheet>
    )
  }

  /* ───── 그룹 삭제 확인: 이름을 직접 입력 ───── */
  if (mode.kind === 'delete') {
    const ok = typed.trim() === g.name.trim()
    return (
      <Sheet open onOpenChange={(o) => !o && close()} title="그룹을 지울까요?" description={`${g.emoji} ${g.name}`}>
        <div className="space-y-3">
          <p className="rounded-2xl bg-surface-2 p-3 text-[13px] leading-relaxed text-ink-2">
            서버에 있는 이 그룹의 <b>멤버·기록·휴가·금액·주문이 모두 즉시 지워지고 되돌릴 수 없어요.</b> 그룹원{viewers ? ` ${viewers.length}명` : ''}은 더 이상 볼 수 없어요. 내 기기에 남아 있는 사본은 지워지지 않아요. 지우기 전에 설정 &gt; 데이터에서 내보내기를 해 두면 안전해요.
          </p>
          <label className="block text-[13px] font-semibold text-ink-2">
            확인하려면 그룹 이름 <b className="text-ink">{g.name}</b>을(를) 입력해 주세요
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              aria-label="그룹 이름 확인"
              autoComplete="off"
              className="mt-2 min-h-12 w-full rounded-2xl border border-line bg-surface-2 px-4 text-[16px] font-semibold text-ink"
            />
          </label>
        </div>
        <SheetFooter className="flex gap-2">
          <Button variant="soft" size="lg" className="flex-1" onClick={() => setMode({ kind: 'main' })}>
            취소
          </Button>
          <Button variant="danger" size="lg" className="flex-1" disabled={!ok || busy || !online} onClick={() => void doDelete()}>
            {busy ? '지우는 중…' : '그룹 지우기'}
          </Button>
        </SheetFooter>
      </Sheet>
    )
  }

  return (
    <Sheet open onOpenChange={(o) => !o && close()} title={`${g.emoji} ${g.name} 관리`} description="그룹원은 보기만 할 수 있고, 쓰기는 그룹장만 해요">
      <div className="space-y-5">
        {requests.length > 0 && (
          <section aria-label="참여 요청">
            <p className="mb-2 text-sm font-semibold text-ink-2">참여 요청 {requests.length}건</p>
            <ul className="space-y-2">
              {requests.map((r) => (
                <li key={r.id} className="flex items-center gap-2 rounded-[20px] bg-surface-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold">{r.nickname?.trim() || '(별명 없음)'}</p>
                    <p className="text-xs text-ink-2">{formatSyncTime(Date.parse(r.created_at))} 요청 · 코드를 보낸 사람이 맞는지 확인해 주세요</p>
                  </div>
                  <Button size="sm" variant="soft" disabled={busy || !online} onClick={() => void decide(r.id, false)}>
                    거절
                  </Button>
                  <Button size="sm" disabled={busy || !online} onClick={() => void decide(r.id, true)}>
                    승인
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-label="그룹원">
          <p className="mb-2 text-sm font-semibold text-ink-2">그룹원{viewers ? ` ${viewers.length}명` : ''}</p>
          {viewers === null && !error && <p className="text-[13px] text-ink-2">불러오는 중…</p>}
          {viewers !== null && viewers.length === 0 && <p className="rounded-2xl bg-surface-2 p-3 text-[13px] text-ink-2">아직 그룹원이 없어요. 초대 코드로 초대해 보세요.</p>}
          <ul className="space-y-2">
            {(viewers ?? []).map((v, i) => (
              <li key={v.user_id} className="flex items-center gap-2 rounded-[20px] bg-surface-2 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold">{viewerLabel(v, i)}</p>
                  <p className="text-xs text-ink-2">{joinedText(v.joined_at)} · 보기 전용</p>
                </div>
                <Button size="sm" variant="soft" disabled={!online} onClick={() => setMode({ kind: 'transfer', viewer: v, label: viewerLabel(v, i) })} aria-label={`${viewerLabel(v, i)}에게 그룹장 넘기기`}>
                  <Crown size={16} /> 넘기기
                </Button>
                <button
                  onClick={() => void remove(v)}
                  disabled={!online}
                  aria-label={`${viewerLabel(v, i)} 내보내기`}
                  className={cn('min-h-9 rounded-full px-3 text-xs font-bold', confirmUser === v.user_id ? 'bg-danger/15 text-danger' : 'text-ink-2')}
                >
                  {confirmUser === v.user_id ? (
                    '한 번 더 누르면 내보내요'
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <UserMinus size={14} /> 내보내기
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs leading-relaxed text-ink-2">내보낸 그룹원은 바로 이 그룹을 볼 수 없게 돼요. 같은 코드가 남아 있으면 다시 참여할 수 있으니, 필요하면 초대 코드를 취소해 주세요.</p>
        </section>

        {!online && <p className="rounded-2xl bg-surface-2 p-3 text-[13px] font-semibold text-ink-2">인터넷에 연결되면 관리할 수 있어요.</p>}
        {error && (
          <p role="alert" className="text-[13px] font-semibold text-danger">
            {error}
          </p>
        )}

        <section aria-label="위험 영역" className="border-t border-line pt-4">
          <Button variant="ghost" className="w-full text-danger" onClick={() => setMode({ kind: 'delete' })} disabled={!online}>
            <Trash2 size={16} /> 이 그룹 지우기
          </Button>
        </section>

        <SheetFooter>
          <Button variant="soft" size="lg" className="w-full" onClick={close}>
            닫기
          </Button>
        </SheetFooter>
      </div>
    </Sheet>
  )
}
