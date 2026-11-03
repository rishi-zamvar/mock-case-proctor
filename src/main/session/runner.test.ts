import { describe, expect, it } from 'vitest'
import { ViewStateSchema } from '../../shared/schemas'
import { createFakeLlm } from '../adapters/fakeLlm'
import type { MakeLlm } from '../ports'
import { SessionFileSchema } from '../store/sessionSchema'
import { lines, REVIEW_MS, setup, withGrill } from './runner.harness'

describe('SessionRunner start and warm-up', () => {
  it('given start with warm-up, when the greeting is spoken and acked, then session is active and transcript has 1 line', async () => {
    const t = setup()
    const { sessionId } = await t.runner.start('99', { warmup: true })
    expect(sessionId).toMatch(/^[A-Za-z0-9_-]{1,80}$/)
    const f0 = t.file(sessionId)
    expect(f0.status).toBe('active')
    expect(f0.warmup).toBe(true)
    await t.idle()
    expect(t.view().phase).toBe('warmup')
    expect(t.speaks.length).toBeGreaterThan(0)
    expect(t.speaks.map((s) => s.seq)).toEqual(t.speaks.map((_, i) => i))
    expect(t.view().transcript).toHaveLength(1)
    expect(t.view().transcript[0].speaker).toBe('interviewer')
    const sp = t.views.map((v) => v.speaking)
    expect(sp.indexOf(true)).toBeGreaterThanOrEqual(0)
    expect(sp.lastIndexOf(false)).toBeGreaterThan(sp.indexOf(true))
  })

  it('given warm-up, when answered twice, then replies come and the closing line moves to review', async () => {
    const t = setup()
    await t.runner.start('99', { warmup: true })
    await t.idle()
    await t.answer()
    expect(t.view().phase).toBe('warmup')
    await t.answer()
    await t.until(() => t.view().phase === 'review')
    const tr = t.view().transcript
    expect(tr.map((x) => x.speaker)).toEqual([
      'interviewer',
      'candidate',
      'interviewer',
      'candidate',
      'interviewer'
    ])
  })

  it('given warm-up, when skipped, then review with a 45 minute deadline', async () => {
    const t = setup()
    await t.runner.start('99', { warmup: true })
    await t.idle()
    await t.runner.intent({ type: 'skipWarmup' })
    expect(t.view().phase).toBe('review')
    expect(t.view().reviewDeadline).toBe(t.clock.now() + REVIEW_MS)
  })
})

describe('SessionRunner review', () => {
  it('given review, when the clock passes the deadline, then presentation', async () => {
    const t = setup()
    await t.runner.start('99', { warmup: false })
    expect(t.view().phase).toBe('review')
    t.clock.advance(REVIEW_MS + 1)
    await t.until(() => t.view().phase === 'presentation')
  })

  it('given review, when ready, then presentation and the review timer is cancelled', async () => {
    const t = setup()
    await t.runner.start('99', { warmup: false })
    await t.runner.intent({ type: 'ready' })
    expect(t.view().phase).toBe('presentation')
    expect(t.clock.pending()).toBe(0)
    const n = t.views.length
    t.clock.advance(REVIEW_MS + 1)
    await new Promise((r) => setTimeout(r, 10))
    expect(t.views.length).toBe(n)
  })
})

