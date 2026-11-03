import { describe, it, expect } from 'vitest'
import { SessionFileSchema } from './sessionSchema'
import {
  initialState,
  reduce,
  type InterviewEvent,
  type InterviewState
} from '../domain/machine/interviewMachine'

const minimal = () => ({
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

const scorecard = {
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
})
