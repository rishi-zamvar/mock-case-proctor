import { describe, expect, it } from 'vitest'
import { DIMENSION_IDS } from '../../shared/ipc'
import { ScorecardSchema } from '../../shared/schemas'
import { FIXTURE_ROOT, deck } from '../session/runner.harness'
import { loadCase } from '../domain/cases/library'
import type { ScoreInput } from '../ports'
import type { Turn } from '../store/sessionSchema'
import {
  GENERIC_RUBRIC,
  assembleScorecard,
  computeChecks,
  rubricRows,
  summarizeChecks,
  type GradeDraft
} from './scorecard'

const { brief } = loadCase(FIXTURE_ROOT, '99', deck)

const T: Turn[] = [
  {
    id: 'c1',
    speaker: 'candidate',
    phase: 'presentation',
    text: 'My call is to pass at this price. GRR is about 95% and ARR is $9.9M.',
    at: 0,
    ms: 45_000
  },
  {
    id: 'i1',
    speaker: 'interviewer',
    phase: 'grilling',
    text: 'Walk me through retention.',
    at: 1
  },
  {
    id: 'c2',
    speaker: 'candidate',
    phase: 'grilling',
    text: 'Retention looks steady but the tenured cohort hides churn.',
    at: 2,
    ms: 95_000
  }
]

const INPUT: ScoreInput = {
  transcript: T,
  controlLog: [
    {
      at: 1,
      turnId: 'c1',
      control: { section: 'retention', section_status: 'continue', flags_surfaced: ['f1'] }
    },
    {
      at: 2,
      turnId: 'c2',
      control: {
        section: 'retention',
        section_status: 'continue',
        flags_surfaced: ['f2'],
        flags_hinted: ['f2']
      }
    }
  ],
  endedEarly: false,
  omitted: ['diligence'],
  at: 777
}

const CTX = { input: INPUT, brief, graderModel: 'm', promptVersion: 'p1' }

const dim = (
  id: (typeof DIMENSION_IDS)[number],
  score: number,
  quotes: string[]
): GradeDraft['dimensions'][number] => ({
  id,
  score,
  evidence_quotes: quotes,
  answer_key_item: '',
  rationale: 'Because.'
})

const draft = (over: Partial<GradeDraft> = {}): GradeDraft => ({
  dimensions: DIMENSION_IDS.map((id) => dim(id, 4, ['my call is to pass'])),
  keep: 'Keep.',
  fix: 'Fix.',
  insight: { called_out: ['a'], missed: ['b'] },
  summary: 'Summary.',
  ...over
})

describe('rubricRows', () => {
  it('given case_99 with 6 rubric rows, when mapped, then case rows by index on DIMENSION_IDS', () => {
    const rows = rubricRows(brief)
    expect(rows).toHaveLength(6)
    expect(rows[0]).toEqual({
      id: 'clear_call',
      dimension: 'Clear call',
      five: 'Firm call with a price.',
      one: 'No call.'
    })
    expect(rows.map((r) => r.id)).toEqual([...DIMENSION_IDS])
  })

  it('given no case rubric, when mapped, then the generic playbook rows', () => {
    expect(rubricRows({ rubric: [] })).toEqual(GENERIC_RUBRIC)
    expect(GENERIC_RUBRIC.map((r) => r.id)).toEqual([...DIMENSION_IDS])
    expect(GENERIC_RUBRIC[0].five).toBe(
      'Leads with invest / pass / invest-at-a-price in the first sentence'
    )
  })
})

describe('computeChecks', () => {
  it('given the scripted transcript, when computed, then numbers, brevity, call and omitted', () => {
    const c = computeChecks(INPUT, brief)
    expect(c.numbers).toEqual([
      { claim: '95%', matched: null, expected: '85%', correct: false },
      { claim: '$9.9M', matched: '$9.9M', expected: null, correct: true }
    ])
    expect(c.brevity).toEqual([
      { turnId: 'c1', ms: 45_000, band: 'ideal' },
      { turnId: 'c2', ms: 95_000, band: 'flagged' }
    ])
    expect(c.ledWithCall).toBe(true)
    expect(c.omitted).toEqual(['Diligence'])
  })

  it('given an unclear opening plan, when computed, then ledWithCall false', () => {
    const c = computeChecks(
      {
        ...INPUT,
        openingPlan: { recommendation: 'unclear' } as NonNullable<ScoreInput['openingPlan']>
      },
      brief
    )
    expect(c.ledWithCall).toBe(false)
  })
})

describe('summarizeChecks', () => {
  it('given checks and flags, when summarized, then counts, zero-filled bands, mean ms', () => {
    const c = computeChecks(INPUT, brief)
    const s = summarizeChecks(
      { ...c, numbers: [...c.numbers, { ...c.numbers[0], correct: 'unverifiable' }] },
      [
        { id: 'f1', flag: 'a', status: 'found', where: '' },
        { id: 'f2', flag: 'b', status: 'hinted', where: '' },
        { id: 'f3', flag: 'c', status: 'missed', where: '' }
      ]
    )
    expect(s).toEqual({
      numbersCorrect: 1,
      numbersWrong: 1,
      numbersUnverifiable: 1,
      brevity: { short: 0, brief: 0, ideal: 1, long: 0, flagged: 1 },
      avgAnswerMs: 70_000,
      ledWithCall: true,
      flagsFound: 1,
      flagsHinted: 1,
      flagsTotal: 3
    })
  })

  it('given no answers, when summarized, then avgAnswerMs null', () => {
    const s = summarizeChecks({ brevity: [], ledWithCall: false, omitted: [], numbers: [] }, [])
    expect(s.avgAnswerMs).toBeNull()
    expect(s.brevity).toEqual({ short: 0, brief: 0, ideal: 0, long: 0, flagged: 0 })
  })
})

