import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Scorecard } from '../../shared/ipc'
import { ViewStateSchema } from '../../shared/schemas'
import { loadCase } from '../domain/cases/library'
import {
  initialState,
  reduce,
  type InterviewEvent,
  type InterviewState
} from '../domain/machine/interviewMachine'
import { checkUtterance } from '../domain/text/leakGuard'
import type { SessionFile, Turn } from '../store/sessionSchema'
import { backSolveLines, buildReveal, toViewState, type ViewExtras } from './view'

const FIXTURE_ROOT = join(__dirname, '../../../tests/fixtures/cases')
const deck = readFileSync(join(FIXTURE_ROOT, 'case_99_fixture/deck.txt'), 'utf8')
const { card, brief } = loadCase(FIXTURE_ROOT, '99', deck)
const X: ViewExtras = { clockNow: 1_000, timeScale: 1, speaking: false }

const SCORECARD: Scorecard = {
  rubric: [
    {
      id: 'clear_call',
      dimension: 'Clear call',
      score: 4,
      evidence: [{ quote: 'led with pass', turnId: 't1' }],
      answerKey: 'k',
      rationale: 'r',
      unverified: false
    }
  ],
  total: 20,
  band: 'close',
  flags: [{ id: 'f1', flag: 'churn', status: 'found', where: 'S2' }],
  keep: 'k',
  fix: 'f',
  insight: { calledOut: [], missed: [] },
  summary: 's',
  evidenceStats: { proposed: 1, verified: 1, dropped: 0 },
  checksSummary: {
    numbersCorrect: 0,
    numbersWrong: 0,
    numbersUnverifiable: 0,
    brevity: { short: 0, brief: 0, ideal: 0, long: 0, flagged: 0 },
    avgAnswerMs: null,
    ledWithCall: true,
    flagsFound: 1,
    flagsHinted: 0,
    flagsTotal: 1
  },
  graderModel: 'fake',
  promptVersion: 'v1',
  scoredAt: 6
}

const fold = (events: InterviewEvent[]): InterviewState =>
  events.reduce((s, e) => reduce(s, e).state, initialState())

const START: InterviewEvent = { type: 'START', now: 0, config: { warmup: true } }
const PATHS: Record<string, InterviewEvent[]> = {
  warmup: [START],
  review: [START, { type: 'WARMUP_SKIPPED', now: 1 }],
  presentation: [START, { type: 'WARMUP_SKIPPED', now: 1 }, { type: 'READY', now: 2 }],
  extraction: [
    START,
    { type: 'WARMUP_SKIPPED', now: 1 },
    { type: 'READY', now: 2 },
    { type: 'PRESENTATION_DONE', now: 3 }
  ]
}
PATHS.grilling = [...PATHS.extraction, { type: 'SECTION_PLAN_SET', now: 4, order: ['business'] }]
PATHS.scoring = [...PATHS.grilling, { type: 'END_REQUESTED', now: 5 }]
PATHS.reviewMode = [...PATHS.scoring, { type: 'SCORED', now: 6 }]

const turn = (
  id: string,
  speaker: Turn['speaker'],
  phase: Turn['phase'],
  text: string,
  ms?: number
): Turn =>
  ms === undefined ? { id, speaker, phase, text, at: 0 } : { id, speaker, phase, text, at: 0, ms }

const TRANSCRIPT: Turn[] = [
  turn('t0', 'candidate', 'warmup', 'Hi, glad to be here.', 10_000),
  turn('t1', 'candidate', 'presentation', 'My call is to pass. Then the reasons follow.', 45_000),
  turn('t2', 'interviewer', 'grilling', 'Walk me through retention.'),
  turn('t3', 'candidate', 'grilling', 'Retention is steady across cohorts.', 95_000)
]

function session(machineState: InterviewState, extra: Partial<SessionFile> = {}): SessionFile {
  return {
    schemaVersion: 1,
    id: 's1',
    caseId: '99',
    startedAt: 0,
    status: 'active',
    warmup: true,
    machineState,
    transcript: TRANSCRIPT,
    controlLog: [],
    timings: [],
    pending: null,
    ...extra
  }
}

const atPhase = (p: string, extra: Partial<SessionFile> = {}): SessionFile => {
  if (p === 'wrapup') return session({ ...fold(PATHS.grilling), phase: 'wrapup' }, extra)
  return session(fold(PATHS[p]), extra)
}

const strings = (v: unknown): string[] =>
  typeof v === 'string'
    ? [v]
    : Array.isArray(v)
      ? v.flatMap(strings)
      : v && typeof v === 'object'
        ? Object.values(v).flatMap(strings)
        : []

const hiddenFlag = (h: unknown): string | null =>
  typeof h === 'string'
    ? h
    : h && typeof h === 'object'
      ? ((h as { flag?: string }).flag ?? null)
      : null

const SECRETS = [
  brief.idealAnswer,
  ...brief.flags.map.flatMap((f) => [f.flag, f.say]),
  ...brief.flags.hidden.map(hiddenFlag),
  ...brief.rubric.flatMap((r) => [r.five, r.one]).filter((t) => t.split(/\s+/).length >= 3),
  brief.intendedRead.sentence
].filter((s): s is string => typeof s === 'string' && s.length > 0)

