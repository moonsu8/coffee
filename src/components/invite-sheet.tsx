import { Copy, Minus, Plus, Share2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { copyText } from '@/lib/effects'
import { cn } from '@/lib/utils'
import { countViewers, createInviteRpc, isNetworkError, listInvites, loadClient, revokeInviteRpc } from '@/remote/api'
import {
  clampMaxUses,
  defaultInviteOptions,
  formatExpiry,
  INVITE_TTL_OPTIONS,
  inviteShareText,
  inviteStatus,
  type InviteRow,
} from '@/remote/invite'
import { useRemote, type SharedGroup } from '@/remote/provider'
import { useToast } from './toast'
import { Button } from './ui/button'
import { Sheet, SheetFooter } from './ui/sheet'

/**
 * 그룹장: 초대 코드 만들기 · 복사 · 취소. 코드는 8자리, 기본 유효 7일 / 인원은 그룹 멤버 수 정도.
 * 코드로 참여한 사람은 이 그룹을 보기만 할 수 있다(그룹원은 항상 보기 전용).
 */
export function InviteSheet({ shared, onClose }: { shared: SharedGroup | null; onClose: () => void }) {
  const remote = useRemote()
  const toast = useToast()
  const g = shared?.group
  const defaults = defaultInviteOptions(g?.members.length ?? 1)
  const [ttl, setTtl] = useState(defaults.ttlHours)
  const [maxUses, setMaxUses] = useState(defaults.maxUses)
  const [approval, setApproval] = useState(false)
  const [invites, setInvites] = useState<InviteRow[] | null>(null)
  const [viewers, setViewers] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmCode, setConfirmCode] = useState<string | null>(null)
  const confirmTimer = useRef<number | undefined>(undefined)
  const gid = g?.id

  // 열릴 때마다 기본값으로 되돌리고 서버 목록을 읽는다
  const load = useCallback(async () => {
    if (!gid) return
    try {
      const c = await loadClient()
      const [list, n] = await Promise.all([listInvites(c, gid), countViewers(c, gid)])
      setInvites(list)
      setViewers(n)
      setError(null)
    } catch (e) {
      setError(isNetworkError(e) ? '인터넷에 연결되면 초대 코드를 만들 수 있어요' : '초대 코드를 불러오지 못했어요. 잠시 후 다시 시도해 주세요')
    }
  }, [gid])

  useEffect(() => {
    if (!gid) return
    const d = defaultInviteOptions(g?.members.length ?? 1)
    setTtl(d.ttlHours)
    setMaxUses(d.maxUses)
    setApproval(false)
    setInvites(null)
    setViewers(null)
    setConfirmCode(null)
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gid])

  if (!shared || !g) {
    return <Sheet open={false} onOpenChange={() => {}} title="초대" children={null} />
  }

  const online = remote.online
  const active = (invites ?? []).filter((i) => inviteStatus(i) === 'active')
  const appUrl = typeof location !== 'undefined' ? location.origin + location.pathname : ''

  const create = async () => {
    setBusy(true)
    setError(null)
    try {
      const c = await loadClient()
      await createInviteRpc(c, g.id, { ttlHours: ttl, maxUses: clampMaxUses(maxUses), requiresApproval: approval })
      await load()
      toast({ message: '초대 코드를 만들었어요', duration: 2500 })
    } catch (e) {
      setError(isNetworkError(e) ? '인터넷에 연결되면 초대 코드를 만들 수 있어요' : '초대 코드를 만들지 못했어요. 잠시 후 다시 시도해 주세요')
    } finally {
      setBusy(false)
    }
  }

  const copy = async (inv: InviteRow, whole: boolean) => {
    const text = whole ? inviteShareText({ emoji: g.emoji, name: g.name, code: inv.code, expiresAt: inv.expires_at, maxUses: inv.max_uses, appUrl }) : inv.code
    const ok = await copyText(text)
    toast({ message: ok ? (whole ? '초대 안내를 복사했어요' : '코드를 복사했어요') : '복사에 실패했어요. 코드를 직접 눌러 선택해 주세요', duration: 2500 })
  }

  const revoke = async (code: string) => {
    // 실수로 누르지 않게 한 번 더 누르면 취소된다
    if (confirmCode !== code) {
      setConfirmCode(code)
      window.clearTimeout(confirmTimer.current)
      confirmTimer.current = window.setTimeout(() => setConfirmCode(null), 3500)
      return
    }
    setConfirmCode(null)
    try {
      const c = await loadClient()
      await revokeInviteRpc(c, code)
      await load()
      toast({ message: '초대 코드를 취소했어요. 이미 참여한 사람은 그대로 볼 수 있어요', duration: 3500 })
    } catch {
      setError('코드를 취소하지 못했어요. 잠시 후 다시 시도해 주세요')
    }
  }

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${g.emoji} ${g.name} 초대`}
      description={`코드로 참여한 사람은 이 그룹을 보기만 할 수 있어요${viewers !== null ? ` · 지금 그룹원 ${viewers}명` : ''}`}
    >
      <div className="space-y-4">
        <section aria-label="새 초대 코드">
          <p className="mb-2 text-sm font-semibold text-ink-2">유효 기간</p>
          <div className="flex gap-2" role="radiogroup" aria-label="유효 기간">
            {INVITE_TTL_OPTIONS.map((o) => (
              <button
                key={o.hours}
                role="radio"
                aria-checked={ttl === o.hours}
                onClick={() => setTtl(o.hours)}
                className={cn('min-h-11 flex-1 rounded-2xl text-[15px] font-bold', ttl === o.hours ? 'bg-caramel text-on-caramel' : 'bg-surface-2 text-ink-2')}
              >
                {o.label}
              </button>
            ))}
          </div>

          <p className="mt-4 mb-2 text-sm font-semibold text-ink-2">참여할 수 있는 인원</p>
          <div className="flex items-center gap-2">
            <button aria-label="인원 줄이기" onClick={() => setMaxUses((n) => clampMaxUses(n - 1))} className="grid size-11 place-items-center rounded-2xl bg-surface-2">
              <Minus size={18} />
            </button>
            <input
              aria-label="참여 인원"
              inputMode="numeric"
              value={maxUses}
              onChange={(e) => setMaxUses(clampMaxUses(Number(e.target.value.replace(/\D/g, ''))))}
              className="min-h-11 w-20 rounded-2xl border border-line bg-surface-2 text-center text-lg font-bold"
            />
            <button aria-label="인원 늘리기" onClick={() => setMaxUses((n) => clampMaxUses(n + 1))} className="grid size-11 place-items-center rounded-2xl bg-surface-2">
              <Plus size={18} />
            </button>
            <span className="text-[13px] text-ink-2">명 (그룹 멤버 {g.members.length}명 기준)</span>
          </div>

          <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl bg-surface-2 px-4 py-2.5">
            <input type="checkbox" checked={approval} onChange={(e) => setApproval(e.target.checked)} aria-label="참여하기 전에 내 승인 받기" className="mt-0.5 size-5 shrink-0 accent-[var(--caramel)]" />
            <span>
              <span className="block text-[15px] font-semibold">참여하기 전에 내 승인 받기</span>
              <span className="block text-xs leading-snug text-ink-2">코드를 입력해도 그룹 관리에서 승인해야 볼 수 있어요</span>
            </span>
          </label>
        </section>

        <section aria-label="지금 쓸 수 있는 코드">
          <p className="mb-2 text-sm font-semibold text-ink-2">지금 쓸 수 있는 코드</p>
          {invites === null && !error && <p className="text-[13px] text-ink-2">불러오는 중…</p>}
          {invites !== null && active.length === 0 && <p className="rounded-2xl bg-surface-2 p-3 text-[13px] text-ink-2">아직 만든 코드가 없어요. 위에서 만들어 주세요.</p>}
          <ul className="space-y-2">
            {active.map((inv) => (
              <li key={inv.code} className="rounded-[20px] bg-surface-2 p-3">
                <div className="flex items-center justify-between gap-2">
                  <button onClick={() => void copy(inv, false)} aria-label={`코드 ${inv.code} 복사`} className="text-left font-mono text-[22px] font-extrabold tracking-[0.2em]">
                    {inv.code}
                  </button>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="soft" onClick={() => void copy(inv, false)} aria-label="코드 복사">
                      <Copy size={16} /> 복사
                    </Button>
                    <Button size="sm" variant="soft" onClick={() => void copy(inv, true)} aria-label="초대 안내 문구 복사">
                      <Share2 size={16} /> 안내문
                    </Button>
                  </div>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="text-xs text-ink-2">
                    {formatExpiry(inv.expires_at)} · {inv.uses}/{inv.max_uses}명 참여{inv.requires_approval ? ' · 승인 필요' : ''}
                  </p>
                  <button onClick={() => void revoke(inv.code)} className={cn('min-h-9 rounded-full px-3 text-xs font-bold', confirmCode === inv.code ? 'bg-danger/15 text-danger' : 'text-ink-2')}>
                    {confirmCode === inv.code ? '한 번 더 누르면 취소' : '코드 취소'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {!online && <p className="rounded-2xl bg-surface-2 p-3 text-[13px] font-semibold text-ink-2">인터넷에 연결되면 초대 코드를 만들 수 있어요.</p>}
        {error && (
          <p role="alert" className="text-[13px] font-semibold text-danger">
            {error}
          </p>
        )}
        <SheetFooter className="flex gap-2">
          <Button variant="soft" size="lg" className="flex-1" onClick={onClose}>
            닫기
          </Button>
          <Button size="lg" className="flex-1" onClick={() => void create()} disabled={busy || !online}>
            {busy ? '만드는 중…' : '새 코드 만들기'}
          </Button>
        </SheetFooter>
      </div>
    </Sheet>
  )
}
