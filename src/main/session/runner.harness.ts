// Shared test harness for the SessionRunner suites (test-only).
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, vi } from 'vitest'
import type { SpeakEvent, ViewState } from '../../shared/ipc'
import { createFakeLlm, type FakeLlmOptions } from '../adapters/fakeLlm'
import { createFakeStt } from '../adapters/fakeStt'
import { loadCase } from '../domain/cases/library'
import type { AwakePort, ClockPort, LlmChunk, MakeLlm } from '../ports'
import { createSessionStore } from '../store/sessionStore'
import type { SessionFile } from '../store/sessionSchema'
import { createSessionRunner } from './runner'

export const FIXTURE_ROOT = join(__dirname, '../../../tests/fixtures/cases')
export const deck = readFileSync(join(FIXTURE_ROOT, 'case_99_fixture/deck.txt'), 'utf8')
export const REVIEW_MS = 45 * 60_000
export const WARN_MS = 10 * 60_000
export const fakeAwake = (): AwakePort & { hold: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> } => ({
  hold: vi.fn(),
  release: vi.fn()
})

export function manualClock(t = 1_000_000): ClockPort & {
  advance(ms: number): void
  pending(): number
} {
  let now = t
  const timers = new Set<{ at: number; cb: () => void }>()
  return {
    now: () => now,
    scale: 1,
    setTimer(at, cb) {
      const x = { at, cb }
      timers.add(x)
      return () => void timers.delete(x)
    },
    advance(ms) {
      now += ms
      for (const x of [...timers])
        if (x.at <= now) {
          timers.delete(x)
          x.cb()
        }
    },
    pending: () => timers.size
  }
}

export async function* lines(
  text: string,
  signal: AbortSignal,
  delayMs = 0
): AsyncGenerator<LlmChunk> {
  for (const w of text.split(' ')) {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
    if (signal.aborted) return
    yield { type: 'text', delta: w + ' ' }
  }
  yield { type: 'done' }
}

/** Fake LLM with the grill stream replaced. */
export const withGrill =
  (line: string, o: FakeLlmOptions = {}): MakeLlm =>
  (brief) => ({
    ...createFakeLlm({ chunkDelayMs: 0, ...o })(brief),
    streamTurn: (_req, signal) => lines(line, signal)
  })

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- inferred harness shape
export function setup(
  o: {
    root?: string
    autoAck?: boolean
    makeLlm?: MakeLlm
    ackTimeoutMs?: number
    clock?: ReturnType<typeof manualClock>
    awake?: AwakePort
  } = {}
) {
  const root = o.root ?? mkdtempSync(join(tmpdir(), 'runner-'))
  const clock = o.clock ?? manualClock()
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const store = createSessionStore({ root, now: clock.now, log })
  const save = vi.spyOn(store, 'save')
  const stt = createFakeStt()
  const transcribe = vi.spyOn(stt, 'transcribe')
  const views: ViewState[] = []
  const speaks: SpeakEvent[] = []
  const h = { autoAck: o.autoAck ?? true }
  let n = 0
  const runner = createSessionRunner({
    store,
    clock,
    stt,
    makeLlm: o.makeLlm ?? createFakeLlm({ chunkDelayMs: 0 }),
    loadCase: (id) => loadCase(FIXTURE_ROOT, id, deck),
    emitView: (v) => void views.push(v),
    emitSpeak: (s) => {
      speaks.push(s)
      if (h.autoAck) queueMicrotask(() => runner.ack(s.turnId, s.seq))
    },
    newId: (p) => `${p}-${++n}`,
    ackTimeoutMs: o.ackTimeoutMs,
    awake: o.awake,
    log
  })
  const file = (id: string): SessionFile =>
    JSON.parse(readFileSync(join(root, id, 'session.json'), 'utf8'))
  const view = (): ViewState => runner.current() as ViewState
  const until = (f: () => boolean): Promise<void> =>
    vi.waitFor(() => expect(f()).toBe(true), { timeout: 3000, interval: 2 })
  const idle = (): Promise<void> => until(() => view()?.canTalk === true)
  /** Answer, then wait until the interviewer has replied and the candidate can talk again (or phase moved on). */
  async function answer(ms = 30_000): Promise<void> {
    const before = view().transcript.length
    await runner.intent({ type: 'answer', ms })
    await until(
      () =>
        view().transcript.length >= before + 2 &&
        !view().speaking &&
        (view().canTalk || !['warmup', 'presentation', 'grilling'].includes(view().phase))
    )
  }
  async function toGrilling(warmup = false): Promise<string> {
    const { sessionId } = await runner.start('99', { warmup })
    if (warmup) {
      await idle()
      await runner.intent({ type: 'skipWarmup' })
    }
    await runner.intent({ type: 'ready' })
    await answer(45_000)
    await until(() => view().phase === 'grilling')
    return sessionId
  }
  return {
    root,
    clock,
    log,
    store,
    save,
    stt,
    transcribe,
    views,
    speaks,
    h,
    runner,
    file,
    view,
    until,
    idle,
    answer,
    toGrilling
  }
}