describe('SessionRunner presentation and grilling', () => {
  it('given presentation, when answered, then the turn is saved and grilling starts on plan[0] with a spoken line', async () => {
    const t = setup()
    const id = await t.toGrilling()
    const f = t.file(id)
    const cand = f.transcript.find((x) => x.speaker === 'candidate')!
    expect(cand.phase).toBe('presentation')
    expect(cand.ms).toBe(45_000)
    expect(f.machineState.current).toBe(f.machineState.plan[0])
    expect(t.view().section?.id).toBe(f.machineState.plan[0])
    await t.idle()
    const last = t.view().transcript.at(-1)!
    expect(last.speaker).toBe('interviewer')
  })

  it('given grilling, when answered, then each section advances after 2 interviewer turns with one control per grill turn', async () => {
    const t = setup()
    const id = await t.toGrilling()
    await t.idle()
    const first = t.file(id).machineState.current
    await t.answer()
    await t.answer()
    const f = t.file(id)
    expect(f.machineState.done).toEqual([first])
    expect(f.machineState.current).toBe(f.machineState.plan[1])
    expect(f.controlLog).toHaveLength(3)
  })

  it('given a full run, when driven to the end, then completed with scorecard, ordered transcript and timings', async () => {
    const t = setup()
    const { sessionId: id } = await t.runner.start('99', { warmup: true })
    await t.idle()
    await t.answer()
    await t.answer()
    await t.until(() => t.view().phase === 'review')
    await t.runner.intent({ type: 'ready' })
    await t.answer(45_000)
    await t.until(() => t.view().phase === 'grilling' && t.view().canTalk)
    let guard = 0
    while (t.view().phase === 'grilling' && guard++ < 50) {
      const n = t.file(id).transcript.length
      await t.answer()
      // file already holds the candidate answer and the interviewer reply right after the await
      expect(t.file(id).transcript.length).toBeGreaterThanOrEqual(n + 2)
    }
    await t.until(() => t.view().phase === 'reviewMode')
    expect(t.view().reveal).not.toBeNull()
    const f = t.file(id)
    expect(() => SessionFileSchema.parse(f)).not.toThrow()
    expect(f.status).toBe('completed')
    expect(f.endedAt).toBeDefined()
    expect(f.scorecard?.total).toBe(18)
    const phases = f.transcript.map((x) => x.phase)
    const order = ['warmup', 'presentation', 'grilling', 'wrapup']
    expect(phases.map((p) => order.indexOf(p))).toEqual(
      [...phases.map((p) => order.indexOf(p))].sort((a, b) => a - b)
    )
    expect(f.transcript.at(-1)!.phase).toBe('wrapup')
    expect(f.transcript.at(-1)!.speaker).toBe('interviewer')
    expect(f.transcript.at(-2)!.speaker).toBe('interviewer')
    const interviewer = f.transcript.filter((x) => x.speaker === 'interviewer')
    expect(f.timings).toHaveLength(interviewer.length)
    for (const tm of f.timings) {
      expect(tm.startedAt).toBeLessThanOrEqual(tm.firstTextAt!)
      expect(tm.firstTextAt!).toBeLessThanOrEqual(tm.doneAt)
    }
    const grills = interviewer.filter((x) => x.phase === 'grilling')
    expect(f.controlLog).toHaveLength(grills.length)
    expect(f.pending).toBeNull()
    for (const v of t.views) expect(() => ViewStateSchema.parse(v)).not.toThrow()
    expect(t.save.mock.calls.length).toBeGreaterThan(f.transcript.length)
  })
})

describe('SessionRunner ignored answers', () => {
  it('given review, when answered, then ignored and STT not called', async () => {
    const t = setup()
    await t.runner.start('99', { warmup: false })
    await t.runner.intent({ type: 'answer', ms: 1000 })
    expect(t.transcribe).not.toHaveBeenCalled()
    expect(t.view().transcript).toHaveLength(0)
  })

  it('given the interviewer is speaking, when answered, then ignored', async () => {
    const t = setup({ autoAck: false })
    await t.runner.start('99', { warmup: true })
    await t.until(() => t.speaks.length > 0)
    await t.runner.intent({ type: 'answer', ms: 1000 })
    expect(t.transcribe).not.toHaveBeenCalled()
    expect(t.file(t.view().sessionId).transcript).toHaveLength(0)
  })

  it('given blank STT text, when answered, then no turn is appended', async () => {
    const t = setup()
    await t.runner.start('99', { warmup: false })
    await t.runner.intent({ type: 'ready' })
    t.stt.inject('   ')
    await t.runner.intent({ type: 'answer', ms: 1000 })
    expect(t.transcribe).toHaveBeenCalledTimes(1)
    expect(t.view().transcript).toHaveLength(0)
    expect(t.view().phase).toBe('presentation')
  })
})