const deepFreeze = <T>(o: T): T => {
  if (o && typeof o === 'object') {
    Object.values(o).forEach(deepFreeze)
    Object.freeze(o)
  }
  return o
}

const PRE_REVIEW = [
  'warmup',
  'review',
  'presentation',
  'extraction',
  'grilling',
  'wrapup',
  'scoring'
]

describe('toViewState barrier (BAR-01)', () => {
  it('has secrets to sweep for', () => {
    expect(SECRETS.length).toBeGreaterThan(3)
  })

  it.each(PRE_REVIEW)('given phase %s, then no reveal, schema-valid, no brief content', (p) => {
    const v = toViewState(atPhase(p, { scorecard: SCORECARD }), card, brief, X)
    expect(v.phase).toBe(p)
    expect(v.reveal).toBeNull()
    expect(() => ViewStateSchema.parse(v)).not.toThrow()
    const json = JSON.stringify(v)
    for (const s of SECRETS) expect(json).not.toContain(s)
    for (const leaf of strings(v)) expect(checkUtterance(leaf, brief)).toEqual({ ok: true })
  })

  it('has exactly the 16 ViewState keys', () => {
    const v = toViewState(atPhase('grilling'), card, brief, X)
    expect(Object.keys(v).sort()).toEqual(
      [
        'sessionId',
        'phase',
        'card',
        'reviewDeadline',
        'clockNow',
        'timeScale',
        'section',
        'transcript',
        'speaking',
        'canTalk',
        'endedEarly',
        'reveal',
        'deckPage',
        'reviewWarned',
        'transcribing',
        'scoringFailed'
      ].sort()
    )
  })

  it('does not mutate a frozen session', () => {
    const s = deepFreeze(atPhase('reviewMode', { scorecard: SCORECARD }))
    const before = JSON.stringify(s)
    expect(() => toViewState(s, card, brief, X)).not.toThrow()
    expect(JSON.stringify(s)).toBe(before)
  })
})

describe('toViewState fields', () => {
  it('maps idle to warmup', () => {
    expect(toViewState(session(initialState()), card, brief, X).phase).toBe('warmup')
  })

  it('projects transcript to id/speaker/text', () => {
    const v = toViewState(atPhase('grilling'), card, brief, X)
    expect(v.transcript[1]).toEqual({ id: 't1', speaker: 'candidate', text: TRANSCRIPT[1].text })
  })

  it('given grilling with done 2 of 7 on retention, then section view', () => {
    const g = fold(PATHS.grilling)
    const ms: InterviewState = {
      ...g,
      plan: ['business', 'lead_edge_8', 'retention', 'industry', 'diligence', 'valuation', 'call'],
      done: ['business', 'lead_edge_8'],
      current: 'retention'
    }
    expect(toViewState(session(ms), card, brief, X).section).toEqual({
      id: 'retention',
      label: 'Retention',
      index: 2,
      total: 7
    })
    expect(toViewState(atPhase('review'), card, brief, X).section).toBeNull()
  })

  it('computes canTalk', () => {
    expect(toViewState(atPhase('grilling'), card, brief, { ...X, speaking: true }).canTalk).toBe(
      false
    )
    expect(toViewState(atPhase('review'), card, brief, X).canTalk).toBe(false)
    expect(toViewState(atPhase('grilling'), card, brief, X).canTalk).toBe(true)
  })

  it('given extras, then transcribing defaults false, mirrors extras, and blocks canTalk', () => {
    expect(toViewState(atPhase('grilling'), card, brief, X).transcribing).toBe(false)
    const v = toViewState(atPhase('grilling'), card, brief, { ...X, transcribing: true })
    expect(v.transcribing).toBe(true)
    expect(v.canTalk).toBe(false)
  })

  it('given no deckPage then 1; given deckPage 7 then 7', () => {
    expect(toViewState(atPhase('review'), card, brief, X).deckPage).toBe(1)
    expect(toViewState(atPhase('review', { deckPage: 7 }), card, brief, X).deckPage).toBe(7)
  })

  it('carries reviewWarned from the machine state', () => {
    expect(toViewState(atPhase('review'), card, brief, X).reviewWarned).toBe(false)
    const ms = { ...fold(PATHS.review), reviewWarned: true }
    expect(toViewState(session(ms), card, brief, X).reviewWarned).toBe(true)
  })

  it('carries endedEarly, reviewDeadline and extras', () => {
    const s = atPhase('scoring')
    const v = toViewState(s, card, brief, { clockNow: 7, timeScale: 60, speaking: true })
    expect(v.endedEarly).toBe(true)
    expect(v.reviewDeadline).toBe(s.machineState.reviewDeadline)
    expect([v.clockNow, v.timeScale, v.speaking]).toEqual([7, 60, true])
  })
})

