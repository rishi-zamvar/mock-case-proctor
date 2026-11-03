// Phase 6 runner flow: 90 s interject, uninterrupted presentation, warm-up closing line, retry path.
import { describe, expect, it } from 'vitest'
import { INTERRUPT_LINES, WARMUP_CLOSING_LINE } from '../agent/turnText'
import { createFakeLlm } from '../adapters/fakeLlm'
import { speakable } from '../domain/text/speakable'
import type { LlmChunk, MakeLlm, TurnRequest } from '../ports'
import { setup } from './runner.harness'

const INTERJECTS = INTERRUPT_LINES.map(speakable)
const CLOSING = speakable(WARMUP_CLOSING_LINE)

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
