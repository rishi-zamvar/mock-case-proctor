import { describe, it, expect } from 'vitest'
import { SessionFileSchema } from './sessionSchema'
import {
  initialState,
  reduce,
  type InterviewEvent,
  type InterviewState
} from '../domain/machine/interviewMachine'

const minimal = (): Record<string, unknown> => ({
  schemaVersion: 1,
  id: 's1',
  caseId: '99',
  startedAt: 1,
  status: 'active',
  warmup: true,
  machineState: initialState() as InterviewState,
  transcript: [] as unknown[],
  controlLog: [] as unknown[],
  timings: [] as unknown[],
  pending: null as unknown
})

const DIMS = ['clear_call', 'lead_edge_8', 'retention', 'valuation', 'back_solve', 'quality_poise']
const brevity0 = { short: 0, brief: 0, ideal: 0, long: 0, flagged: 0 }
const scorecard = {
  rubric: DIMS.map((id) => ({
    id,
    dimension: id,
    score: 3,
    evidence: [{ quote: 'quote', turnId: 't1' }],
    answerKey: 'key',
    rationale: 'r',
    unverified: false
  })),
  total: 18,
  band: 'another',
  flags: [{ id: 'f1', flag: 'churn', status: 'missed', where: '' }],
  keep: 'k',
  fix: 'f',
  insight: { calledOut: [], missed: [] },
  summary: 's',
  evidenceStats: { proposed: 6, verified: 6, dropped: 0 },
  checksSummary: {
    numbersCorrect: 0,
    numbersWrong: 0,
    numbersUnverifiable: 0,
    brevity: brevity0,
    avgAnswerMs: null,
    ledWithCall: false,
    flagsFound: 0,
    flagsHinted: 0,
    flagsTotal: 1
  },
  graderModel: 'fake',
  promptVersion: 'v0',
  scoredAt: 99
}
const legacyScorecard = {
  rubric: Array.from({ length: 6 }, (_, i) => ({
    dimension: `d${i}`,
    score: 3,
    evidence: 'quote',
    answerKey: 'key'
  })),
  total: 18,
  band: 'average',
  flags: [{ id: 'f1', flag: 'churn', status: 'missed' }],
  graderModel: 'fake',
  promptVersion: 'v0'
}

describe('SessionFileSchema legacy scorecard upgrade', () => {
  const completed = (
    sc: unknown,
    extra: Record<string, unknown> = {}
  ): Record<string, unknown> => ({
    ...minimal(),
    status: 'completed',
    endedAt: 77,
    scorecard: sc,
    ...extra
  })
  it('given a pre-Phase-8 scorecard when parsed then it is upgraded to v2, not rejected', () => {
    const sc = SessionFileSchema.parse(completed(legacyScorecard)).scorecard!
    expect(sc.rubric.map((r) => r.id)).toEqual(DIMS)
    expect(sc.rubric[0]).toEqual({
      id: 'clear_call',
      dimension: 'd0',
      score: 3,
      evidence: [],
      answerKey: 'key',
      rationale: '',
      unverified: true
    })
    expect(sc.band).toBe('another')
    expect(sc.flags).toEqual([{ id: 'f1', flag: 'churn', status: 'missed', where: '' }])
    expect([sc.keep, sc.fix, sc.summary]).toEqual(['', '', ''])
    expect(sc.insight).toEqual({ calledOut: [], missed: [] })
    expect(sc.evidenceStats).toEqual({ proposed: 0, verified: 0, dropped: 0 })
    expect(sc.checksSummary).toEqual({
      numbersCorrect: 0,
      numbersWrong: 0,
      numbersUnverifiable: 0,
      brevity: brevity0,
      avgAnswerMs: null,
      ledWithCall: false,
      flagsFound: 0,
      flagsHinted: 0,
      flagsTotal: 0
    })
    expect([sc.graderModel, sc.promptVersion, sc.scoredAt]).toEqual(['fake', 'v0', 77])
  })
  it.each([
    [27, 'ready'],
    [22, 'close'],
    [18, 'another']
  ])('given a legacy total of %i when parsed then band is %s', (total, band) => {
    const sc = SessionFileSchema.parse(completed({ ...legacyScorecard, total })).scorecard!
    expect(sc.band).toBe(band)
  })
  it('given a legacy scorecard and no endedAt when parsed then scoredAt is startedAt', () => {
    const f = completed(legacyScorecard)
    delete f.endedAt
    expect(SessionFileSchema.parse(f).scorecard!.scoredAt).toBe(1)
  })
  it('given a v2 scorecard when parsed then it passes through unchanged', () => {
    expect(SessionFileSchema.parse(completed(scorecard)).scorecard).toEqual(scorecard)
  })
  it('given a garbage scorecard when parsed then it throws', () => {
    expect(() => SessionFileSchema.parse(completed({ rubric: 'nope', band: 'average' }))).toThrow()
    expect(() => SessionFileSchema.parse(completed(42))).toThrow()
  })
})

