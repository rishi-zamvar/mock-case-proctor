// Phase 8 scoring flow: full ScoreInput, silent retry, visible retry, onScored hook.
import { describe, expect, it, vi } from 'vitest'
import { SORRY_LINE } from '../agent/turnText'
import { createFakeLlm } from '../adapters/fakeLlm'
import { speakable } from '../domain/text/speakable'
import type { LlmPort, MakeLlm } from '../ports'
import { setup } from './runner.harness'

const SORRY = speakable(SORRY_LINE)
type Score = LlmPort['scoreSession']

function scripted(plan: ('fail' | 'ok' | 'hang')[]): {
  makeLlm: MakeLlm
  score: ReturnType<typeof vi.fn<Score>>
} {
  let real: Score | null = null
  let n = 0
  const score = vi.fn<Score>((i, s) => {
    const step = plan[n++] ?? 'ok'
    if (step === 'fail') return Promise.reject(new Error('overloaded'))
    if (step === 'hang') return new Promise(() => undefined)
    return (real as Score)(i, s)
  })
  const makeLlm: MakeLlm = (brief) => {
    const base = createFakeLlm({ chunkDelayMs: 0 })(brief)
    real = base.scoreSession
    return { ...base, scoreSession: score }
  }
  return { makeLlm, score }
}

describe('runner scoring flow', () => {
  it('given scoring, when scoreSession is called, then it gets the opening plan and the scoring time', async () => {
    const { makeLlm, score } = scripted(['ok'])
    const t = setup({ makeLlm })
    const id = await t.toGrilling()
    const plan = t.file(id).openingPlan
    t.clock.advance(5_000)
    const at = t.clock.now()
    await t.runner.intent({ type: 'end' })
    await t.until(() => t.view().phase === 'reviewMode')
    expect(score).toHaveBeenCalledTimes(1)
    expect(score.mock.calls[0][0].openingPlan).toEqual(plan)
    expect(score.mock.calls[0][0].at).toBe(at)
  })

  it('given one scoring failure, when retried, then no sorry line, reviewMode and scorecard persisted', async () => {
    const { makeLlm, score } = scripted(['fail', 'ok'])
    const onScored = vi.fn()
    const t = setup({ makeLlm, onScored })
    const { sessionId: id } = await t.runner.start('99', { warmup: false })
    await t.runner.intent({ type: 'end' })
    await t.until(() => t.view().phase === 'reviewMode')
    expect(score).toHaveBeenCalledTimes(2)
    expect(t.speaks.some((x) => x.text === SORRY)).toBe(false)
    expect(t.file(id).scorecard).toBeDefined()
    expect(onScored).toHaveBeenCalledTimes(1)
    expect(onScored).toHaveBeenCalledWith(id)
  })

  it('given two scoring failures, then scoringFailed, transcript kept, no scorecard, no onScored; retry lands in reviewMode', async () => {
    const { makeLlm, score } = scripted(['fail', 'fail', 'ok'])
    const onScored = vi.fn()
    const t = setup({ makeLlm, onScored })
    const id = await t.toGrilling()
    const turns = t.file(id).transcript.length
    await t.runner.intent({ type: 'end' })
    await t.until(() => t.view().scoringFailed === true)
    expect(t.view().phase).toBe('scoring')
    expect(t.speaks.some((x) => x.text === SORRY)).toBe(false)
    expect(t.log.error).toHaveBeenCalledWith('llm turn failed', 'score')
    const f = t.file(id)
    expect(f.transcript).toHaveLength(turns)
    expect(f.scorecard).toBeUndefined()
    expect(onScored).not.toHaveBeenCalled()

    const before = t.views.length
    await t.runner.intent({ type: 'retryScore' })
    expect(t.views[before].scoringFailed).toBe(false)
    await t.until(() => t.view().phase === 'reviewMode')
    expect(score).toHaveBeenCalledTimes(3)
    expect(t.file(id).scorecard).toBeDefined()
    expect(onScored).toHaveBeenCalledTimes(1)
  })

  it('given scoring in flight (not failed), when retryScore, then ignored', async () => {
    const { makeLlm, score } = scripted(['hang'])
    const t = setup({ makeLlm })
    await t.runner.start('99', { warmup: false })
    await t.runner.intent({ type: 'end' })
    await t.until(() => score.mock.calls.length === 1)
    await t.runner.intent({ type: 'retryScore' })
    expect(score).toHaveBeenCalledTimes(1)
    expect(t.view().phase).toBe('scoring')
  })

  it('given grilling, when retryScore, then ignored', async () => {
    const { makeLlm, score } = scripted([])
    const t = setup({ makeLlm })
    await t.toGrilling()
    const n = t.views.length
    await t.runner.intent({ type: 'retryScore' })
    expect(score).not.toHaveBeenCalled()
    expect(t.views.length).toBe(n)
    expect(t.view().phase).toBe('grilling')
  })
})
