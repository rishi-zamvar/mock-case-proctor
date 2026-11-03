// Phase 6 runner flow: 90 s interject, uninterrupted presentation, warm-up closing line, retry path.
import { describe, expect, it } from 'vitest'
import { INTERRUPT_LINES, SORRY_LINE, WARMUP_CLOSING_LINE } from '../agent/turnText'
import { createFakeLlm } from '../adapters/fakeLlm'
import { SECTION_IDS } from '../domain/machine/sections'
import { speakable } from '../domain/text/speakable'
import type { LlmChunk, MakeLlm, TurnRequest } from '../ports'
import { lines, setup } from './runner.harness'

const INTERJECTS = INTERRUPT_LINES.map(speakable)
const CLOSING = speakable(WARMUP_CLOSING_LINE)
const SORRY = speakable(SORRY_LINE)

// eslint-disable-next-line require-yield -- a stream that fails before its first chunk
async function* boom(): AsyncGenerator<LlmChunk> {
  throw new Error('overloaded')
}

/** Fake LLM recording TurnRequests; optional grill stream override. */
function recording(
  stream?: (req: TurnRequest, signal: AbortSignal, n: number) => AsyncIterable<LlmChunk>
): { makeLlm: MakeLlm; reqs: TurnRequest[] } {
  const reqs: TurnRequest[] = []
  const makeLlm: MakeLlm = (brief) => {
    const base = createFakeLlm({ chunkDelayMs: 0 })(brief)
    return {
      ...base,
      streamTurn: (req, signal) => {
        reqs.push(req)
        return stream ? stream(req, signal, reqs.length) : base.streamTurn(req, signal)
      }
    }
  }
  return { makeLlm, reqs }
}

describe('SessionRunner 90 s interject (grilling)', () => {
  it('given a 120 s grilling answer, when the partner replies, then an interject line is spoken first and lastAnswerLong is true', async () => {
    const { makeLlm, reqs } = recording()
    const t = setup({ makeLlm })
    await t.toGrilling()
    await t.idle()
    const from = t.speaks.length
    await t.answer(120_000)
    await t.idle()
    const after = t.speaks.slice(from)
    expect(INTERJECTS).toContain(after[0].text)
    expect(after.filter((s) => INTERJECTS.includes(s.text))).toHaveLength(1)
    expect(after.length).toBeGreaterThan(1)
    expect(reqs.at(-1)?.proctor?.lastAnswerLong).toBe(true)
    const tr = t.view().transcript
    expect(tr.at(-2)?.speaker).toBe('interviewer')
    expect(INTERRUPT_LINES.map((l) => l)).toContain(tr.at(-2)?.text)
    const f = t.file(t.view().sessionId)
    expect(f.timings.some((x) => x.kind === 'interject')).toBe(true)
  })

  it('given a 60 s grilling answer, when the partner replies, then no interject and lastAnswerLong is false', async () => {
    const { makeLlm, reqs } = recording()
    const t = setup({ makeLlm })
    await t.toGrilling()
    await t.idle()
    const from = t.speaks.length
    await t.answer(60_000)
    await t.idle()
    expect(t.speaks.slice(from).some((s) => INTERJECTS.includes(s.text))).toBe(false)
    expect(reqs.at(-1)?.proctor?.lastAnswerLong).toBe(false)
  })

  it('given two long answers in a row, when interjecting, then the two lines differ', async () => {
    const t = setup({ makeLlm: recording().makeLlm })
    await t.toGrilling()
    await t.idle()
    await t.answer(120_000)
    await t.idle()
    await t.answer(120_000)
    await t.idle()
    const said = t.speaks.filter((s) => INTERJECTS.includes(s.text)).map((s) => s.text)
    expect(said).toEqual([INTERJECTS[0], INTERJECTS[1]])
  })
})

describe('SessionRunner presentation (FLOW-04)', () => {
  it('given a 300 s presentation, when it ends, then no interject and the phase goes to extraction', async () => {
    const t = setup({ makeLlm: recording().makeLlm })
    await t.runner.start('99', { warmup: false })
    await t.runner.intent({ type: 'ready' })
    await t.runner.intent({ type: 'answer', ms: 300_000 })
    await t.until(() => t.view().phase === 'grilling')
    await t.idle()
    expect(t.views.some((v) => v.phase === 'extraction')).toBe(true)
    expect(t.speaks.some((s) => INTERJECTS.includes(s.text))).toBe(false)
  })
})