describe('assembleScorecard', () => {
  it('given verbatim quotes, when assembled, then verified evidence, code total and band', () => {
    const card = assembleScorecard(draft(), CTX)
    expect(ScorecardSchema.parse(card)).toEqual(card)
    for (const r of card.rubric) {
      expect(r.evidence).toEqual([{ quote: 'my call is to pass', turnId: 'c1' }])
      expect(r.unverified).toBe(false)
      expect(r.score).toBe(4)
    }
    expect(card.total).toBe(24)
    expect(card.band).toBe('close')
    expect(card.evidenceStats).toEqual({ proposed: 6, verified: 6, dropped: 0 })
    expect(card.scoredAt).toBe(777)
    expect(card.graderModel).toBe('m')
    expect(card.promptVersion).toBe('p1')
    expect(card.keep).toBe('Keep.')
    expect(card.insight).toEqual({ calledOut: ['a'], missed: ['b'] })
    expect(Object.isFrozen(card)).toBe(true)
  })

  it('given labels, when assembled, then dimension from rubric rows and answerKey falls back to five', () => {
    const d = draft()
    d.dimensions[1] = { ...d.dimensions[1], answer_key_item: 'Key item' }
    const card = assembleScorecard(d, CTX)
    expect(card.rubric[0].dimension).toBe('Clear call')
    expect(card.rubric[0].answerKey).toBe('Firm call with a price.')
    expect(card.rubric[1].answerKey).toBe('Key item')
  })

  it('given a dimension of fabricated quotes, when assembled, then no evidence, unverified, capped at 2', () => {
    const d = draft()
    d.dimensions[2] = dim('retention', 5, ['I never said this at all', 'nor this one either'])
    const card = assembleScorecard(d, CTX)
    expect(card.rubric[2]).toMatchObject({ evidence: [], unverified: true, score: 2 })
    expect(card.total).toBe(22)
    expect(card.evidenceStats).toEqual({ proposed: 7, verified: 5, dropped: 2 })
  })

  it('given a low fabricated score, when assembled, then it is kept (min with 2)', () => {
    const d = draft()
    d.dimensions[0] = dim('clear_call', 1, ['invented words here'])
    expect(assembleScorecard(d, CTX).rubric[0].score).toBe(1)
  })

  it('given more than 3 quotes, when assembled, then only the first 3 are considered', () => {
    const d = draft()
    d.dimensions[0] = dim('clear_call', 4, [
      'my call is to pass',
      'fake quote number one',
      'the tenured cohort hides churn',
      'my call is to pass at this price'
    ])
    const card = assembleScorecard(d, CTX)
    expect(card.rubric[0].evidence).toEqual([
      { quote: 'my call is to pass', turnId: 'c1' },
      { quote: 'the tenured cohort hides churn', turnId: 'c2' }
    ])
    expect(card.evidenceStats).toEqual({ proposed: 8, verified: 7, dropped: 1 })
  })

  it.each([
    ['a missing dimension', (d: GradeDraft) => d.dimensions.pop()],
    ['a duplicated dimension', (d: GradeDraft) => (d.dimensions[5] = { ...d.dimensions[0] })],
    ['score 0', (d: GradeDraft) => (d.dimensions[0].score = 0)],
    ['score 6', (d: GradeDraft) => (d.dimensions[0].score = 6)],
    ['score 2.5', (d: GradeDraft) => (d.dimensions[0].score = 2.5)]
  ])('given %s, when assembled, then it throws', (_, mutate) => {
    const d = draft()
    d.dimensions = d.dimensions.map((x) => ({ ...x }))
    mutate(d)
    expect(() => assembleScorecard(d, CTX)).toThrow('grade: invalid dimensions')
  })

  it('given long rationale and summary, when assembled, then truncated to 40 and 60 words', () => {
    const words = (n: number): string => Array.from({ length: n }, (_, i) => `w${i}`).join('  ')
    const d = draft({ summary: words(80) })
    d.dimensions[0] = { ...d.dimensions[0], rationale: words(50) }
    const card = assembleScorecard(d, CTX)
    expect(card.rubric[0].rationale.split(' ')).toHaveLength(40)
    expect(card.summary.split(' ')).toHaveLength(60)
    expect(card.summary.startsWith('w0 w1 ')).toBe(true)
  })

  it('given the control log, when assembled, then flag map and checks summary come from code', () => {
    const card = assembleScorecard(draft(), CTX)
    expect(card.flags.map((f) => [f.id, f.status])).toEqual([
      ['f1', 'found'],
      ['f2', 'hinted']
    ])
    expect(card.checksSummary).toMatchObject({
      numbersCorrect: 1,
      numbersWrong: 1,
      ledWithCall: true,
      flagsFound: 1,
      flagsHinted: 1,
      flagsTotal: 2
    })
  })
})