describe('SessionFileSchema', () => {
  it('given a minimal active session when parsed then it passes', () => {
    expect(() => SessionFileSchema.parse(minimal())).not.toThrow()
  })

  it('given a machine state from a real reducer run when parsed (and JSON round-tripped) then it passes', () => {
    const events: InterviewEvent[] = [
      { type: 'START', now: 1 },
      { type: 'WARMUP_SKIPPED', now: 2 },
      { type: 'READY', now: 3 },
      { type: 'PRESENTATION_DONE', now: 4 },
      { type: 'SECTION_PLAN_SET', now: 5, order: ['retention'] }
    ]
    const state = events.reduce((s, e) => reduce(s, e).state, initialState())
    const file = { ...minimal(), machineState: state }
    expect(() => SessionFileSchema.parse(file)).not.toThrow()
    expect(() => SessionFileSchema.parse(JSON.parse(JSON.stringify(file)))).not.toThrow()
  })

  it.each([
    ['schemaVersion 2', { schemaVersion: 2 }],
    ["status 'graded'", { status: 'graded' }],
    ["caseId '7'", { caseId: '7' }],
    ["id '../x'", { id: '../x' }],
    ['extra brief key', { brief: {} }]
  ])('given %s when parsed then it throws', (_n, patch) => {
    expect(() => SessionFileSchema.parse({ ...minimal(), ...patch })).toThrow()
  })

  it.each([
    ['phase bogus', { phase: 'bogus' }],
    ['current not_a_section', { current: 'not_a_section' }]
  ])('given machineState %s when parsed then it throws', (_n, patch) => {
    const file = { ...minimal(), machineState: { ...initialState(), ...patch } }
    expect(() => SessionFileSchema.parse(file)).toThrow()
  })

  it('given a candidate transcript turn when parsed then it passes; a system speaker throws', () => {
    const turn = {
      id: 't1',
      speaker: 'candidate',
      phase: 'grilling',
      section: 'retention',
      text: 'hi',
      at: 5,
      ms: 1000
    }
    expect(() => SessionFileSchema.parse({ ...minimal(), transcript: [turn] })).not.toThrow()
    expect(() =>
      SessionFileSchema.parse({ ...minimal(), transcript: [{ ...turn, speaker: 'system' }] })
    ).toThrow()
  })

  it('given a grill pending turn when parsed then it passes; kind other throws', () => {
    const pending = { kind: 'grill', section: 'retention', hintAllowed: false }
    expect(() => SessionFileSchema.parse({ ...minimal(), pending })).not.toThrow()
    expect(() =>
      SessionFileSchema.parse({ ...minimal(), pending: { ...pending, kind: 'other' } })
    ).toThrow()
  })

  it('given a completed session with a scorecard and control log when parsed then it passes', () => {
    const file = {
      ...minimal(),
      status: 'completed',
      endedAt: 99,
      controlLog: [
        { at: 6, turnId: 't2', control: { section: 'retention', section_status: 'sufficient' } }
      ],
      timings: [{ turnId: 't2', kind: 'grill', startedAt: 5, firstTextAt: 5.5, doneAt: 6 }],
      scorecard
    }
    expect(() => SessionFileSchema.parse(file)).not.toThrow()
  })
  it('given a persisted machineState without reviewWarned when parsed then it defaults to false', () => {
    const f = minimal()
    const ms = { ...(f.machineState as Record<string, unknown>) }
    delete ms.reviewWarned
    const parsed = SessionFileSchema.parse({ ...f, machineState: ms })
    expect(parsed.machineState.reviewWarned).toBe(false)
  })

  it('given deckPage when parsed then absent and 1..500 pass; 0, 501 and 2.5 throw', () => {
    expect(SessionFileSchema.parse(minimal()).deckPage).toBeUndefined()
    expect(SessionFileSchema.parse({ ...minimal(), deckPage: 7 }).deckPage).toBe(7)
    for (const deckPage of [0, 501, 2.5])
      expect(() => SessionFileSchema.parse({ ...minimal(), deckPage })).toThrow()
  })
  it('given a pre-Phase-6 machineState without pushbackDone/grillStartedAt/warmupDeadline when parsed then they default', () => {
    const f = minimal()
    const ms = { ...(f.machineState as Record<string, unknown>) }
    delete ms.pushbackDone
    delete ms.grillStartedAt
    delete ms.warmupDeadline
    const timings = [{ turnId: 't1', kind: 'grill', startedAt: 1, doneAt: 2 }]
    const parsed = SessionFileSchema.parse({ ...f, machineState: ms, timings })
    expect(parsed.machineState.pushbackDone).toBe(false)
    expect(parsed.machineState.grillStartedAt).toBeNull()
    expect(parsed.machineState.warmupDeadline).toBeNull()
    expect(parsed.openingPlan).toBeUndefined()
  })

  it('given a control with flags_hinted, evidence, numbers_checked and pushback_done when round-tripped then it is unchanged', () => {
    const file = {
      ...minimal(),
      controlLog: [
        {
          at: 6,
          turnId: 't2',
          control: {
            section: 'valuation',
            section_status: 'continue',
            flags_surfaced: ['f1', 'f2'],
            flags_hinted: ['f2'],
            evidence: 'we pay twelve times revenue',
            numbers_checked: [{ claim: '12x ARR', correct: false }],
            pushback_done: true
          }
        }
      ]
    }
    const parsed = SessionFileSchema.parse(JSON.parse(JSON.stringify(file)))
    expect(parsed).toEqual(SessionFileSchema.parse(file))
    expect(parsed.controlLog[0].control).toEqual(file.controlLog[0].control)
  })

  const openingPlan = {
    recap: 'Invest at a lower price',
    recommendation: 'invest_at_price',
    price: '$400M',
    considerations: [{ label: 'Churn is rising', section_id: 'retention', stance: 'against' }],
    order: ['retention']
  }

  it('given an openingPlan and a timing with firstSentenceAt + usage when round-tripped then it is unchanged', () => {
    const file = {
      ...minimal(),
      openingPlan,
      timings: [
        {
          turnId: 't2',
          kind: 'grill',
          startedAt: 5,
          firstTextAt: 5.5,
          firstSentenceAt: 5.8,
          doneAt: 6,
          usage: { inputTokens: 10, outputTokens: 5, cacheRead: 3, cacheWrite: 0, stopReason: null }
        }
      ]
    }
    const parsed = SessionFileSchema.parse(JSON.parse(JSON.stringify(file)))
    expect(parsed.openingPlan).toEqual(openingPlan)
    expect(parsed.timings).toEqual(file.timings)
  })

  it.each([
    [
      'section_id nonsense',
      {
        ...openingPlan,
        considerations: [{ ...openingPlan.considerations[0], section_id: 'nonsense' }]
      }
    ],
    ['an extra key', { ...openingPlan, extra: 1 }]
  ])('given an openingPlan with %s when parsed then it throws', (_n, plan) => {
    expect(() => SessionFileSchema.parse({ ...minimal(), openingPlan: plan })).toThrow()
  })
})
