// Phase 6 runner wiring: proctor facts, turn filter, timings/usage, opening plan.
import { describe, expect, it } from 'vitest'
import { createFakeLlm } from '../adapters/fakeLlm'
import type { LlmChunk, LlmUsage, MakeLlm, OpeningPlan, TurnRequest } from '../ports'
import { lines, manualClock, setup } from './runner.harness'

const PLAN: OpeningPlan = {
  recap: 'r',
  recommendation: 'invest',
  price: null,
  considerations: [
    { label: 'retention is strong', section_id: 'retention', stance: 'for' },
    { label: 'price is rich', section_id: 'valuation', stance: 'against' }
  ],
  order: ['business', 'valuation', 'call']
}

const USAGE: LlmUsage = {
  inputTokens: 100,
  outputTokens: 20,
  cacheRead: 90,
  cacheWrite: 0,
  stopReason: 'end_turn'
}

/** Fake LLM recording TurnRequests; optional plan and stream override. */
function recording(
  o: {
    plan?: OpeningPlan
    stream?: (req: TurnRequest, signal: AbortSignal) => AsyncIterable<LlmChunk>
  } = {}
): { makeLlm: MakeLlm; reqs: TurnRequest[] } {
  const reqs: TurnRequest[] = []
  const makeLlm: MakeLlm = (brief) => {
    const base = createFakeLlm({ chunkDelayMs: 0 })(brief)
    return {
      ...base,
      streamTurn: (req, signal) => {
        reqs.push(req)
        return o.stream ? o.stream(req, signal) : base.streamTurn(req, signal)
      },
      extractPlan: async (opening, signal) => {
        const r = await base.extractPlan(opening, signal)
        return o.plan ? { ...r, plan: o.plan } : r
      }
    }
  }
  return { makeLlm, reqs }
}

describe('SessionRunner proctor facts', () => {
  it('given an extracted plan, when grilling, then first turn is framing with labels and the next is probe without', async () => {
    const { makeLlm, reqs } = recording({ plan: PLAN })
    const t = setup({ makeLlm })
    await t.toGrilling()
    await t.idle()
    await t.answer()
    expect(reqs[0].proctor?.directive).toBe('framing')
    expect(reqs[0].proctor?.openingLabels).toEqual(['retention is strong', 'price is rich'])
    expect(reqs[1].proctor?.directive).toBe('probe')
    expect(reqs[1].proctor?.openingLabels).toEqual([])
  })
})

describe('SessionRunner turn filter', () => {
  it('given 6 sentences, when streamed, then only 4 are spoken', async () => {
    const six = 'One here. Two here. Three here. Four here. Five here. Six here.'
    const { makeLlm } = recording({ stream: (_r, s) => lines(six, s) })
    const t = setup({ makeLlm })
    const id = await t.toGrilling()
    await t.idle()
    const turnId = t.file(id).transcript.at(-1)!.id
    expect(t.speaks.filter((x) => x.turnId === turnId)).toHaveLength(4)
    expect(t.log.warn).toHaveBeenCalledWith('utterance dropped', 'too_long')
  })

  it('given a banned phrase, when streamed, then it is not spoken or stored and the log has the reason only', async () => {
    const bad = "Great question, so what's churn?"
    const { makeLlm } = recording({ stream: (_r, s) => lines(`${bad} Walk me through ARR.`, s) })
    const t = setup({ makeLlm })
    const id = await t.toGrilling()
    await t.idle()
    expect(t.speaks.some((x) => x.text.toLowerCase().includes('great question'))).toBe(false)
    expect(t.file(id).transcript.at(-1)!.text).toBe('Walk me through ARR.')
    expect(t.log.warn).toHaveBeenCalledWith('utterance dropped', 'banned_phrase')
    const logs = JSON.stringify([t.log.warn.mock.calls, t.log.info.mock.calls])
    expect(logs).not.toContain('churn')
  })
})

describe('SessionRunner timings and usage', () => {
  it('given a grill stream with usage, when done, then timings are ordered and usage is recorded', async () => {
    const clock = manualClock()
    async function* stream(): AsyncGenerator<LlmChunk> {
      clock.advance(100)
      yield { type: 'text', delta: 'What is ' }
      clock.advance(50)
      yield { type: 'text', delta: 'the churn? ' }
      clock.advance(50)
      yield { type: 'done', usage: USAGE }
    }
    const { makeLlm } = recording({ stream })
    const t = setup({ makeLlm, clock })
    const id = await t.toGrilling()
    await t.idle()
    const row = t.file(id).timings.find((r) => r.kind === 'grill')!
    expect(row.firstTextAt).toBeDefined()
    expect(row.firstSentenceAt).toBeDefined()
    expect(row.startedAt).toBeLessThan(row.firstTextAt!)
    expect(row.firstTextAt!).toBeLessThan(row.firstSentenceAt!)
    expect(row.firstSentenceAt!).toBeLessThanOrEqual(row.doneAt)
    expect(row.usage).toEqual(USAGE)
    expect(t.log.info).toHaveBeenCalledWith('llm usage', 'grill', 90, 20, 'end_turn')
  })

  it('given no usage on done, when recorded, then usage is absent', async () => {
    const t = setup({ makeLlm: recording().makeLlm })
    const id = await t.toGrilling()
    await t.idle()
    const row = t.file(id).timings.find((r) => r.kind === 'grill')!
    expect(row.usage).toBeUndefined()
    expect(row.firstSentenceAt).toBeDefined()
  })
})

describe('SessionRunner opening plan', () => {
  it('given extractPlan returns a plan, when extracted, then it is persisted', async () => {
    const t = setup({ makeLlm: recording({ plan: PLAN }).makeLlm })
    const id = await t.toGrilling()
    expect(t.store.load(id)?.openingPlan).toEqual(PLAN)
  })

  it('given extractPlan returns only order, when extracted, then openingPlan is undefined', async () => {
    const t = setup({ makeLlm: recording().makeLlm })
    const id = await t.toGrilling()
    expect(t.store.load(id)?.openingPlan).toBeUndefined()
  })
})

describe('SessionRunner hint anomaly', () => {
  it('given hint_given without permission, when the turn ends, then a warn is logged and the control is applied', async () => {
    async function* stream(_r: TurnRequest, s: AbortSignal): AsyncGenerator<LlmChunk> {
      yield* lines('Think about the cohorts.', s)
      yield {
        type: 'control',
        payload: { section: 'business', section_status: 'continue', hint_given: true }
      }
    }
    const t = setup({ makeLlm: recording({ stream }).makeLlm })
    const id = await t.toGrilling()
    await t.idle()
    expect(t.log.warn).toHaveBeenCalledWith('hint without permission')
    expect(t.file(id).controlLog.at(-1)?.control.hint_given).toBe(true)
    expect(t.file(id).machineState.turnsInSection).toBe(1)
  })
})
