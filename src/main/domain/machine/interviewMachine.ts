import { mergePlan, turnCaps, type SectionId } from './sections'

export type Phase =
  | 'idle'
  | 'warmup'
  | 'review'
  | 'presentation'
  | 'extraction'
  | 'grilling'
  | 'wrapup'
  | 'scoring'
  | 'reviewMode'

export type MachineConfig = {
  warmup: boolean
  warmupPosition: 'before' | 'after'
  budgetMin: number
  reviewMs: number
}

export const DEFAULT_CONFIG: MachineConfig = {
  warmup: true,
  warmupPosition: 'before',
  budgetMin: 25,
  reviewMs: 45 * 60_000
}

/** The partner warns once, this long before the review deadline. */
export const REVIEW_WARNING_MS = 10 * 60_000

/** Minimal control block the interviewer emits each turn. Phase 6's zod schema must conform. */
export type InterviewControl = {
  section: SectionId
  section_status: 'continue' | 'sufficient'
  next_section?: SectionId
  probe_failed?: boolean
  hint_given?: boolean
  flags_surfaced?: string[]
  /** Subset of flags_surfaced the candidate only got via a hint. */
  flags_hinted?: string[]
  /** <= ~15 words of the candidate's own words. */
  evidence?: string
  numbers_checked?: { claim: string; correct: boolean }[]
  pushback_done?: boolean
}

/** Warm-up auto-ends after this long (FLOW-02). */
export const WARMUP_MS = 10 * 60_000
/** Where the one mandatory "convince me" pushback goes by default (INT-05). */
export const PUSHBACK_SECTION: SectionId = 'valuation'

/** Every event carries `now` (ms epoch): timers are data, the reducer never reads the clock. */
export type InterviewEvent =
  | { type: 'START'; now: number; config?: Partial<MachineConfig> }
  | { type: 'WARMUP_DONE'; now: number }
  | { type: 'WARMUP_SKIPPED'; now: number }
  | { type: 'READY'; now: number }
  | { type: 'REVIEW_DEADLINE'; now: number }
  | { type: 'REVIEW_WARNING'; now: number }
  | { type: 'PRESENTATION_DONE'; now: number }
  | { type: 'SECTION_PLAN_SET'; now: number; order: string[] }
  | { type: 'ANSWER_TICK'; now: number; answerId: string; elapsedMs: number }
  | { type: 'ANSWER_FINAL'; now: number; answerId: string; text: string; ms: number }
  | { type: 'AGENT_TURN_DONE'; now: number; control: InterviewControl | null }
  | { type: 'WRAPUP_DONE'; now: number }
  | { type: 'END_REQUESTED'; now: number }
  | { type: 'SCORED'; now: number }

export type Effect =
  | { type: 'PHASE_CHANGED'; from: Phase; to: Phase; at: number }
  | { type: 'START_TIMER'; id: 'review' | 'warning' | 'warmup'; deadline: number }
  | { type: 'REVIEW_WARNING'; at: number }
  | {
      type: 'REQUEST_LLM_TURN'
      kind: 'extraction' | 'grill' | 'wrapup' | 'score'
      section?: SectionId
      hintAllowed?: boolean
    }
  | { type: 'INTERRUPT_SUGGESTED'; answerId: string }
  | { type: 'PERSIST' }

/** Plain JSON only (arrays, no Set/Map) so Phase 3 can persist it verbatim. */
export type InterviewState = {
  phase: Phase
  config: MachineConfig
  startedAt: number | null
  reviewDeadline: number | null
  reviewWarned: boolean
  plan: SectionId[]
  omitted: SectionId[]
  done: SectionId[]
  current: SectionId | null
  caps: { soft: number; hard: number } | null
  turnsInSection: number
  failedProbes: number
  hintAllowed: boolean
  interruptedAnswerId: string | null
  endedEarly: boolean
  pushbackDone: boolean
  grillStartedAt: number | null
  warmupDeadline: number | null
}

type Result = { state: InterviewState; effects: Effect[] }

