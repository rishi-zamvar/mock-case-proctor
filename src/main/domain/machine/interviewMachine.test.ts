import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CONFIG,
  initialState,
  reduce,
  type Effect,
  type InterviewControl,
  type InterviewEvent,
  type InterviewState,
  type Phase
} from './interviewMachine'
import type { SectionId } from './sections'

const T0 = 1_000_000

type Run = { state: InterviewState; effects: Effect[] }

function run(events: InterviewEvent[], from: InterviewState = initialState()): Run {
  let state = from
  const effects: Effect[] = []
  for (const e of events) {
    const r = reduce(state, e)
    state = r.state
    effects.push(...r.effects)
  }
  return { state, effects }
}

const ctl = (c: Partial<InterviewControl> = {}): InterviewControl => ({
  section: 'business',
  section_status: 'continue',
  ...c
})
const turn = (control: InterviewControl | null, now = T0 + 10): InterviewEvent => ({
  type: 'AGENT_TURN_DONE',
  now,
  control
})

/** idle → grilling with the given candidate order (default config). */
function toGrilling(
  order: string[] = ['retention'],
  config?: InterviewEvent & { type: 'START' }
): InterviewState {
  return run([
    config ?? { type: 'START', now: T0 },
    { type: 'WARMUP_DONE', now: T0 + 1 },
    { type: 'READY', now: T0 + 2 },
    { type: 'PRESENTATION_DONE', now: T0 + 3 },
    { type: 'SECTION_PLAN_SET', now: T0 + 4, order }
  ]).state
}

const phasesOf = (effects: Effect[]): Phase[] =>
  effects.flatMap((e) => (e.type === 'PHASE_CHANGED' ? [e.to] : []))

