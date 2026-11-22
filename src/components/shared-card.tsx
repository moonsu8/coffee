import { LogIn, RefreshCw, Users } from 'lucide-react'
import { useState } from 'react'
import { Card, SectionTitle } from '@/components/common'
import { useToast } from '@/components/toast'
import { Button } from '@/components/ui/button'
import { Sheet, SheetFooter } from '@/components/ui/sheet'
import { checkInviteCode, codeMessage, normalizeInviteCode } from '@/remote/invite'
import { formatSyncTime } from '@/remote/format'
import { useRemote, type SharedGroup } from '@/remote/provider'

/**
 * 설정의 "공유 그룹" 카드. 서버 연결이 설정된 빌드에서만 보인다(환경 변수가 없으면 아무것도 그리지 않는다).
 * 이 앱에서 서버 그룹은 읽기 전용이다.
 */
export function SharedCard() {
  const remote = useRemote()
  const toast = useToast()
  const [joinOpen, setJoinOpen] = useState(false)
  const [googleOpen, setGoogleOpen] = useState(false)
  const [outOpen, setOutOpen] = useState(false)
  const [leaving, setLeaving] = useState<SharedGroup | null>(null)

  if (!remote.enabled) return null
  const { user, groups } = remote

  return (
    <Card className="p-4">
      <SectionTitle
        right={
          user ? (
            <Button size="sm" variant="soft" onClick={() => void remote.refresh()} disabled={remote.refreshing} aria-label="공유 그룹 새로고침">
              <RefreshCw size={16} className={remote.refreshing ? 'animate-spin' : ''} /> 새로고침
            </Button>
          ) : undefined
        }
      >
        공유 그룹
      </SectionTitle>

      {!user && groups.length === 0 && (
        <p className="mb-3 text-[13px] leading-relaxed text-ink-2">
          그룹장이 알려준 초대 코드로 참여하면 당번과 기록을 볼 수 있어요. 볼 수만 있고 고칠 수는 없어요.
        </p>
      )}
      {user && (
        <p className="mb-3 text-[13px] leading-relaxed text-ink-2">
          {user.anonymous
            ? '초대 코드로 참여 중이에요. 이 기기에서만 유지돼서, 앱 데이터를 지우면 코드를 다시 입력해야 해요.'
            : 'Google 계정으로 로그인돼 있어요.'}
        </p>
      )}

      {groups.length > 0 && (
        <ul className="mb-3 divide-y divide-line">
          {groups.map((s) => (
            <li key={s.group.id} className="flex min-h-14 items-center gap-3 py-2">
              <span aria-hidden className="text-xl">
                {s.group.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">{s.group.name}</p>
                <p className="text-xs text-ink-2">
                  {s.role === 'owner' ? '그룹장' : '보기 전용'} · 업데이트 {formatSyncTime(s.fetchedAt)}
                </p>
              </div>
              {s.role === 'viewer' && (
                <Button size="sm" variant="ghost" onClick={() => setLeaving(s)}>
                  나가기
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {remote.offline && groups.length > 0 && <p className="mb-3 text-[13px] font-semibold text-caramel-ink">인터넷에 연결되지 않아 마지막으로 받은 내용을 보여주고 있어요.</p>}

      <div className="grid gap-2">
        <Button variant="soft" className="w-full justify-start" onClick={() => setJoinOpen(true)}>
          <Users size={18} /> 초대 코드로 참여
        </Button>
        {/* 코드로 참여한 익명 계정에서 바로 Google로 바꾸면 참여한 그룹이 이어지지 않는다(계정 연결은 나중에). 로그아웃 상태에서만 보여준다 */}
        {!user && (
          <Button variant="soft" className="w-full justify-start" onClick={() => setGoogleOpen(true)}>
            <LogIn size={18} /> Google로 로그인
          </Button>
        )}
        {user && (
          <Button variant="ghost" className="w-full" onClick={() => setOutOpen(true)}>
            로그아웃
          </Button>
        )}
      </div>

      <JoinSheet open={joinOpen} onClose={() => setJoinOpen(false)} />
      <GoogleSheet open={googleOpen} onClose={() => setGoogleOpen(false)} />

      <Sheet open={outOpen} onOpenChange={setOutOpen} title="로그아웃할까요?" description="이 기기에 저장된 공유 그룹 내용도 지워져요. 내 기기 그룹은 그대로예요.">
        {user?.anonymous && (
          <p className="mb-2 rounded-2xl bg-surface-2 p-3 text-[13px] leading-relaxed text-ink-2">
            코드로 참여한 계정은 로그아웃하면 되찾을 수 없어요. 다시 보려면 그룹장에게 새 초대 코드를 받아야 해요.
          </p>
        )}
        <SheetFooter className="flex gap-2">
          <Button variant="soft" size="lg" className="flex-1" onClick={() => setOutOpen(false)}>
            취소
          </Button>
          <Button
            size="lg"
            className="flex-1"
            onClick={async () => {
              setOutOpen(false)
              await remote.signOut()
              toast({ message: '로그아웃했어요', duration: 2500 })
            }}
          >
            로그아웃
          </Button>
        </SheetFooter>
      </Sheet>

      <Sheet open={!!leaving} onOpenChange={(o) => !o && setLeaving(null)} title={`${leaving?.group.name ?? ''} 그룹에서 나갈까요?`} description="나가면 이 그룹을 볼 수 없어요. 다시 보려면 초대 코드가 필요해요.">
        <SheetFooter className="flex gap-2">
          <Button variant="soft" size="lg" className="flex-1" onClick={() => setLeaving(null)}>
            취소
          </Button>
          <Button
            size="lg"
            className="flex-1"
            onClick={async () => {
              const g = leaving
              setLeaving(null)
              if (!g) return
              const r = await remote.leave(g.group.id)
              toast({ message: r.ok ? '그룹에서 나갔어요' : (r.message ?? '나가지 못했어요'), duration: 3500 })
            }}
          >
            나가기
          </Button>
        </SheetFooter>
      </Sheet>
    </Card>
  )
}

function AgeCheck({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl bg-surface-2 px-4 py-2.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[var(--caramel)]" />
      <span className="text-[15px] font-semibold">만 14세 이상이에요</span>
    </label>
  )
}

function JoinSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const remote = useRemote()
  const toast = useToast()
  const [code, setCode] = useState('')
  const [adult, setAdult] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    setCode('')
    setAdult(false)
    setError(null)
    onClose()
  }

  const submit = async () => {
    const c = checkInviteCode(code)
    if (!c.ok) return setError(codeMessage(c.reason))
    if (!adult) return setError('만 14세 이상만 참여할 수 있어요')
    setBusy(true)
    setError(null)
    const r = await remote.join(c.code)
    setBusy(false)
    if (!r.ok) return setError(r.message)
    toast({
      message: r.pending ? '참여 요청을 보냈어요. 그룹장이 승인하면 볼 수 있어요' : `${r.name ?? '그룹'}에 참여했어요`,
      duration: 3500,
    })
    close()
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && close()} title="초대 코드로 참여" description="그룹장에게 받은 8자리 코드를 입력해 주세요">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
        className="space-y-3"
      >
        <input
          value={code}
          onChange={(e) => setCode(normalizeInviteCode(e.target.value).slice(0, 12))}
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          maxLength={12}
          aria-label="초대 코드"
          placeholder="예) K7M2QX4P"
          className="min-h-14 w-full rounded-2xl border border-line bg-surface-2 px-4 text-center text-xl font-bold tracking-[0.25em] placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-ink-2/70"
        />
        <AgeCheck checked={adult} onChange={setAdult} />
        <p className="text-[13px] leading-relaxed text-ink-2">
          참여하면 이 그룹의 별명·기록을 볼 수 있어요. 서버에는 그룹 내용이 저장되고, 그룹에 속한 사람만 볼 수 있어요.
        </p>
        {error && (
          <p role="alert" className="text-[13px] font-semibold text-danger">
            {error}
          </p>
        )}
        <SheetFooter>
          {/* SheetFooter는 시트 아래쪽 영역으로 옮겨 그려져서 폼 안의 submit 버튼이 폼과 연결되지 않는다 → 클릭 핸들러로 처리 */}
          <Button size="lg" className="w-full" type="button" onClick={() => void submit()} disabled={busy}>
            {busy ? '확인하는 중…' : '참여하기'}
          </Button>
        </SheetFooter>
      </form>
    </Sheet>
  )
}

function GoogleSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const remote = useRemote()
  const [adult, setAdult] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const go = async () => {
    if (!adult) return setError('만 14세 이상만 쓸 수 있어요')
    setBusy(true)
    const r = await remote.signInGoogle()
    if (!r.ok) {
      setBusy(false)
      setError(r.message ?? 'Google 로그인을 시작하지 못했어요')
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Google로 로그인" description="그룹장 기능과 여러 기기에서 쓰려면 로그인해요">
      <div className="space-y-3">
        <AgeCheck checked={adult} onChange={setAdult} />
        <p className="text-[13px] leading-relaxed text-ink-2">
          Google 로그인으로 이메일 주소가 계정 확인용으로만 쓰여요. 내 기기 그룹은 그대로 이 기기에 있어요.
        </p>
        {error && (
          <p role="alert" className="text-[13px] font-semibold text-danger">
            {error}
          </p>
        )}
        <SheetFooter>
          <Button size="lg" className="w-full" onClick={() => void go()} disabled={busy}>
            {busy ? '이동하는 중…' : 'Google로 계속'}
          </Button>
        </SheetFooter>
      </div>
    </Sheet>
  )
}
