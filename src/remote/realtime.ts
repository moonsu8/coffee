/**
 * Realtime 동기화(순수 로직, 통신은 주입). 구독 대상은 `groups` 테이블의 내 그룹 행(rev) 하나뿐이다.
 * 알림 내용은 믿지 않고 "다시 읽어라"는 신호로만 쓴다 → 읽기는 기존 get_group_snapshot(RLS 적용, 일관된 스냅샷).
 *  - 내가 막 저장해서 생긴 알림(rev가 이미 아는 값 이하)은 무시한다.
 *  - 짧은 시간에 여러 번 오면 한 번으로 묶는다(debounce).
 *  - 구독이 SUBSCRIBED(live)가 될 때마다 한 번 다시 읽는다: 처음 연결 때도 포함한다. 앱이 마지막으로 읽은 시점과
 *    구독이 실제로 켜진 시점 사이에 생긴 변경, 끊긴 동안 놓친 변경을 모두 보충한다(여러 채널의 live는 한 번으로 묶인다).
 */

export type RealtimeState = 'off' | 'connecting' | 'live' | 'down'
export type ChannelStatus = 'live' | 'down'
export interface GroupEvent {
  type: 'INSERT' | 'UPDATE' | 'DELETE'
  /** UPDATE일 때 새 rev (알 수 없으면 undefined) */
  rev?: number
}

export interface RealtimeDeps {
  /** 그룹 하나를 구독하고 해제 함수를 돌려준다 */
  open: (gid: string, onEvent: (e: GroupEvent) => void, onStatus: (s: ChannelStatus) => void) => () => void
  /** 지금 아는 rev (없으면 null/undefined) */
  getRev: (gid: string) => number | null | undefined
  /** 서버에서 다시 읽기 */
  refresh: () => void
  onState: (s: RealtimeState) => void
  debounceMs?: number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (t: unknown) => void
}

export interface RealtimeSync {
  /** 구독할 그룹 id 목록을 맞춘다(새로 생긴 건 열고, 없어진 건 닫는다) */
  sync: (gids: string[]) => void
  close: () => void
}

export function createRealtimeSync(d: RealtimeDeps): RealtimeSync {
  const setTimer = d.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = d.clearTimer ?? ((t) => clearTimeout(t as ReturnType<typeof setTimeout>))
  const debounceMs = d.debounceMs ?? 800
  const chans = new Map<string, { off: () => void; status: ChannelStatus | 'connecting' }>()
  let timer: unknown = null
  let last: RealtimeState = 'off'

  const schedule = () => {
    if (timer !== null) return
    timer = setTimer(() => {
      timer = null
      d.refresh()
    }, debounceMs)
  }

  const publish = () => {
    let s: RealtimeState
    if (chans.size === 0) s = 'off'
    else {
      const all = [...chans.values()]
      s = all.some((c) => c.status === 'down') ? 'down' : all.every((c) => c.status === 'live') ? 'live' : 'connecting'
    }
    if (s !== last) {
      last = s
      d.onState(s)
    }
  }

  return {
    sync(gids) {
      const want = new Set(gids)
      for (const [gid, c] of chans) {
        if (!want.has(gid)) {
          c.off()
          chans.delete(gid)
        }
      }
      for (const gid of want) {
        if (chans.has(gid)) continue
        const entry = { off: () => {}, status: 'connecting' as ChannelStatus | 'connecting' }
        chans.set(gid, entry)
        entry.off = d.open(
          gid,
          (e) => {
            if (e.type === 'UPDATE' && e.rev !== undefined) {
              const known = d.getRev(gid)
              if (known !== null && known !== undefined && e.rev <= known) return // 내가 저장한 변경
            }
            schedule()
          },
          (s) => {
            const prev = entry.status
            entry.status = s
            if (s === 'live' && prev !== 'live') schedule() // 구독이 켜지기 전·끊긴 동안 생긴 변경을 보충
            publish()
          },
        )
      }
      publish()
    },
    close() {
      for (const c of chans.values()) c.off()
      chans.clear()
      if (timer !== null) {
        clearTimer(timer)
        timer = null
      }
      publish()
    },
  }
}
