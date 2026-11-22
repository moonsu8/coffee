import type { RemoteOp } from '../logic/remote-map'

/**
 * 한 그룹의 쓰기 대기열. 변경을 순서대로 하나씩 서버에 보내고, 성공할 때마다 기준 rev를 이어 간다.
 * 충돌(다른 기기가 먼저 바꿈)이나 오류가 나면 뒤에 쌓인 변경은 버린다(오래된 화면 기준으로 만든 변경이라 다시 보내면 안 된다).
 * 네트워크·React에 의존하지 않아 단독으로 테스트한다.
 */
export type WriteState = 'idle' | 'saving' | 'failed'
export type FailKind = 'conflict' | 'error' | 'norev'

export interface WriterDeps {
  apply(baseRev: number, ops: RemoteOp[]): Promise<{ status: 'ok' | 'conflict'; rev: number }>
  /** 지금 알고 있는 서버 rev (모르면 null) */
  getRev(): number | null
  /** 저장에 성공해서 서버 rev가 바뀜 */
  onSaved(rev: number): void
  onState(state: WriteState): void
  onFail(kind: FailKind, detail?: string): void
}

export interface Writer {
  enqueue(ops: RemoteOp[]): void
  /** 저장 중이거나 대기 중인 변경이 있는지 */
  busy(): boolean
}

export function createWriter(deps: WriterDeps): Writer {
  let queue: RemoteOp[][] = []
  let running = false

  const fail = (kind: FailKind, detail?: string) => {
    queue = []
    deps.onState('failed')
    deps.onFail(kind, detail)
  }

  async function drain() {
    running = true
    deps.onState('saving')
    try {
      while (queue.length) {
        const ops = queue.shift()!
        const rev = deps.getRev()
        if (rev === null) return fail('norev')
        let res
        try {
          res = await deps.apply(rev, ops)
        } catch (e) {
          return fail('error', e instanceof Error ? e.message : String(e))
        }
        if (res.status === 'conflict') return fail('conflict')
        deps.onSaved(res.rev)
      }
      deps.onState('idle')
    } finally {
      running = false
    }
  }

  return {
    enqueue(ops) {
      if (!ops.length) return
      queue.push(ops)
      if (!running) void drain()
    },
    busy: () => running || queue.length > 0,
  }
}