describe('phase path', () => {
  it('default config walks all 8 phases in order with timer, LLM requests and persists', () => {
    const head = run([
      { type: 'START', now: T0 },
      { type: 'WARMUP_DONE', now: T0 + 1 }
    ])
    expect(head.state.phase).toBe('review')
    expect(head.state.reviewDeadline).toBe(T0 + 1 + 45 * 60_000)
    expect(head.effects).toContainEqual({
      type: 'START_TIMER',
      id: 'review',
      deadline: T0 + 1 + 45 * 60_000
    })

    const mid = run(
      [
        { type: 'READY', now: T0 + 2 },
        { type: 'PRESENTATION_DONE', now: T0 + 3 }
      ],
      head.state
    )
    expect(mid.state.phase).toBe('extraction')
    expect(mid.effects).toContainEqual({ type: 'REQUEST_LLM_TURN', kind: 'extraction' })

    const g = run([{ type: 'SECTION_PLAN_SET', now: T0 + 4, order: ['retention'] }], mid.state)
    expect(g.state.phase).toBe('grilling')
    expect(g.state.current).toBe('retention')
    expect(g.state.caps).toEqual({ soft: 3, hard: 5 })
    expect(g.effects).toContainEqual({
      type: 'REQUEST_LLM_TURN',
      kind: 'grill',
      section: 'retention',
      hintAllowed: false
    })

    // 7 sections × hard cap 5 turns of 'continue'
    const grill = run(
      Array.from({ length: 35 }, () => turn(ctl())),
      g.state
    )
    expect(grill.state.phase).toBe('wrapup')
    expect(grill.state.done).toHaveLength(7)
    expect(grill.effects).toContainEqual({ type: 'REQUEST_LLM_TURN', kind: 'wrapup' })

    const tail = run(
      [
        { type: 'WRAPUP_DONE', now: T0 + 20 },
        { type: 'SCORED', now: T0 + 21 }
      ],
      grill.state
    )
    expect(tail.effects).toContainEqual({ type: 'REQUEST_LLM_TURN', kind: 'score' })
    expect(tail.state.phase).toBe('reviewMode')

    const all = [...head.effects, ...mid.effects, ...g.effects, ...grill.effects, ...tail.effects]
    expect(phasesOf(all)).toEqual([
      'warmup',
      'review',
      'presentation',
      'extraction',
      'grilling',
      'wrapup',
      'scoring',
      'reviewMode'
    ])
    const changes = all.filter((e) => e.type === 'PHASE_CHANGED').length
    expect(all.filter((e) => e.type === 'PERSIST').length).toBeGreaterThanOrEqual(changes)
    // every PHASE_CHANGED is immediately followed by PERSIST
    all.forEach((e, i) => {
      if (e.type === 'PHASE_CHANGED') expect(all[i + 1]).toEqual({ type: 'PERSIST' })
    })
  })

  it('WARMUP_SKIPPED behaves like WARMUP_DONE', () => {
    const { state } = run([
      { type: 'START', now: T0 },
      { type: 'WARMUP_SKIPPED', now: T0 + 1 }
    ])
    expect(state.phase).toBe('review')
    expect(state.reviewDeadline).toBe(T0 + 1 + DEFAULT_CONFIG.reviewMs)
  })

  it('warmup disabled goes straight to review, deadline from START', () => {
    const { state, effects } = run([{ type: 'START', now: T0, config: { warmup: false } }])
    expect(state.phase).toBe('review')
    expect(state.reviewDeadline).toBe(T0 + 45 * 60_000)
    expect(phasesOf(effects)).toEqual(['review'])
  })

  it("warmupPosition 'after' places warm-up between review and presentation", () => {
    const { effects, state } = run([
      { type: 'START', now: T0, config: { warmupPosition: 'after' } },
      { type: 'READY', now: T0 + 1 },
      { type: 'WARMUP_DONE', now: T0 + 2 }
    ])
    expect(phasesOf(effects)).toEqual(['review', 'warmup', 'presentation'])
    expect(state.phase).toBe('presentation')
  })

  it.each([
    { at: T0 + 45 * 60_000 - 1, phase: 'review' },
    { at: T0 + 45 * 60_000, phase: 'presentation' },
    { at: T0 + 50 * 60_000, phase: 'presentation' }
  ])('REVIEW_DEADLINE at $at → $phase', ({ at, phase }) => {
    const s = run([{ type: 'START', now: T0, config: { warmup: false } }]).state
    const r = reduce(s, { type: 'REVIEW_DEADLINE', now: at })
    expect(r.state.phase).toBe(phase)
    if (phase === 'review') {
      expect(r.effects).toEqual([])
      expect(r.state).toEqual(s)
    }
  })

  it('budgetMin 60 gives caps 6/8', () => {
    const s = toGrilling(['retention'], { type: 'START', now: T0, config: { budgetMin: 60 } })
    expect(s.caps).toEqual({ soft: 6, hard: 8 })
  })
})

describe('invalid events are ignored', () => {
  const review = run([{ type: 'START', now: T0, config: { warmup: false } }]).state
  it.each<[string, InterviewState, InterviewEvent]>([
    ['SCORED in review', review, { type: 'SCORED', now: T0 }],
    ['READY in idle', initialState(), { type: 'READY', now: T0 }],
    ['AGENT_TURN_DONE in review', review, turn(ctl())],
    ['SECTION_PLAN_SET in review', review, { type: 'SECTION_PLAN_SET', now: T0, order: [] }],
    ['START in review', review, { type: 'START', now: T0 }],
    ['WRAPUP_DONE in idle', initialState(), { type: 'WRAPUP_DONE', now: T0 }]
  ])('%s', (_name, state, event) => {
    const before = structuredClone(state)
    const r = reduce(state, event)
    expect(r.effects).toEqual([])
    expect(r.state).toEqual(before)
  })
})