const INTERRUPT_AFTER_MS = 90_000

export function initialState(): InterviewState {
  return {
    phase: 'idle',
    config: { ...DEFAULT_CONFIG },
    startedAt: null,
    reviewDeadline: null,
    reviewWarned: false,
    plan: [],
    omitted: [],
    done: [],
    current: null,
    caps: null,
    turnsInSection: 0,
    failedProbes: 0,
    hintAllowed: false,
    interruptedAnswerId: null,
    endedEarly: false,
    pushbackDone: false,
    grillStartedAt: null,
    warmupDeadline: null
  }
}

/** Exactly one "convince me" per session: owed from valuation turn 1, or anywhere in call as the fallback. */
export function pushbackStatus(s: InterviewState): 'not_yet' | 'now' | 'done' {
  if (s.pushbackDone) return 'done'
  if (s.phase !== 'grilling') return 'not_yet'
  if (s.current === PUSHBACK_SECTION && s.turnsInSection >= 1) return 'now'
  return s.current === 'call' ? 'now' : 'not_yet'
}

const ignore = (state: InterviewState): Result => ({ state, effects: [] })

function go(
  state: InterviewState,
  to: Phase,
  now: number,
  patch: Partial<InterviewState> = {},
  extra: Effect[] = []
): Result {
  return {
    state: { ...state, ...patch, phase: to },
    effects: [
      { type: 'PHASE_CHANGED', from: state.phase, to, at: now },
      { type: 'PERSIST' },
      ...extra
    ]
  }
}

function toReview(state: InterviewState, now: number): Result {
  const deadline = now + state.config.reviewMs
  const timers: Effect[] = [{ type: 'START_TIMER', id: 'review', deadline }]
  if (state.config.reviewMs > REVIEW_WARNING_MS)
    timers.push({ type: 'START_TIMER', id: 'warning', deadline: deadline - REVIEW_WARNING_MS })
  return go(state, 'review', now, { reviewDeadline: deadline, reviewWarned: false }, timers)
}

function toWarmup(state: InterviewState, now: number): Result {
  const deadline = now + WARMUP_MS
  return go(state, 'warmup', now, { warmupDeadline: deadline }, [
    { type: 'START_TIMER', id: 'warmup', deadline }
  ])
}

/** Leaving review: warm-up first if it was deferred to 'after', else the presentation. */
function afterReview(state: InterviewState, now: number): Result {
  const { warmup, warmupPosition } = state.config
  return warmup && warmupPosition === 'after'
    ? toWarmup(state, now)
    : go(state, 'presentation', now)
}

const grillRequest = (state: InterviewState): Effect => ({
  type: 'REQUEST_LLM_TURN',
  kind: 'grill',
  section: state.current ?? undefined,
  hintAllowed: state.hintAllowed
})

function agentTurn(state: InterviewState, now: number, control: InterviewControl | null): Result {
  const turns = state.turnsInSection + 1
  const failedProbes = state.failedProbes + (control?.probe_failed ? 1 : 0)
  const hard = state.caps?.hard ?? Infinity
  const pushbackDone = state.pushbackDone || control?.pushback_done === true
  const owed = pushbackStatus(state) === 'now' && control?.pushback_done !== true
  const sufficient = control?.section_status === 'sufficient' && turns > 1 && !owed

  if (turns < hard && !sufficient) {
    return {
      state: {
        ...state,
        turnsInSection: turns,
        failedProbes,
        hintAllowed: failedProbes >= 2,
        pushbackDone
      },
      effects: [{ type: 'PERSIST' }]
    }
  }

  const done = state.current ? [...state.done, state.current] : state.done
  const remaining = state.plan.filter((s) => !done.includes(s))
  const reset = { done, turnsInSection: 0, failedProbes: 0, hintAllowed: false, pushbackDone }
  if (remaining.length === 0) {
    return go(state, 'wrapup', now, { ...reset, current: null }, [
      { type: 'REQUEST_LLM_TURN', kind: 'wrapup' }
    ])
  }
  const want = sufficient ? control?.next_section : undefined
  const wantOk =
    want !== undefined && remaining.includes(want) && (want !== 'call' || remaining.length === 1)
  return {
    state: { ...state, ...reset, current: wantOk ? want : remaining[0] },
    effects: [{ type: 'PERSIST' }]
  }
}

