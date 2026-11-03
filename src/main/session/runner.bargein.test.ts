// VOUT-05: barge-in keeps only the spoken sentences (transcript, timings, LLM history) and the interview keeps moving.
import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import { describe, expect, it, vi } from 'vitest'
import { createFakeLlm } from '../adapters/fakeLlm'
import { createClaudeLlm } from '../agent/claudeLlm'
import { checkConversation } from '../agent/messages'
import { jsonMessage, sseEvents, sseFetch } from '../agent/sse.harness'
import type { MakeLlm } from '../ports'
import { lines, setup } from './runner.harness'

const S = ['Alpha one is here.', 'Bravo two is here.', 'Charlie three is here.']
const REPLY = S.join(' ')

/** Fake LLM whose grill + warm-up streams say `REPLY` (optionally slow), with an interrupted spy. */
function spy(o: { delayMs?: () => number; warm?: boolean } = {}): {
  makeLlm: MakeLlm
  interrupted: ReturnType<typeof vi.fn>
} {
  const interrupted = vi.fn()
  const makeLlm: MakeLlm = (brief) => {
    const base = createFakeLlm({ chunkDelayMs: 0 })(brief)
    return {
      ...base,
      streamTurn: (_req, signal) => lines(REPLY, signal, o.delayMs?.() ?? 0),
      ...(o.warm ? { warmupTurn: (_req, signal) => lines(REPLY, signal) } : {}),
      interrupted
    }
  }
  return { makeLlm, interrupted }
}

type T = ReturnType<typeof setup>

/** Grilling, then the next reply is manual-ack; returns its turn id once `n` sentences were sent. */
async function grillReply(t: T, n = 3): Promise<string> {
  const before = t.speaks.length
  t.h.autoAck = false
  await t.runner.intent({ type: 'answer', ms: 10_000 })
  await t.until(() => t.speaks.length >= before + n)
  return t.speaks[before].turnId
}

const interviewerLine = (t: T, id: string): { text: string } | undefined =>
  t.view().transcript.find((l) => l.speaker === 'interviewer' && l.id === id)

describe('SessionRunner barge-in', () => {
  it('given sentence 0 acked spoken, when bargeIn, then cancel, transcript keeps sentence 0, interrupted timing, can talk, and the next answer flows', async () => {
    const { makeLlm, interrupted } = spy()
    const t = setup({ makeLlm })
    const id = await t.toGrilling()
    await t.idle()
    const turn = await grillReply(t)
    t.runner.ack(turn, 0, true)
    await t.runner.intent({ type: 'bargeIn' })
    expect(t.cancels).toContain(turn)
    const last = t.view().transcript.at(-1)
    expect(last).toMatchObject({ speaker: 'interviewer', id: turn, text: S[0] })
    expect(t.file(id).timings.find((x) => x.turnId === turn)?.interrupted).toBe(true)
    expect(t.view().speaking).toBe(false)
    expect(t.view().canTalk).toBe(true)
    expect(interrupted).toHaveBeenCalledTimes(1)
    expect(interrupted).toHaveBeenCalledWith(S[0])
    t.h.autoAck = true
    const n = t.view().transcript.length
    await t.answer(10_000)
    const tail = t.view().transcript.slice(n)
    expect(tail[0].speaker).toBe('candidate')
    expect(tail[1]).toMatchObject({ speaker: 'interviewer', text: REPLY })
  })

  it('given sentence 0 acked spoken:false, when bargeIn, then no interviewer line and interrupted("")', async () => {
    const { makeLlm, interrupted } = spy()
    const t = setup({ makeLlm })
    await t.toGrilling()
    await t.idle()
    const turn = await grillReply(t)
    t.runner.ack(turn, 0, false)
    await t.runner.intent({ type: 'bargeIn' })
    expect(interviewerLine(t, turn)).toBeUndefined()
    expect(interrupted).toHaveBeenCalledWith('')
  })

  it('given ack with spoken undefined, when bargeIn, then that sentence counts as spoken', async () => {
    const { makeLlm } = spy()
    const t = setup({ makeLlm })
    await t.toGrilling()
    await t.idle()
    const turn = await grillReply(t)
    t.runner.ack(turn, 0)
    t.runner.ack(turn, 1)
    await t.runner.intent({ type: 'bargeIn' })
    expect(interviewerLine(t, turn)?.text).toBe(`${S[0]} ${S[1]}`)
  })

  it('given a warm-up turn, when bargeIn, then interrupted gets the spoken text and warm-up continues', async () => {
    const { makeLlm, interrupted } = spy({ warm: true })
    const t = setup({ makeLlm, autoAck: false })
    await t.runner.start('99', { warmup: true })
    await t.until(() => t.speaks.length >= 3)
    const turn = t.speaks[0].turnId
    t.runner.ack(turn, 0, true)
    await t.runner.intent({ type: 'bargeIn' })
    expect(interrupted).toHaveBeenCalledWith(S[0])
    expect(t.view().phase).toBe('warmup')
    expect(t.view().canTalk).toBe(true)
    expect(interviewerLine(t, turn)?.text).toBe(S[0])
  })

  it('given a fixed interject line, when bargeIn, then interrupted is not called', async () => {
    const { makeLlm, interrupted } = spy()
    const t = setup({ makeLlm })
    await t.toGrilling()
    await t.idle()
    const before = t.speaks.length
    t.h.autoAck = false
    await t.runner.intent({ type: 'answer', ms: 120_000 })
    await t.until(() => t.speaks.length > before)
    await t.runner.intent({ type: 'bargeIn' })
    expect(t.cancels).toContain(t.speaks[before].turnId)
    expect(interrupted).not.toHaveBeenCalled()
    expect(t.view().canTalk).toBe(true)
  })

  it('given grilling, when every reply is barged, then each counts as an agent turn and the section advances at the hard cap', async () => {
    const { makeLlm } = spy()
    const t = setup({ makeLlm })
    const id = await t.toGrilling()
    await t.idle()
    let advanced = false
    for (let i = 0; i < 12 && !advanced; i++) {
      const m0 = t.file(id).machineState
      const turn = await grillReply(t)
      t.runner.ack(turn, 0, true)
      await t.runner.intent({ type: 'bargeIn' })
      const m1 = t.file(id).machineState
      if (m1.current === m0.current) expect(m1.turnsInSection).toBe(m0.turnsInSection + 1)
      else {
        expect(m0.turnsInSection + 1).toBe(m0.caps?.hard)
        expect(m1.turnsInSection).toBe(0)
        advanced = true
      }
    }
    expect(advanced).toBe(true)
    expect(t.view().phase).toBe('grilling')
  })

  it('given not speaking, in review, in presentation, or after the turn completed, when bargeIn, then nothing happens', async () => {
    const { makeLlm, interrupted } = spy()
    const t = setup({ makeLlm })
    await t.runner.start('99', { warmup: false })
    const probe = async (): Promise<void> => {
      const v = t.views.length
      const sv = t.save.mock.calls.length
      await t.runner.intent({ type: 'bargeIn' })
      expect(t.views.length).toBe(v)
      expect(t.save.mock.calls.length).toBe(sv)
    }
    expect(t.view().phase).toBe('review')
    await probe()
    await t.runner.intent({ type: 'ready' })
    expect(t.view().phase).toBe('presentation')
    await probe()
    await t.answer(45_000)
    await t.until(() => t.view().phase === 'grilling')
    await t.idle()
    await probe()
    const turn = await grillReply(t)
    for (const n of [0, 1, 2]) t.runner.ack(turn, n, true)
    await t.idle()
    await probe()
    expect(interrupted).not.toHaveBeenCalled()
  })

  it('given an aborted mid-stream turn, when a newer turn is speaking, then the late continuation leaves speaking true', async () => {
    let delay = 30
    const { makeLlm } = spy({ delayMs: () => delay })
    const t = setup({ makeLlm })
    await t.toGrilling()
    await t.idle()
    const turn = await grillReply(t, 1)
    t.runner.ack(turn, 0, true)
    await t.runner.intent({ type: 'bargeIn' })
    delay = 0
    const before = t.speaks.length
    await t.runner.intent({ type: 'answer', ms: 10_000 })
    await t.until(() => t.speaks.length >= before + 3)
    expect(t.view().speaking).toBe(true)
    await new Promise((r) => setTimeout(r, 80)) // old generator wakes, sees abort, returns
    for (let i = 0; i < 5; i++) await Promise.resolve()
    expect(t.view().speaking).toBe(true)
  })

  it('given a barge-in, then pending is cleared and the partial line is on disk (resume does not re-request)', async () => {
    const { makeLlm } = spy()
    const t = setup({ makeLlm })
    const id = await t.toGrilling()
    await t.idle()
    const turn = await grillReply(t)
    t.runner.ack(turn, 0, true)
    await t.runner.intent({ type: 'bargeIn' })
    const f = t.file(id)
    expect(f.pending).toBeNull()
    expect(f.transcript.at(-1)).toMatchObject({ id: turn, speaker: 'interviewer', text: S[0] })
  })
})