describe('turn caps and section advance', () => {
  it('sufficient on turn 1 stays in section', () => {
    const s = run(
      [turn(ctl({ section_status: 'sufficient', next_section: 'valuation' }))],
      toGrilling()
    ).state
    expect(s.current).toBe('retention')
    expect(s.turnsInSection).toBe(1)
  })

  it.each<{ name: string; next: SectionId; expected: SectionId; pre?: InterviewEvent[] }>([
    { name: 'valid next_section honoured', next: 'valuation', expected: 'valuation' },
    {
      name: 'next_section already done falls back to plan order',
      // retention → valuation first, then ask for retention again
      pre: [turn(ctl()), turn(ctl({ section_status: 'sufficient', next_section: 'valuation' }))],
      next: 'retention',
      expected: 'business'
    },
    {
      name: 'next_section not in plan falls back to plan order',
      next: 'bogus' as SectionId,
      expected: 'business'
    },
    {
      name: "'call' rejected while non-call sections remain",
      next: 'call',
      expected: 'business'
    }
  ])('$name', ({ pre = [], next, expected }) => {
    const prev = run(pre, toGrilling()).state
    const from = prev.current
    const s = run(
      [turn(ctl()), turn(ctl({ section_status: 'sufficient', next_section: next }))],
      prev
    ).state
    expect(s.current).toBe(expected)
    expect(s.done).toContain(from)
    expect(s.turnsInSection).toBe(0)
  })

  it('soft cap (3 continue turns) does not advance', () => {
    const s = run([turn(ctl()), turn(ctl()), turn(ctl())], toGrilling()).state
    expect(s.current).toBe('retention')
    expect(s.turnsInSection).toBe(3)
  })

  it('hard cap force-advances at the 5th turn', () => {
    const four = run(
      Array.from({ length: 4 }, () => turn(ctl())),
      toGrilling()
    ).state
    expect(four.current).toBe('retention')
    const five = reduce(four, turn(ctl())).state
    expect(five.current).toBe('business')
    expect(five.done).toEqual(['retention'])
  })

  it('null control counts as a continue turn', () => {
    const s = run(
      Array.from({ length: 5 }, () => turn(null)),
      toGrilling()
    ).state
    expect(s.current).toBe('business')
  })

  it('completing call moves to wrapup', () => {
    // walk the first 6 sections via sufficient on turn 2
    const six = run(
      Array.from({ length: 6 }, () => [
        turn(ctl()),
        turn(ctl({ section_status: 'sufficient' }))
      ]).flat(),
      toGrilling()
    ).state
    expect(six.current).toBe('call')
    const r = run([turn(ctl()), turn(ctl({ section_status: 'sufficient' }))], six)
    expect(r.state.phase).toBe('wrapup')
    expect(r.state.current).toBeNull()
    expect(r.effects).toContainEqual({ type: 'REQUEST_LLM_TURN', kind: 'wrapup' })
  })

  it("'call' allowed once it is the only remaining section", () => {
    const six = run(
      Array.from({ length: 5 }, () => [
        turn(ctl()),
        turn(ctl({ section_status: 'sufficient' }))
      ]).flat(),
      toGrilling()
    ).state
    const s = run(
      [turn(ctl()), turn(ctl({ section_status: 'sufficient', next_section: 'call' }))],
      six
    ).state
    expect(s.current).toBe('call')
  })
})

describe('hints', () => {
  const answer: InterviewEvent = {
    type: 'ANSWER_FINAL',
    now: T0 + 30,
    answerId: 'a1',
    text: 'x',
    ms: 1000
  }

  it('one failed probe does not allow a hint', () => {
    const s = run([turn(ctl({ probe_failed: true }))], toGrilling()).state
    expect(s.failedProbes).toBe(1)
    expect(s.hintAllowed).toBe(false)
  })

  it('two failed probes allow a hint on the next grill request', () => {
    const r = run(
      [turn(ctl({ probe_failed: true })), turn(ctl({ probe_failed: true })), answer],
      toGrilling()
    )
    expect(r.state.hintAllowed).toBe(true)
    expect(r.effects.at(-1)).toEqual({
      type: 'REQUEST_LLM_TURN',
      kind: 'grill',
      section: 'retention',
      hintAllowed: true
    })
  })

  it('section change resets probes and hint', () => {
    const s = run(
      [
        turn(ctl({ probe_failed: true })),
        turn(ctl({ probe_failed: true, section_status: 'sufficient' }))
      ],
      toGrilling()
    ).state
    expect(s.current).toBe('business')
    expect(s.failedProbes).toBe(0)
    expect(s.hintAllowed).toBe(false)
  })

  it('ANSWER_FINAL in grilling persists then requests a grill turn', () => {
    expect(reduce(toGrilling(), answer).effects).toEqual([
      { type: 'PERSIST' },
      { type: 'REQUEST_LLM_TURN', kind: 'grill', section: 'retention', hintAllowed: false }
    ])
  })
})

