import { useState } from 'react'
import { serialize } from '@/lib/migrate'
import { useRemote } from '@/remote/provider'
import { useStore } from '@/store/store'
import type { Group } from '@/types'
import { useToast } from './toast'
import { Button } from './ui/button'
import { Sheet, SheetFooter } from './ui/sheet'

type Phase = { kind: 'confirm'; error?: string } | { kind: 'running' } | { kind: 'done'; remoteId: string; verified: boolean; mismatch: string[] }

const FIELD_NAME: Record<string, string> = {
  name: '이름',
  emoji: '이모지',
  schedule: '요일',
  config: '설정',
  members: '멤버',
  records: '기록',
  absences: '휴가',
  skipDays: '쉬는 날',
  coffee: '주문·가격표·설정',
}

/** 내 기기 그룹을 서버로 옮기는 시트: 확인 → 백업·올리기·대조 → 결과 */
export function ShareSheet({ group, onClose }: { group: Group | null; onClose: () => void }) {
  const remote = useRemote()
  const { root, groups, switchGroup, removeGroup } = useStore()
  const toast = useToast()
  const [phase, setPhase] = useState<Phase>({ kind: 'confirm' })

  const close = () => {
    setPhase({ kind: 'confirm' })
    onClose()
  }

  const user = remote.user
  const blocked = !user ? '먼저 설정 > 공유 그룹에서 Google로 로그인해 주세요.' : user.anonymous ? '초대 코드로 참여한 계정으로는 옮길 수 없어요. 로그아웃한 뒤 Google로 로그인해 주세요.' : !remote.online ? '인터넷에 연결되면 옮길 수 있어요.' : null

  const run = async () => {
    if (!group) return
    setPhase({ kind: 'running' })
    const res = await remote.shareGroup(group, serialize(root))
    if (!res.ok) return setPhase({ kind: 'confirm', error: res.message })
    if (res.verified) switchGroup(res.remoteId) // 옮긴 서버 그룹을 바로 보여준다
    setPhase({ kind: 'done', remoteId: res.remoteId, verified: res.verified, mismatch: res.mismatch })
  }

  const done = phase.kind === 'done' ? phase : null

  return (
    <Sheet
      open={!!group}
      onOpenChange={(o) => !o && phase.kind !== 'running' && close()}
      title={done ? (done.verified ? '서버로 옮겼어요' : '옮겼지만 확인이 필요해요') : `'${group?.name ?? ''}' 그룹을 서버로 옮길까요?`}
      description={done ? undefined : '여러 기기에서 쓰고, 초대 코드로 다른 사람이 볼 수 있어요'}
    >
      {phase.kind !== 'done' && (
        <div className="space-y-3">
          <ul className="space-y-2 text-[14px] leading-relaxed text-ink-2">
            <li>• 서버에 저장돼요. 초대 코드를 받은 사람은 볼 수 있고, 고치는 건 그룹장(나)만 해요.</li>
            <li>• 멤버 이름은 실명 대신 별명도 괜찮아요. 메모에는 주민번호·카드번호 등을 적지 마세요.</li>
            <li>• 옮기기 전에 이 기기에 백업을 남기고, 옮긴 뒤 내용이 같은지 확인해요.</li>
            <li>• 이 기기의 그룹은 지우지 않아요. 서버 그룹이 보이는 동안은 목록에서 숨겨져요.</li>
          </ul>
          {blocked && <p className="rounded-2xl bg-surface-2 p-3 text-[13px] font-semibold text-ink-2">{blocked}</p>}
          {phase.kind === 'confirm' && phase.error && (
            <p role="alert" className="text-[13px] font-semibold text-danger">
              {phase.error}
            </p>
          )}
          <SheetFooter className="flex gap-2">
            <Button variant="soft" size="lg" className="flex-1" onClick={close} disabled={phase.kind === 'running'}>
              취소
            </Button>
            <Button size="lg" className="flex-1" onClick={() => void run()} disabled={!!blocked || phase.kind === 'running'}>
              {phase.kind === 'running' ? '옮기는 중…' : '서버로 옮기기'}
            </Button>
          </SheetFooter>
        </div>
      )}

      {done && (
        <div className="space-y-3">
          {done.verified ? (
            <p className="text-[14px] leading-relaxed text-ink-2">
              서버에서 다시 읽어 내용이 같은 것을 확인했어요. 이제 서버 그룹이 보여요. 이 기기의 사본은 그대로 남아 있고, 로그아웃하면 "서버로 옮긴 그룹의 이전 사본"으로 보여요.
            </p>
          ) : (
            <div className="space-y-2 text-[14px] leading-relaxed">
              <p className="font-semibold text-danger">서버에 올라갔지만 일부 내용이 달라 보여요: {done.mismatch.map((k) => FIELD_NAME[k] ?? k).join(', ') || '확인하지 못했어요'}</p>
              <p className="text-ink-2">이 기기의 사본을 지우지 마세요. 백업은 이 기기에 남아 있어요. 설정에서 새로고침해 서버 그룹을 직접 확인해 주세요.</p>
            </div>
          )}
          <SheetFooter className="flex gap-2">
            {done.verified && groups.length > 1 && group && (
              <Button
                variant="soft"
                size="lg"
                className="flex-1"
                onClick={() => {
                  const undo = removeGroup(group.id)
                  close()
                  if (undo) toast({ message: '이 기기의 사본을 삭제했어요', actionLabel: '되돌리기', onAction: undo })
                }}
              >
                이 기기 사본 삭제
              </Button>
            )}
            <Button size="lg" className="flex-1" onClick={close}>
              닫기
            </Button>
          </SheetFooter>
        </div>
      )}
    </Sheet>
  )
}