describe('SessionRunner barge-in through ClaudeLlm', () => {
  it('given grill reply A barged after sentence 0, when the next answer is sent, then the request alternates with "<s0> [interrupted]" and no tool_result', async () => {
    const control = {
      section_id: 'business',
      status: 'probing',
      probe_failed: false,
      hint_given: false,
      flags_surfaced: [],
      evidence: 'x',
      numbers_checked: [],
      next_section: null,
      pushback_done: false
    }
    const stub = sseFetch([
      jsonMessage('not json'),
      sseEvents({ text: S.map((x) => x + ' '), control, toolUseId: 'toolu_A' }),
      sseEvents({ text: ['Ok.'], control, toolUseId: 'toolu_B' })
    ])
    const client = new Anthropic({
      apiKey: 'test',
      baseURL: 'http://replay.test',
      fetch: stub.fetch,
      maxRetries: 0
    })
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const makeLlm = createClaudeLlm({ client, model: 'claude-test-model', log })
    const t = setup({ makeLlm, autoAck: false })
    await t.runner.start('99', { warmup: false })
    await t.runner.intent({ type: 'ready' })
    await t.runner.intent({ type: 'answer', ms: 45_000 })
    await t.until(() => t.speaks.length >= 3)
    const turn = t.speaks[0].turnId
    t.runner.ack(turn, 0, true)
    await t.runner.intent({ type: 'bargeIn' })
    t.stt.inject('new answer')
    await t.runner.intent({ type: 'answer', ms: 10_000 })
    await t.until(() => stub.requests.length >= 3)
    const msgs = stub.requests[2].messages as MessageParam[]
    expect(checkConversation(msgs)).toEqual([])
    expect(msgs.at(-2)).toEqual({
      role: 'assistant',
      content: [{ type: 'text', text: `${S[0]} [interrupted]` }]
    })
    const lastMsg = msgs.at(-1) as MessageParam
    expect(lastMsg.role).toBe('user')
    expect(JSON.stringify(lastMsg)).toContain('<candidate_said>new answer')
    expect(JSON.stringify(lastMsg)).not.toContain('tool_result')
  })
})
