import { describe, expect, it } from 'vitest'
import { createFakeLlm } from '../adapters/fakeLlm'
import { loadCase } from '../domain/cases/library'
import type { MakeLlm } from '../ports'
import { deck, FIXTURE_ROOT, manualClock, REVIEW_MS, setup, WARN_MS } from './runner.harness'

const card = loadCase(FIXTURE_ROOT, '99', deck).card
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Fake LLM that counts every port call. */
function counting(): { makeLlm: MakeLlm; calls: string[] } {
  const calls: string[] = []
  const makeLlm: MakeLlm = (brief) => {
    const f = createFakeLlm({ chunkDelayMs: 0 })(brief)
    return {
      warmupTurn: (r, s) => (calls.push('warmup'), f.warmupTurn(r, s)),
      streamTurn: (r, s) => (calls.push(r.kind), f.streamTurn(r, s)),
      extractPlan: (o, s) => (calls.push('extraction'), f.extractPlan(o, s)),
      scoreSession: (i, s) => (calls.push('score'), f.scoreSession(i, s))
    }
  }
  return { makeLlm, calls }
}

async function finish(t: ReturnType<typeof setup>): Promise<void> {
  let guard = 0
  while (t.view().phase === 'grilling' && guard++ < 50) await t.answer()
  await t.until(() => t.view().phase === 'reviewMode')
  expect(t.file(t.view().sessionId).status).toBe('completed')
}

describe('SessionRunner resume', () => {
  it('given a crash mid-grilling after a completed turn, when resumed, then state is rehydrated with no LLM call and the flow continues', async () => {
    const a = setup()
    const id = await a.toGrilling()
    await a.idle()
    await a.answer()
    const before = a.file(id)
    const label = a.view().section?.label
    const { makeLlm, calls } = counting()
    const b = setup({ root: a.root, makeLlm })
    expect(await b.runner.resume(id)).toEqual({ sessionId: id })
    expect(b.view().phase).toBe('grilling')
    expect(b.view().transcript).toHaveLength(before.transcript.length)
    expect(b.view().section?.label).toBe(label)
    await sleep(10)
    expect(calls).toEqual([])
    expect(b.speaks).toHaveLength(0)
    await finish(b)
  })

  it('given a crash while a grill turn is in flight, when resumed, then that grill turn is re-requested', async () => {
    const a = setup({ autoAck: false })
    const { sessionId: id } = await a.runner.start('99', { warmup: false })
    await a.runner.intent({ type: 'ready' })
    await a.runner.intent({ type: 'answer', ms: 1000 })
    await a.until(() => a.speaks.length === 2)
    const f = a.file(id)
    expect(f.pending?.kind).toBe('grill')
    expect(f.transcript).toHaveLength(1)
    const b = setup({ root: a.root })
    await b.runner.resume(id)
    await b.until(() => b.speaks.length > 0)
    await b.idle()
    expect(b.view().transcript).toHaveLength(2)
    expect(b.file(id).pending).toBeNull()
    await finish(b)
  })

  it('given a saved grilling answer with no pending, when resumed, then the grill turn is derived and requested', async () => {
    const a = setup()
    const id = await a.toGrilling()
    await a.idle()
    const f = a.file(id)
    f.transcript.push({
      id: 'turn-x',
      speaker: 'candidate',
      phase: 'grilling',
      section: f.machineState.current!,
      text: 'Retention is fine.',
      at: f.startedAt + 1,
      ms: 1000
    })
    f.pending = null
    a.store.save(f)
    const b = setup({ root: a.root })
    await b.runner.resume(id)
    await b.until(() => b.speaks.length > 0)
    await b.idle()
    expect(b.view().transcript).toHaveLength(f.transcript.length + 1)
    expect(b.view().transcript.at(-1)!.speaker).toBe('interviewer')
  })

  it('given review with a future deadline, when resumed, then the timer is re-armed', async () => {
    const a = setup()
    const { sessionId: id } = await a.runner.start('99', { warmup: false })
    const b = setup({ root: a.root })
    await b.runner.resume(id)
    expect(b.view().phase).toBe('review')
    b.clock.advance(REVIEW_MS + 1)
    await b.until(() => b.view().phase === 'presentation')
  })

  it('given review with a passed deadline, when resumed, then presentation right away', async () => {
    const a = setup()
    const { sessionId: id } = await a.runner.start('99', { warmup: false })
    const b = setup({ root: a.root, clock: manualClock(a.clock.now() + REVIEW_MS + 5) })
    await b.runner.resume(id)
    expect(b.view().phase).toBe('presentation')
    expect(b.file(id).machineState.phase).toBe('presentation')
  })

  it('given warm-up with pending warmup, when resumed, then the warm-up line is re-spoken', async () => {
    const a = setup({ autoAck: false })
    const { sessionId: id } = await a.runner.start('99', { warmup: true })
    await a.until(() => a.speaks.length > 0)
    expect(a.file(id).pending?.kind).toBe('warmup')
    const b = setup({ root: a.root })
    await b.runner.resume(id)
    await b.idle()
    expect(b.speaks.length).toBeGreaterThan(0)
    expect(b.view().transcript).toHaveLength(1)
  })

  it('given scoring with pending score, when resumed, then the scorecard is produced and reviewMode reached', async () => {
    const hang: MakeLlm = (brief) => ({
      ...createFakeLlm()(brief),
      scoreSession: () => new Promise(() => undefined)
    })
    const a = setup({ makeLlm: hang })
    const { sessionId: id } = await a.runner.start('99', { warmup: false })
    await a.runner.intent({ type: 'end' })
    await a.until(() => a.file(id).pending?.kind === 'score')
    const b = setup({ root: a.root })
    await b.runner.resume(id)
    await b.until(() => b.view().phase === 'reviewMode')
    expect(b.file(id).scorecard?.total).toBe(18)
    expect(b.file(id).status).toBe('completed')
  })

  it('given completed, abandoned or unknown sessions, when resumed, then it rejects', async () => {
    const a = setup()
    const { sessionId: done } = await a.runner.start('99', { warmup: false })
    await a.runner.intent({ type: 'end' })
    await a.until(() => a.view().phase === 'reviewMode')
    const { sessionId: old } = await a.runner.start('99', { warmup: false })
    await a.runner.start('99', { warmup: false }) // abandons `old`
    const b = setup({ root: a.root })
    await expect(b.runner.resume(done)).rejects.toThrow('session not resumable')
    await expect(b.runner.resume(old)).rejects.toThrow('session not resumable')
    await expect(b.runner.resume('nope')).rejects.toThrow('session not resumable')
  })
})

