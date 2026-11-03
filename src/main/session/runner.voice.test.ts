// Phase 5 voice plumbing: spoken T-10 line, speak:cancel on aborted speech, spoken flag on acks.
import { describe, expect, it } from 'vitest'
import { speakable } from '../domain/text/speakable'
import { REVIEW_MS, setup, WARN_MS } from './runner.harness'

const LINE = 'Ten minutes left.'
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 10))

describe('SessionRunner spoken review warning', () => {
  it('given reviewWarningLine, when T-10 fires in review, then one speak event with a fresh turn and no transcript change', async () => {
    const t = setup({ reviewWarningLine: LINE })
    const { sessionId } = await t.runner.start('99', { warmup: false })
    const ids = new Set(t.speaks.map((s) => s.turnId))
    t.clock.advance(REVIEW_MS - WARN_MS)
    await t.until(() => t.view().reviewWarned === true)
    await settle()
    expect(t.speaks).toHaveLength(1)
    expect(t.speaks[0]).toMatchObject({ seq: 0, text: speakable(LINE) })
    expect(ids.has(t.speaks[0].turnId)).toBe(false)
    expect(t.file(sessionId).transcript).toHaveLength(0)
    expect(t.view().phase).toBe('review')
  })

  it('given no reviewWarningLine, when T-10 fires, then nothing is spoken', async () => {
    const t = setup()
    await t.runner.start('99', { warmup: false })
    t.clock.advance(REVIEW_MS - WARN_MS)
    await t.until(() => t.view().reviewWarned === true)
    await settle()
    expect(t.speaks).toHaveLength(0)
  })
})

describe('SessionRunner speak:cancel', () => {
  it('given a warm-up turn mid-speech, when skipWarmup, then emitCancel once with that turn id', async () => {
    const t = setup({ autoAck: false })
    await t.runner.start('99', { warmup: true })
    await t.until(() => t.speaks.length > 0)
    await t.runner.intent({ type: 'skipWarmup' })
    expect(t.cancels).toEqual([t.speaks[0].turnId])
  })

  it('given a grill turn mid-speech, when end, then emitCancel once with that turn id', async () => {
    const t = setup()
    await t.toGrilling()
    t.h.autoAck = false
    const before = t.speaks.length
    await t.runner.intent({ type: 'answer', ms: 20_000 })
    await t.until(() => t.speaks.length > before)
    await t.runner.intent({ type: 'end' })
    expect(t.cancels).toEqual([t.speaks[before].turnId])
  })

  it('given no turn speaking, when end, then emitCancel is not called', async () => {
    const t = setup()
    await t.runner.start('99', { warmup: false })
    await t.runner.intent({ type: 'end' })
    expect(t.cancels).toEqual([])
  })
})

describe('SessionRunner ack spoken flag', () => {
  it('given a turn waiting on acks, when every seq is acked spoken=false, then the turn completes as with spoken=true', async () => {
    const t = setup({ autoAck: false })
    const { sessionId: id } = await t.runner.start('99', { warmup: false })
    await t.runner.intent({ type: 'ready' })
    await t.runner.intent({ type: 'answer', ms: 1000 })
    await t.until(() => t.speaks.length === 2)
    for (const s of t.speaks) t.runner.ack(s.turnId, s.seq, false)
    await t.until(() => t.file(id).transcript.some((x) => x.speaker === 'interviewer'))
    expect(t.cancels).toEqual([])
  })
})