describe('reveal', () => {
  it('given reviewMode with scorecard, then reveal carries the answer key', () => {
    const v = toViewState(atPhase('reviewMode', { scorecard: SCORECARD }), card, brief, X)
    expect(v.reveal).not.toBeNull()
    expect(v.reveal?.idealAnswer).toBe(brief.idealAnswer)
    expect(v.reveal?.keyNumbers).toEqual(brief.memorize)
    expect(v.reveal?.opening).toBe(TRANSCRIPT[1].text)
    expect(v.reveal?.scorecard).toEqual(SCORECARD)
  })

  it('computes checks', () => {
    const s = atPhase('reviewMode', { scorecard: SCORECARD })
    const r = buildReveal(
      { ...s, machineState: { ...s.machineState, omitted: ['diligence'] } },
      brief
    )
    expect(r.checks.brevity).toEqual([
      { turnId: 't1', ms: 45_000, band: 'ideal' },
      { turnId: 't3', ms: 95_000, band: 'flagged' }
    ])
    expect(r.checks.ledWithCall).toBe(true)
    expect(r.checks.omitted).toEqual(['Diligence'])
    expect(r.checks.numbers).toEqual([])
  })

  it('given an opening without a call, then ledWithCall false', () => {
    const s = atPhase('reviewMode', {
      scorecard: SCORECARD,
      transcript: [
        turn('p', 'candidate', 'presentation', 'The company sells widgets. I would invest.')
      ]
    })
    expect(buildReveal(s, brief).checks.ledWithCall).toBe(false)
  })

  it('given a wrong GRR claim, then checks.numbers flags it with the case value', () => {
    const s = atPhase('reviewMode', {
      scorecard: SCORECARD,
      transcript: [turn('p', 'candidate', 'presentation', 'GRR is about 95%', 30_000)]
    })
    expect(buildReveal(s, brief).checks.numbers).toEqual([
      { claim: '95%', matched: null, expected: '85%', correct: false }
    ])
  })

  it('given reviewMode, then reveal carries the intended read, back-solve and a timed transcript', () => {
    const transcript: Turn[] = [
      {
        id: 'a',
        speaker: 'interviewer',
        phase: 'grilling',
        section: 'retention',
        text: 'Q?',
        at: 1_500
      },
      { id: 'b', speaker: 'candidate', phase: 'grilling', text: 'A.', at: 4_000, ms: 2_000 }
    ]
    const s = atPhase('reviewMode', { scorecard: SCORECARD, transcript, startedAt: 1_000 })
    const r = buildReveal(s, brief)
    expect(r.intendedRead).toBe(brief.intendedRead.sentence)
    expect(r.backSolve.slice(0, 2)).toEqual(['Post-money: $34M', 'Exit equity needed: $102M'])
    expect(r.transcript).toEqual([
      {
        id: 'a',
        speaker: 'interviewer',
        text: 'Q?',
        offsetMs: 500,
        ms: null,
        section: 'retention'
      },
      { id: 'b', speaker: 'candidate', text: 'A.', offsetMs: 3_000, ms: 2_000, section: null }
    ])
  })

  it('given extras, then scoringFailed defaults false and mirrors extras', () => {
    expect(toViewState(atPhase('scoring'), card, brief, X).scoringFailed).toBe(false)
    const v = toViewState(atPhase('scoring'), card, brief, { ...X, scoringFailed: true })
    expect(v.scoringFailed).toBe(true)
  })

  it('given no presentation turn, then opening empty', () => {
    const s = atPhase('reviewMode', { scorecard: SCORECARD, transcript: [] })
    expect(buildReveal(s, brief).opening).toBe('')
  })

  it('given reviewMode without scorecard, then reveal null; buildReveal throws', () => {
    const s = atPhase('reviewMode')
    expect(toViewState(s, card, brief, X).reveal).toBeNull()
    expect(() => buildReveal(s, brief)).toThrow()
  })
})

describe('backSolveLines', () => {
  it.each([
    [{ label: 'Post', v: 34, fmt: '$M' }, 'Post: $34M'],
    [{ label: 'Rev', v: 9.9, fmt: 'm' }, 'Rev: $9.9M'],
    [{ label: 'Val', v: 120, fmt: 'val' }, 'Val: $120M'],
    [{ label: 'CAGR', v: 0.314, fmt: 'pct1' }, 'CAGR: 31.4%'],
    [{ label: 'GRR', v: 0.9, fmt: 'pct' }, 'GRR: 90%'],
    [{ label: 'G', v: 0.25, fmt: 'growth' }, 'G: 25%'],
    [{ label: 'Mult', v: 4, fmt: 'x' }, 'Mult: 4x'],
    [{ label: 'Yrs', v: 5, fmt: 'years' }, 'Yrs: 5']
  ])('given step %j, then %s', (step, line) => {
    expect(backSolveLines({ steps: [{ id: 's', ...step }] })).toEqual([line])
  })
  it('given band check and underwrite text, then they follow the steps', () => {
    expect(
      backSolveLines({ steps: [], le_band_check: 'above', underwrite_path_text: 'path' })
    ).toEqual(['above', 'path'])
  })
  it.each([null, 'x', 3, undefined])('given non-object %j, then []', (v) => {
    expect(backSolveLines(v)).toEqual([])
  })
})
