// Production SttPort: drives a crash-isolated whisper worker (utilityProcess in the app, a fake in tests).
// Electron-free and native-free so compose can import MODEL_FILES safely.
import type { Logger } from '../log'
import type { SttPort, SttResult } from '../ports'
import type { FromWorker, ToWorker } from './protocol'

export const MODEL_FILES = {
  turbo: 'ggml-large-v3-turbo-q5_0.bin',
  base: 'ggml-base.en.bin'
} as const
export type SttModel = keyof typeof MODEL_FILES
export type WhisperStatus = 'metal' | 'cpu' | 'failed'
export type ChildLike = {
  postMessage(m: ToWorker): void
  on(ev: 'message', cb: (m: FromWorker) => void): unknown
  on(ev: 'exit', cb: (code: number) => void): unknown
  kill(): boolean
}

export class SttCrashed extends Error {
  constructor(message = 'crashed') {
    super(message)
    this.name = 'SttCrashed'
  }
}

type Pending = {
  resolve(r: SttResult): void
  reject(e: Error): void
  timer: ReturnType<typeof setTimeout>
}

export function createWhisperStt(o: {
  fork(): ChildLike
  model: string
  log: Logger
  timeoutMs?: number
}): SttPort & { warm(): Promise<void>; status(): Promise<WhisperStatus>; dispose(): void } {
  const timeoutMs = o.timeoutMs ?? 60_000
  let child: ChildLike | null = null
  let ready: Promise<WhisperStatus> | null = null
  let settleReady: ((s: WhisperStatus) => void) | null = null
  let warming: Promise<void> = Promise.resolve()
  let queue: Promise<unknown> = Promise.resolve()
  let nextId = 0
  const pending = new Map<number, Pending>()

  function enqueue<T>(job: () => Promise<T>): Promise<T> {
    const p = queue.then(job)
    queue = p.catch(() => undefined)
    return p
  }

  function rejectAll(reason: string): void {
    for (const p of pending.values()) {
      clearTimeout(p.timer)
      p.reject(new SttCrashed(reason))
    }
    pending.clear()
  }

  /** Forget the current worker; the next call forks a fresh one. */
  function drop(reason: string, kill: boolean): void {
    const c = child
    child = null
    ready = null
    settleReady?.('failed')
    settleReady = null
    rejectAll(reason)
    if (kill) c?.kill()
  }

  function start(): Promise<WhisperStatus> {
    if (ready) return ready
    const c = o.fork()
    child = c
    ready = new Promise((r) => (settleReady = r))
    c.on('message', (m) => {
      if (c !== child) return
      if (m.type === 'ready') {
        const s: WhisperStatus = m.gpus.length > 0 ? 'metal' : 'cpu'
        if (s === 'cpu') o.log.warn('stt cpu only')
        settleReady?.(s)
        settleReady = null
      } else if (m.type === 'text') {
        settle(m.id)?.resolve({ text: m.text })
      } else if (m.id !== undefined) {
        settle(m.id)?.reject(new SttCrashed(m.code))
      } else {
        // init_failed is sticky (missing/corrupt model won't fix itself): keep ready='failed'.
        o.log.error('stt init failed')
        child = null
        settleReady?.('failed')
        settleReady = null
        rejectAll('init_failed')
        c.kill()
      }
    })
    c.on('exit', (code) => {
      if (c !== child) return
      o.log.error('stt worker exit', code)
      drop('exit', false)
    })
    c.postMessage({ type: 'init', model: o.model })
    return ready
  }

  function settle(id: number): Pending | undefined {
    const p = pending.get(id)
    if (!p) return undefined
    clearTimeout(p.timer)
    pending.delete(id)
    return p
  }

  function transcribe(pcm: Float32Array, opt?: { prompt?: string }): Promise<SttResult> {
    return enqueue(async () => {
      const s = await start()
      const c = child
      if (s === 'failed' || !c) throw new SttCrashed('init_failed')
      const id = ++nextId
      return new Promise<SttResult>((resolve, reject) => {
        const timer = setTimeout(() => {
          o.log.error('stt timeout', timeoutMs)
          drop('timeout', true)
        }, timeoutMs)
        pending.set(id, { resolve, reject, timer })
        c.postMessage({ type: 'transcribe', id, pcm, prompt: opt?.prompt })
      })
    })
  }

  return {
    transcribe,
    warm() {
      // Discarded 1 s of silence so the ~10 s first Metal load happens before the first answer.
      warming = transcribe(new Float32Array(16000)).then(
        () => undefined,
        (e: unknown) => o.log.warn('stt warm failed', e instanceof Error ? e.message : 'unknown')
      )
      return warming
    },
    async status() {
      await warming
      return start()
    },
    dispose() {
      drop('disposed', true)
    }
  }
}