describe('SessionRunner speech acks', () => {
  it('given auto-ack off, when a grill turn streams, then it completes only after every seq is acked (out of order ok)', async () => {
    const t = setup({ autoAck: false })
    const { sessionId: id } = await t.runner.start('99', { warmup: false })
    await t.runner.intent({ type: 'ready' })
    await t.runner.intent({ type: 'answer', ms: 1000 })
    await t.until(() => t.speaks.length === 2)
    await new Promise((r) => setTimeout(r, 10))
    expect(t.file(id).transcript.filter((x) => x.speaker === 'interviewer')).toHaveLength(0)
    expect(t.file(id).controlLog).toHaveLength(0)
    const [a, b] = t.speaks
    t.runner.ack(b.turnId, b.seq)
    await new Promise((r) => setTimeout(r, 10))
    expect(t.file(id).transcript.filter((x) => x.speaker === 'interviewer')).toHaveLength(0)
    t.runner.ack('nope', 9)
    t.runner.ack(a.turnId, a.seq)
    await t.until(() => t.file(id).transcript.some((x) => x.speaker === 'interviewer'))
    await t.until(() => t.file(id).controlLog.length === 1)
  })

  it('given no acks and a 20 ms ack timeout, when a turn streams, then it completes after the timeout', async () => {
    const t = setup({ autoAck: false, ackTimeoutMs: 20 })
    const { sessionId: id } = await t.runner.start('99', { warmup: false })
    await t.runner.intent({ type: 'ready' })
    await t.runner.intent({ type: 'answer', ms: 1000 })
    await t.until(() => t.file(id).transcript.some((x) => x.speaker === 'interviewer'))
  })
})

describe('SessionRunner text pipeline', () => {
  it('given a banned sentence, when streamed, then it is not emitted or stored and the log has the reason only', async () => {
    const bad = 'Per the rubric you missed it.'
    const t = setup({ makeLlm: withGrill(`${bad} Next question?`) })
    const id = await t.toGrilling()
    await t.idle()
    const texts = t.speaks.map((s) => s.text)
    expect(texts.some((x) => x.includes('rubric'))).toBe(false)
    expect(texts).toContain('Next question?')
    const line = t.file(id).transcript.at(-1)!
    expect(line.text).toBe('Next question?')
    expect(t.log.warn).toHaveBeenCalledWith('utterance blocked', 'banned_term')
    expect(JSON.stringify(t.log.warn.mock.calls)).not.toContain('missed it')
  })

  it('given a line with $, when spoken, then emitted text is speakable and the transcript keeps the written form', async () => {
    const t = setup({ makeLlm: withGrill('ARR is $9.9M.') })
    const id = await t.toGrilling()
    await t.idle()
    expect(t.speaks.at(-1)!.text).not.toContain('$')
    expect(t.file(id).transcript.at(-1)!.text).toBe('ARR is $9.9M.')
  })
})

describe('SessionRunner end early', () => {
  it('given a grill turn mid-stream, when ended, then aborted, no partial line, scored and completed', async () => {
    let signal: AbortSignal | null = null
    const makeLlm: MakeLlm = (brief) => {
      const base = createFakeLlm({ chunkDelayMs: 0 })(brief)
      return {
        ...base,
        streamTurn: (_req, s) => {
          signal = s
          return lines('Tell me about it. And then tell me more about everything else here.', s, 5)
        }
      }
    }
    const t = setup({ makeLlm })
    const { sessionId: id } = await t.runner.start('99', { warmup: false })
    await t.runner.intent({ type: 'ready' })
    await t.runner.intent({ type: 'answer', ms: 1000 })
    await t.until(() => t.speaks.length >= 1 && t.view().speaking)
    await t.runner.intent({ type: 'end' })
    await t.until(() => t.view().phase === 'reviewMode')
    expect(signal!.aborted).toBe(true)
    const f = t.file(id)
    expect(f.transcript.filter((x) => x.speaker === 'interviewer')).toHaveLength(0)
    expect(f.machineState.endedEarly).toBe(true)
    expect(f.status).toBe('completed')
    expect(f.scorecard).toBeDefined()
    expect(t.view().reveal).not.toBeNull()
  })

  it('given review, when ended, then scoring then reviewMode', async () => {
    const t = setup()
    const { sessionId: id } = await t.runner.start('99', { warmup: false })
    await t.runner.intent({ type: 'end' })
    await t.until(() => t.view().phase === 'reviewMode')
    expect(t.file(id).scorecard).toBeDefined()
    expect(t.clock.pending()).toBe(0)
  })

  it('given an active session, when start is called again, then the old one is abandoned', async () => {
    const t = setup()
    const { sessionId: a } = await t.runner.start('99', { warmup: false })
    const { sessionId: b } = await t.runner.start('99', { warmup: false })
    expect(b).not.toBe(a)
    expect(t.file(a).status).toBe('abandoned')
    expect(t.file(a).endedAt).toBeDefined()
    expect(t.file(b).status).toBe('active')
  })
})