const ENDABLE: readonly Phase[] = [
  'warmup',
  'review',
  'presentation',
  'extraction',
  'grilling',
  'wrapup'
]

export function reduce(state: InterviewState, event: InterviewEvent): Result {
  const { now } = event

  if (event.type === 'END_REQUESTED') {
    return ENDABLE.includes(state.phase)
      ? go(state, 'scoring', now, { endedEarly: true }, [
          { type: 'REQUEST_LLM_TURN', kind: 'score' }
        ])
      : ignore(state)
  }

  switch (state.phase) {
    case 'idle': {
      if (event.type !== 'START') return ignore(state)
      const started = { ...state, config: { ...DEFAULT_CONFIG, ...event.config }, startedAt: now }
      return started.config.warmup && started.config.warmupPosition === 'before'
        ? toWarmup(started, now)
        : toReview(started, now)
    }
    case 'warmup':
      if (event.type !== 'WARMUP_DONE' && event.type !== 'WARMUP_SKIPPED') return ignore(state)
      return state.reviewDeadline === null ? toReview(state, now) : go(state, 'presentation', now)
    case 'review':
      if (event.type === 'READY') return afterReview(state, now)
      if (
        event.type === 'REVIEW_DEADLINE' &&
        state.reviewDeadline !== null &&
        now >= state.reviewDeadline
      )
        return afterReview(state, now)
      if (
        event.type === 'REVIEW_WARNING' &&
        !state.reviewWarned &&
        state.reviewDeadline !== null &&
        now >= state.reviewDeadline - REVIEW_WARNING_MS &&
        now < state.reviewDeadline
      )
        return {
          state: { ...state, reviewWarned: true },
          effects: [{ type: 'REVIEW_WARNING', at: now }, { type: 'PERSIST' }]
        }
      return ignore(state)
    case 'presentation':
      if (event.type !== 'PRESENTATION_DONE') return ignore(state)
      return go(state, 'extraction', now, {}, [{ type: 'REQUEST_LLM_TURN', kind: 'extraction' }])
    case 'extraction': {
      if (event.type !== 'SECTION_PLAN_SET') return ignore(state)
      const { plan, omitted } = mergePlan(event.order)
      const next = {
        ...state,
        plan,
        omitted,
        done: [],
        current: plan[0],
        caps: turnCaps(state.config.budgetMin, plan.length),
        turnsInSection: 0,
        failedProbes: 0,
        hintAllowed: false,
        grillStartedAt: now
      }
      return go(state, 'grilling', now, next, [grillRequest(next)])
    }
    case 'grilling':
      if (event.type === 'AGENT_TURN_DONE') return agentTurn(state, now, event.control)
      if (event.type === 'ANSWER_FINAL')
        return { state, effects: [{ type: 'PERSIST' }, grillRequest(state)] }
      if (
        event.type === 'ANSWER_TICK' &&
        event.elapsedMs > INTERRUPT_AFTER_MS &&
        state.interruptedAnswerId !== event.answerId
      ) {
        return {
          state: { ...state, interruptedAnswerId: event.answerId },
          effects: [{ type: 'INTERRUPT_SUGGESTED', answerId: event.answerId }]
        }
      }
      return ignore(state)
    case 'wrapup':
      if (event.type !== 'WRAPUP_DONE') return ignore(state)
      return go(state, 'scoring', now, {}, [{ type: 'REQUEST_LLM_TURN', kind: 'score' }])
    case 'scoring':
      return event.type === 'SCORED' ? go(state, 'reviewMode', now) : ignore(state)
    case 'reviewMode':
      return ignore(state)
  }
}