describe('SessionRunner discard', () => {
  it('given an active session on disk, when discarded, then abandoned and not resumable', async () => {
    const a = setup()
    const { sessionId: id } = await a.runner.start('99', { warmup: false })
    const b = setup({ root: a.root })
    expect(b.store.libraryView([card]).resumable?.sessionId).toBe(id)
    b.runner.discard(id)
    const f = b.file(id)
    expect(f.status).toBe('abandoned')
    expect(f.endedAt).toBeDefined()
    expect(b.store.libraryView([card]).resumable).toBeNull()
  })

  it('given the current session mid-turn, when discarded, then in-flight work aborts and current() clears', async () => {
    let signal: AbortSignal | null = null
    const makeLlm: MakeLlm = (brief) => {
      const f = createFakeLlm()(brief)
      return { ...f, streamTurn: (r, s) => ((signal = s), f.streamTurn(r, s)) }
    }
    const a = setup({ autoAck: false, makeLlm })
    const { sessionId: id } = await a.runner.start('99', { warmup: false })
    await a.runner.intent({ type: 'ready' })
    await a.runner.intent({ type: 'answer', ms: 1000 })
    await a.until(() => a.speaks.length === 2)
    a.runner.discard(id)
    expect(signal!.aborted).toBe(true)
    expect(a.runner.current()).toBeNull()
    await sleep(10)
    const f = a.file(id)
    expect(f.status).toBe('abandoned')
    expect(f.transcript.filter((x) => x.speaker === 'interviewer')).toHaveLength(0)
  })
})

describe('SessionRunner resume review warning', () => {
  const warned = (t: ReturnType<typeof setup>): number =>
    t.log.info.mock.calls.filter((c) => c[0] === 'review warning').length

  it('given review before T-10 not warned, when resumed, then the warning is re-armed and fires at deadline - 10 min', async () => {
    const a = setup()
    const { sessionId: id } = await a.runner.start('99', { warmup: false })
    const b = setup({ root: a.root })
    await b.runner.resume(id)
    expect(b.clock.pending()).toBe(2)
    b.clock.advance(REVIEW_MS - WARN_MS - 1)
    await new Promise((r) => setTimeout(r, 10))
    expect(b.view().reviewWarned).toBe(false)
    b.clock.advance(1)
    await b.until(() => b.view().reviewWarned === true)
    expect(warned(b)).toBe(1)
  })

  it('given review inside the last 10 min not warned, when resumed, then warned immediately', async () => {
    const a = setup()
    const { sessionId: id } = await a.runner.start('99', { warmup: false })
    const b = setup({ root: a.root, clock: manualClock(a.clock.now() + REVIEW_MS - 5 * 60_000) })
    await b.runner.resume(id)
    expect(b.view().reviewWarned).toBe(true)
    expect(b.view().phase).toBe('review')
    expect(b.file(id).machineState.reviewWarned).toBe(true)
    expect(b.clock.pending()).toBe(1)
  })

  it('given review already warned, when resumed, then no warning timer and no second warning', async () => {
    const a = setup()
    const { sessionId: id } = await a.runner.start('99', { warmup: false })
    a.clock.advance(REVIEW_MS - WARN_MS)
    await a.until(() => a.file(id).machineState.reviewWarned === true)
    const b = setup({ root: a.root, clock: manualClock(a.clock.now() + 60_000) })
    await b.runner.resume(id)
    expect(b.clock.pending()).toBe(1)
    expect(warned(b)).toBe(0)
    expect(b.view().reviewWarned).toBe(true)
  })
})