describe('SessionRunner warm-up closing line (FLOW-02)', () => {
  it('given a closing line, when warm-up is skipped, then it is spoken but not in the transcript', async () => {
    const t = setup({ warmupClosingLine: WARMUP_CLOSING_LINE })
    await t.runner.start('99', { warmup: true })
    await t.idle()
    await t.runner.intent({ type: 'skipWarmup' })
    await t.until(() => t.view().phase === 'review')
    expect(t.speaks.at(-1)?.text).toBe(CLOSING)
    expect(t.view().transcript.some((x) => x.text === WARMUP_CLOSING_LINE)).toBe(false)
  })

  it('given a closing line, when the 10-minute warm-up timer fires, then it is spoken', async () => {
    const t = setup({ warmupClosingLine: WARMUP_CLOSING_LINE })
    await t.runner.start('99', { warmup: true })
    await t.idle()
    t.clock.advance(10 * 60_000)
    await t.until(() => t.view().phase === 'review')
    expect(t.speaks.at(-1)?.text).toBe(CLOSING)
  })

  it('given a closing line, when the session ends from warm-up, then it is not spoken', async () => {
    const t = setup({ warmupClosingLine: WARMUP_CLOSING_LINE })
    await t.runner.start('99', { warmup: true })
    await t.idle()
    await t.runner.intent({ type: 'end' })
    await t.until(() => t.view().phase !== 'warmup')
    expect(t.speaks.some((s) => s.text === CLOSING)).toBe(false)
  })

  it('given no closing line, when warm-up is skipped, then no extra speak event', async () => {
    const t = setup()
    await t.runner.start('99', { warmup: true })
    await t.idle()
    const n = t.speaks.length
    await t.runner.intent({ type: 'skipWarmup' })
    await t.until(() => t.view().phase === 'review')
    expect(t.speaks.length).toBe(n)
  })
})

describe('SessionRunner failure path (G9)', () => {
  const sorries = (t: ReturnType<typeof setup>): number =>
    t.speaks.filter((x) => x.text === SORRY).length

  it('given a grill turn that fails once, when retried, then sorry is said once and the retried turn is spoken', async () => {
    let fails = 0
    const { makeLlm } = recording((req, signal, n) =>
      n === 2 && fails++ === 0 ? boom() : lines('Walk me through the margin bridge.', signal)
    )
    const t = setup({ makeLlm })
    await t.toGrilling()
    await t.idle()
    const from = t.speaks.length
    await t.runner.intent({ type: 'answer', ms: 30_000 })
    await t.until(() => t.view().transcript.at(-1)?.speaker === 'interviewer')
    await t.idle()
    const after = t.speaks.slice(from).map((x) => x.text)
    expect(after[0]).toBe(SORRY)
    expect(sorries(t)).toBe(1)
    expect(after).toContain('Walk me through the margin bridge.')
    expect(t.log.error).not.toHaveBeenCalled()
    expect(t.view().transcript.filter((x) => x.speaker === 'interviewer')).toHaveLength(2)
  })

  it('given a grill turn that fails twice, when giving up, then sorry once, one error log, not speaking, and end still works', async () => {
    const { makeLlm } = recording((req, signal, n) => (n >= 2 ? boom() : lines('Hi.', signal)))
    const t = setup({ makeLlm })
    await t.toGrilling()
    await t.idle()
    await t.runner.intent({ type: 'answer', ms: 30_000 })
    await t.until(() => t.log.error.mock.calls.length > 0)
    await t.until(() => t.view().speaking === false)
    expect(sorries(t)).toBe(1)
    expect(t.log.error).toHaveBeenCalledTimes(1)
    expect(t.log.error).toHaveBeenCalledWith('llm turn failed', 'grill')
    await t.runner.intent({ type: 'end' })
    await t.until(() => t.view().phase === 'reviewMode')
  })

  it('given extraction failing twice, when giving up, then the default order is used and grilling starts', async () => {
    const t = setup({
      makeLlm: (brief) => ({
        ...createFakeLlm({ chunkDelayMs: 0 })(brief),
        extractPlan: async () => {
          throw new Error('overloaded')
        }
      })
    })
    const { sessionId } = await t.runner.start('99', { warmup: false })
    await t.runner.intent({ type: 'ready' })
    await t.runner.intent({ type: 'answer', ms: 45_000 })
    await t.until(() => t.view().phase === 'grilling')
    expect(sorries(t)).toBe(1)
    const m = t.file(sessionId).machineState
    expect([...m.plan].sort()).toEqual([...SECTION_IDS].sort())
    expect(m.omitted).toEqual(SECTION_IDS.filter((x) => x !== 'call'))
  })

  it('given an abort during the retry, when ending, then the retry speaks nothing and nothing is logged as an error', async () => {
    const { makeLlm } = recording((req, signal, n) =>
      n === 2
        ? boom()
        : n === 3
          ? lines('This should never be heard out loud.', signal, 50)
          : lines('Hi.', signal)
    )
    const t = setup({ makeLlm })
    await t.toGrilling()
    await t.idle()
    await t.runner.intent({ type: 'answer', ms: 30_000 })
    await t.until(() => sorries(t) === 1)
    await t.runner.intent({ type: 'end' })
    await t.until(() => t.view().phase === 'reviewMode')
    await new Promise((r) => setTimeout(r, 400))
    expect(t.speaks.some((x) => x.text.includes('never be heard'))).toBe(false)
    expect(t.log.error).not.toHaveBeenCalled()
  })

  it('given a warm-up turn that fails once, when retried, then sorry once and the warm-up line is spoken', async () => {
    let fails = 0
    const t = setup({
      makeLlm: (brief) => {
        const base = createFakeLlm({ chunkDelayMs: 0 })(brief)
        return {
          ...base,
          warmupTurn: (req, signal) => (fails++ === 0 ? boom() : base.warmupTurn(req, signal))
        }
      }
    })
    await t.runner.start('99', { warmup: true })
    await t.until(() => t.view().transcript.length === 1)
    await t.idle()
    expect(t.speaks[0].text).toBe(SORRY)
    expect(sorries(t)).toBe(1)
    expect(t.log.error).not.toHaveBeenCalled()
  })
})