describe('interrupts', () => {
  const tick = (answerId: string, elapsedMs: number): InterviewEvent => ({
    type: 'ANSWER_TICK',
    now: T0,
    answerId,
    elapsedMs
  })
  const interrupts = (effects: Effect[]): Effect[] =>
    effects.filter((e) => e.type === 'INTERRUPT_SUGGESTED')

  it('never interrupts the presentation', () => {
    const pres = run([
      { type: 'START', now: T0, config: { warmup: false } },
      { type: 'READY', now: T0 + 1 }
    ]).state
    expect(pres.phase).toBe('presentation')
    expect(interrupts(reduce(pres, tick('a1', 120_000)).effects)).toEqual([])
  })

  it('grilling interrupts once per answer past 90 s', () => {
    const g = toGrilling()
    expect(interrupts(reduce(g, tick('a1', 90_000)).effects)).toEqual([])
    const r = run([tick('a1', 90_001), tick('a1', 100_000), tick('a2', 95_000)], g)
    expect(interrupts(r.effects)).toEqual([
      { type: 'INTERRUPT_SUGGESTED', answerId: 'a1' },
      { type: 'INTERRUPT_SUGGESTED', answerId: 'a2' }
    ])
  })
})

describe('END_REQUESTED', () => {
  const end: InterviewEvent = { type: 'END_REQUESTED', now: T0 + 99 }
  const review = run([{ type: 'START', now: T0, config: { warmup: false } }]).state
  const presentation = reduce(review, { type: 'READY', now: T0 + 1 }).state
  const extraction = reduce(presentation, { type: 'PRESENTATION_DONE', now: T0 + 2 }).state
  const grilling = toGrilling()
  const wrapup = run(
    Array.from({ length: 35 }, () => turn(null)),
    grilling
  ).state
  const scoring = reduce(wrapup, { type: 'WRAPUP_DONE', now: T0 + 3 }).state
  const reviewMode = reduce(scoring, { type: 'SCORED', now: T0 + 4 }).state

  it.each([
    ['review', review],
    ['presentation', presentation],
    ['extraction', extraction],
    ['grilling', grilling],
    ['wrapup', wrapup]
  ] as const)('in %s ends early into scoring', (phase, s) => {
    expect(s.phase).toBe(phase)
    const r = reduce(s, end)
    expect(r.state.phase).toBe('scoring')
    expect(r.state.endedEarly).toBe(true)
    expect(r.effects).toContainEqual({ type: 'REQUEST_LLM_TURN', kind: 'score' })
  })

  it.each([
    ['idle', initialState()],
    ['scoring', scoring],
    ['reviewMode', reviewMode]
  ] as const)('in %s is ignored', (phase, s) => {
    expect(s.phase).toBe(phase)
    expect(reduce(s, end)).toEqual({ state: s, effects: [] })
  })
})

describe('persistability', () => {
  it('state survives a JSON round-trip after a full run', () => {
    const g = toGrilling(['valuation', 'retention'])
    const { state } = run(
      [
        turn(ctl({ probe_failed: true })),
        { type: 'ANSWER_TICK', now: T0, answerId: 'a1', elapsedMs: 100_000 },
        ...Array.from({ length: 40 }, () => turn(null)),
        { type: 'WRAPUP_DONE', now: T0 + 5 },
        { type: 'SCORED', now: T0 + 6 }
      ],
      g
    )
    expect(state.phase).toBe('reviewMode')
    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
  })

  it('reduce never mutates its input', () => {
    const deepFreeze = <T>(o: T): T => {
      Object.values(o as object).forEach((v) => v && typeof v === 'object' && deepFreeze(v))
      return Object.freeze(o)
    }
    const g = deepFreeze(structuredClone(toGrilling()))
    expect(() =>
      run(
        [
          turn(ctl({ probe_failed: true })),
          turn(ctl({ section_status: 'sufficient' })),
          { type: 'ANSWER_TICK', now: T0, answerId: 'a1', elapsedMs: 100_000 },
          { type: 'END_REQUESTED', now: T0 }
        ],
        g
      )
    ).not.toThrow()
    expect(g.phase).toBe('grilling')
    expect(g.done).toEqual([])
  })
})
