// SessionRunner: the effect executor between the pure reducer and the world (ports, store, view, speech).
// Interview logic lives in the reducer; this file only runs its effects. Never log transcript or utterance text.
// Latency stamps use the unscaled realNow clock, never clock.now() (the E2E clock is time-scaled).
import type { CaseCard, Intent, SpeakEvent, StartOptions, ViewState } from '../../shared/ipc'
import type { InterviewerBrief } from '../domain/cases/brief'
import {
  initialState,
  reduce,
  REVIEW_WARNING_MS,
  type Effect,
  type InterviewControl,
  type InterviewEvent
} from '../domain/machine/interviewMachine'
import { sttPrompt } from '../domain/cases/sttPrompt'
import { checkUtterance } from '../domain/text/leakGuard'
import { createSentenceSplitter } from '../domain/text/sentenceSplitter'
import { speakable } from '../domain/text/speakable'
import type { Logger } from '../log'
import { createTurnFilter, pickInterruptLine, SORRY_LINE } from '../agent/turnText'
import type { AwakePort, ClockPort, LlmChunk, LlmPort, LlmUsage, MakeLlm, SttPort } from '../ports'
import { createAnswerAssembler } from '../stt/answers'
import type { SessionStore } from '../store/sessionStore'
import type { PendingTurn, SessionFile } from '../store/sessionSchema'
import { buildTurnRequest } from './turnRequest'
import { toViewState } from './view'

export type RunnerDeps = {
  store: SessionStore
  clock: ClockPort
  stt: SttPort
  makeLlm: MakeLlm
  loadCase(id: string): { card: CaseCard; brief: InterviewerBrief }
  emitView(v: ViewState): void
  emitSpeak(s: SpeakEvent): void
  /** Session ids must match /^[A-Za-z0-9_-]{1,80}$/. */
  newId(prefix: 'session' | 'turn'): string
  /** An unacked sentence counts as spoken after this. Default 30 s. */
  ackTimeoutMs?: number
  /** Keeps the display awake for the life of a session. */
  awake?: AwakePort
  /** Tells the renderer to drop audio for a turn main aborted mid-speech. */
  emitCancel?(turnId: string): void
  /** Spoken at T-10 in review (headtts only); not part of the transcript. */
  reviewWarningLine?: string
  /** Spoken when warm-up hands over to the case (skip or timer), not on END; not part of the transcript. */
  warmupClosingLine?: string
  /** Unscaled clock for latency stamps (Pitfall 5). Default Date.now. */
  realNow?: () => number
  log: Logger
}

export interface SessionRunner {
  start(caseId: string, opts: StartOptions): Promise<{ sessionId: string }>
  resume(id: string): Promise<{ sessionId: string }>
  discard(id: string): void
  intent(i: Intent): Promise<void>
  ack(turnId: string, seq: number, spoken?: boolean): void
  /** Renderer started audio for this sentence (stamps firstAudioAt). */
  started(turnId: string, seq: number): void
  /** A ~20 s PCM chunk of the current answer; transcribed on arrival, not queued. */
  sttChunk(answerId: string, idx: number, pcm: Float32Array): void
  current(): ViewState | null
}

export const NO_ANSWER_LINE = "Didn't catch that — go ahead."
export const STT_FAILED_LINE = 'Sorry, transcription failed. Please repeat that.'

const TALK = ['warmup', 'presentation', 'grilling']
const DECK = ['review', 'presentation', 'extraction', 'grilling', 'wrapup']
const isAbort = (e: unknown): boolean => (e as Error)?.name === 'AbortError'

export function createSessionRunner(d: RunnerDeps): SessionRunner {
  const { store, clock } = d
  const ackTimeoutMs = d.ackTimeoutMs ?? 30_000
  let session: SessionFile | null = null
  let card: CaseCard
  let brief: InterviewerBrief
  let llm: LlmPort
  let inflight: AbortController | null = null
  let speaking = false
  let speakingTurn: string | null = null
  type TimerId = 'review' | 'warning' | 'warmup'
  const timers = new Map<TimerId, () => void>()
  let lastView: ViewState | null = null
  const acks = new Map<string, () => void>()
  let queue: Promise<unknown> = Promise.resolve()
  let pendingInterject: string | null = null
  let interjectCount = 0
  const realNow = d.realNow ?? Date.now
  let transcribing = false
  let prompt: string | undefined
  const answers = createAnswerAssembler({ stt: d.stt, prompt: () => prompt })
  type Latency = NonNullable<SessionFile['timings'][number]['latency']>
  let pendingLat: { stopAt: number; transcriptAt: number } | null = null
  let liveLat: { turnId: string; lat: Latency } | null = null
  /** The turn being spoken: what was written (index === seq) and which seqs were acked spoken. */
  let live: {
    turnId: string
    kind: string
    written: string[]
    spoken: Set<number>
    t0: number
    lat: Latency | null
  } | null = null

  /** Serialise every state change; a failed job never blocks the next one. */
  function enqueue<T>(job: () => T | Promise<T>): Promise<T> {
    const p = queue.then(job)
    queue = p.catch(() => undefined)
    return p
  }

  function pushView(): void {
    if (!session) return
    lastView = toViewState(session, card, brief, {
      clockNow: clock.now(),
      timeScale: clock.scale,
      speaking,
      transcribing
    })
    d.emitView(lastView)
  }

  function stopTimers(): void {
    for (const cancel of timers.values()) cancel()
    timers.clear()
  }

  function armTimer(id: TimerId, at: number): void {
    timers.get(id)?.()
    timers.set(
      id,
      clock.setTimer(at, () => {
        timers.delete(id)
        void enqueue(() =>
          dispatch(
            id === 'review'
              ? { type: 'REVIEW_DEADLINE', now: clock.now() }
              : id === 'warning'
                ? { type: 'REVIEW_WARNING', now: clock.now() }
                : { type: 'WARMUP_DONE', now: clock.now() }
          )
        )
      })
    )
  }

  function flushAcks(): void {
    for (const resolve of [...acks.values()]) resolve()
    acks.clear()
  }

  function abortInflight(): void {
    if (speakingTurn) d.emitCancel?.(speakingTurn)
    speakingTurn = null
    inflight?.abort()
    inflight = null
    flushAcks()
  }

  /** Proctoring line: no ack wait, no transcript entry. */
  function sayLine(line: string): void {
    d.emitSpeak({ turnId: d.newId('turn'), seq: 0, text: speakable(line) })
  }

  async function* fixedLine(text: string): AsyncGenerator<LlmChunk> {
    yield { type: 'text', delta: text }
    yield { type: 'done' }
  }

  function dispatch(event: InterviewEvent): void {
    const s = session
    if (!s) return
    const { state, effects } = reduce(s.machineState, event)
    s.machineState = state
    const later: (() => void)[] = []
    for (const e of effects) {
      switch (e.type) {
        case 'PHASE_CHANGED':
          if (e.from === 'review' || e.from === 'warmup') stopTimers()
          if (e.from === 'warmup' && e.to !== 'scoring' && d.warmupClosingLine)
            sayLine(d.warmupClosingLine)
          if (e.to === 'reviewMode') {
            s.status = 'completed'
            s.endedAt = clock.now()
            d.awake?.release()
          }
          if (e.to === 'warmup') later.push(() => void runLlm({ kind: 'warmup' }))
          break
        case 'START_TIMER':
          armTimer(e.id, e.deadline)
          break
        case 'REVIEW_WARNING':
          d.log.info('review warning')
          // Proctoring, not interview content: no ack wait, no transcript line.
          if (d.reviewWarningLine) sayLine(d.reviewWarningLine)
          break
        case 'REQUEST_LLM_TURN':
          later.push(() => void runLlm(e))
          break
        case 'PERSIST':
          store.save(s)
          break
        case 'INTERRUPT_SUGGESTED':
          pendingInterject = pickInterruptLine(interjectCount++)
          break
      }
    }
    pushView()
    // Fire-and-forget AFTER the dispatch; awaiting LLM work inside the queue would deadlock.
    for (const f of later) f()
  }

  const history = (s: SessionFile): { speaker: 'interviewer' | 'candidate'; text: string }[] =>
    s.transcript.map((t) => ({ speaker: t.speaker, text: t.text }))

  async function speakTurn(
    s: SessionFile,
    stream: AsyncIterable<LlmChunk>,
    kind: string,
    signal: AbortSignal
  ): Promise<{ control: InterviewControl | null; warmupComplete: boolean } | null> {
    const turnId = d.newId('turn')
    speakingTurn = turnId
    try {
      return await speakTurnInner(turnId, s, stream, kind, signal)
    } finally {
      if (speakingTurn === turnId) speakingTurn = null
    }
  }

  async function speakTurnInner(
    turnId: string,
    s: SessionFile,
    stream: AsyncIterable<LlmChunk>,
    kind: string,
    signal: AbortSignal
  ): Promise<{ control: InterviewControl | null; warmupComplete: boolean } | null> {
    const lat: Latency | null = pendingLat ? { ...pendingLat, requestAt: realNow() } : null
    pendingLat = null
    liveLat = lat ? { turnId, lat } : null
    speaking = true
    pushView()
    const t0 = clock.now()
    const splitter = createSentenceSplitter()
    let seq = 0
    let firstTextAt: number | undefined
    let firstSentenceAt: number | undefined
    let usage: LlmUsage | undefined
    const filter = createTurnFilter()
    let control: InterviewControl | null = null
    let warmupComplete = false
    const written: string[] = []
    live = { turnId, kind, written, spoken: new Set(), t0, lat }
    const waits: Promise<void>[] = []

    const emit = (sentence: string): void => {
      if (signal.aborted) return
      const f = filter.accept(sentence)
      if (!f.ok) {
        d.log.warn('utterance dropped', f.reason)
        return
      }
      const g = checkUtterance(sentence, brief)
      if (!g.ok) {
        d.log.warn('utterance blocked', g.reason)
        return
      }
      firstSentenceAt ??= clock.now()
      if (lat) lat.firstSentenceAt ??= realNow()
      written.push(sentence)
      const n = seq++
      const key = `${turnId}:${n}`
      waits.push(
        new Promise<void>((resolve) => {
          const timer = setTimeout(done, ackTimeoutMs)
          function done(): void {
            clearTimeout(timer)
            acks.delete(key)
            resolve()
          }
          acks.set(key, done)
        })
      )
      d.emitSpeak({ turnId, seq: n, text: speakable(sentence) })
    }

    for await (const c of stream) {
      if (signal.aborted) break
      if (c.type === 'text') {
        firstTextAt ??= clock.now()
        if (lat) lat.firstDeltaAt ??= realNow()
        splitter.push(c.delta).forEach(emit)
      } else if (c.type === 'control') control = c.payload
      else {
        warmupComplete = c.warmupComplete === true
        usage = c.usage
      }
    }
    if (!signal.aborted) {
      splitter.flush().forEach(emit)
      await Promise.all(waits)
    }
    if (live?.turnId === turnId) live = null
    if (signal.aborted) {
      // A barge-in may already have started a newer turn; leave its state alone.
      if (inflight === null && live === null) {
        speaking = false
        pushView()
      }
      return null
    }
    const m = s.machineState
    const at = clock.now()
    if (written.length)
      s.transcript.push({
        id: turnId,
        speaker: 'interviewer',
        phase: m.phase,
        ...(m.current ? { section: m.current } : {}),
        text: written.join(' '),
        at
      })
    s.timings.push({
      turnId,
      kind,
      startedAt: t0,
      ...(firstTextAt ? { firstTextAt } : {}),
      ...(firstSentenceAt ? { firstSentenceAt } : {}),
      doneAt: at,
      ...(usage ? { usage } : {}),
      ...(lat ? { latency: lat } : {})
    })
    if (liveLat?.turnId === turnId) liveLat = null
    if (lat)
      d.log.info(
        'latency',
        kind,
        (lat.firstAudioAt ?? NaN) - lat.stopAt,
        lat.transcriptAt - lat.stopAt
      )
    if (usage) d.log.info('llm usage', kind, usage.cacheRead, usage.outputTokens, usage.stopReason)
    if (control) s.controlLog.push({ at, turnId, control })
    store.save(s)
    return { control, warmupComplete }
  }

  async function runLlm(
    need: PendingTurn | Extract<Effect, { type: 'REQUEST_LLM_TURN' }>,
    attempt = 0
  ): Promise<void> {
    const s = session
    if (!s) return
    const pending: PendingTurn = {
      kind: need.kind,
      ...(need.section ? { section: need.section } : {}),
      ...(need.hintAllowed !== undefined ? { hintAllowed: need.hintAllowed } : {})
    }
    s.pending = pending
    store.save(s)
    const ac = new AbortController()
    inflight = ac
    const { signal } = ac
    let next: InterviewEvent | null = null
    try {
      const now = (): number => clock.now()
      switch (pending.kind) {
        case 'warmup': {
          const r = await speakTurn(
            s,
            llm.warmupTurn({ history: history(s) }, signal),
            'warmup',
            signal
          )
          if (!r) return
          if (r.warmupComplete) next = { type: 'WARMUP_DONE', now: now() }
          break
        }
        case 'extraction': {
          const opening =
            s.transcript.find((t) => t.speaker === 'candidate' && t.phase === 'presentation')
              ?.text ?? ''
          const r = await llm.extractPlan(opening, signal)
          if (signal.aborted) return
          if (r.plan) s.openingPlan = r.plan
          next = { type: 'SECTION_PLAN_SET', now: now(), order: r.order }
          break
        }
        case 'grill':
        case 'wrapup': {
          if (pending.kind === 'grill' && pendingInterject) {
            const line = pendingInterject
            pendingInterject = null
            if (!(await speakTurn(s, fixedLine(line), 'interject', signal))) return
          }
          const stream = llm.streamTurn(
            buildTurnRequest(s, { ...pending, kind: pending.kind }, now()),
            signal
          )
          const r = await speakTurn(s, stream, pending.kind, signal)
          if (!r) return
          if (r.control?.hint_given && !s.machineState.hintAllowed)
            d.log.warn('hint without permission')
          next =
            pending.kind === 'grill'
              ? { type: 'AGENT_TURN_DONE', now: now(), control: r.control }
              : { type: 'WRAPUP_DONE', now: now() }
          break
        }
        case 'score': {
          const card = await llm.scoreSession(
            {
              transcript: s.transcript,
              controlLog: s.controlLog,
              endedEarly: s.machineState.endedEarly,
              omitted: s.machineState.omitted
            },
            signal
          )
          if (signal.aborted) return
          s.scorecard = card
          next = { type: 'SCORED', now: now() }
          break
        }
      }
    } catch (e) {
      if (signal.aborted || isAbort(e)) return
      // ponytail: one silent retry; a visible retry control if failures prove common
      if (attempt > 0) d.log.error('llm turn failed', pending.kind)
      await enqueue(() => {
        if (inflight === ac) inflight = null
        if (session !== s) return
        speaking = false
        if (attempt === 0) {
          sayLine(SORRY_LINE)
          pushView()
          void runLlm(need, 1)
        } else if (pending.kind === 'extraction') {
          // Default section order so the session never sticks in extraction.
          s.pending = null
          store.save(s)
          dispatch({ type: 'SECTION_PLAN_SET', now: clock.now(), order: [] })
        } else pushView()
      })
      return
    }
    // Finish inside the queue so no intent can slip between the turn and its event.
    await enqueue(() => {
      if (inflight === ac) inflight = null
      if (session !== s || signal.aborted) return
      speaking = false
      s.pending = null
      store.save(s)
      if (next) dispatch(next)
      else pushView()
    })
  }

  async function onIntent(i: Intent): Promise<void> {
    const s = session
    if (!s) return
    const phase = s.machineState.phase
    const now = clock.now()
    switch (i.type) {
      case 'answer': {
        if (speaking || inflight || !TALK.includes(phase)) return
        const stopAt = realNow()
        transcribing = true
        pushView()
        let r: { text: string; noAnswer: boolean }
        try {
          r = await answers.finish(i.answerId, i.chunks ?? 0)
        } catch (e) {
          transcribing = false
          if (session !== s) return
          d.log.warn('stt failed', (e as Error)?.name ?? 'error')
          sayLine(STT_FAILED_LINE)
          pushView()
          return
        }
        transcribing = false
        if (session !== s) return
        if (r.noAnswer) {
          sayLine(NO_ANSWER_LINE)
          pushView()
          return
        }
        pendingLat = { stopAt, transcriptAt: realNow() }
        const text = r.text
        const m = s.machineState
        const turn = {
          id: d.newId('turn'),
          speaker: 'candidate' as const,
          phase,
          ...(m.current ? { section: m.current } : {}),
          text,
          at: clock.now(),
          ms: i.ms
        }
        s.transcript.push(turn)
        store.save(s)
        pushView()
        if (phase === 'warmup') void runLlm({ kind: 'warmup' })
        else if (phase === 'presentation') dispatch({ type: 'PRESENTATION_DONE', now: clock.now() })
        else {
          dispatch({ type: 'ANSWER_TICK', now: clock.now(), answerId: turn.id, elapsedMs: i.ms })
          dispatch({ type: 'ANSWER_FINAL', now: clock.now(), answerId: turn.id, text, ms: i.ms })
        }
        return
      }
      case 'bargeIn': {
        if (!speaking || !live || !TALK.includes(phase)) return
        const L = live
        live = null
        const said = L.written.filter((_, n) => L.spoken.has(n))
        abortInflight()
        speaking = false
        const at = clock.now()
        const m = s.machineState
        if (said.length)
          s.transcript.push({
            id: L.turnId,
            speaker: 'interviewer',
            phase,
            ...(m.current ? { section: m.current } : {}),
            text: said.join(' '),
            at
          })
        s.timings.push({
          turnId: L.turnId,
          kind: L.kind,
          startedAt: L.t0,
          doneAt: at,
          interrupted: true,
          ...(L.lat ? { latency: L.lat } : {})
        })
        if (liveLat?.turnId === L.turnId) liveLat = null
        if (L.kind === 'grill' || L.kind === 'warmup') llm.interrupted?.(said.join(' '))
        d.log.info('barge-in', L.kind, said.length)
        s.pending = null
        store.save(s)
        if (phase === 'grilling' && L.kind === 'grill')
          dispatch({ type: 'AGENT_TURN_DONE', now: at, control: null })
        else pushView()
        return
      }
      case 'ready':
        return dispatch({ type: 'READY', now })
      case 'skipWarmup':
        if (phase !== 'warmup') return
        abortInflight()
        speaking = false
        return dispatch({ type: 'WARMUP_SKIPPED', now })
      case 'end':
        if (phase === 'idle' || phase === 'scoring' || phase === 'reviewMode') return
        abortInflight()
        speaking = false
        return dispatch({ type: 'END_REQUESTED', now })
      case 'deckPage':
        // Not gated on speaking: looking at the deck is always fine.
        if (!DECK.includes(phase) || i.page === s.deckPage) return
        s.deckPage = i.page
        store.save(s)
        return pushView()
    }
  }

  function bind(caseId: string): void {
    ;({ card, brief } = d.loadCase(caseId))
    llm = d.makeLlm(brief) // a fresh interviewer per session (INT-08)
    pendingInterject = null
    interjectCount = 0
    prompt = sttPrompt(brief)
    answers.reset()
    transcribing = false
    pendingLat = null
    liveLat = null
    live = null
  }

  async function start(caseId: string, opts: StartOptions): Promise<{ sessionId: string }> {
    return enqueue(() => {
      abortInflight()
      stopTimers()
      speaking = false
      const now = clock.now()
      for (const old of store.list())
        if (old.status === 'active') store.save({ ...old, status: 'abandoned', endedAt: now })
      bind(caseId)
      const s: SessionFile = {
        schemaVersion: 1,
        id: d.newId('session'),
        caseId,
        startedAt: now,
        status: 'active',
        warmup: opts.warmup,
        machineState: initialState(),
        transcript: [],
        controlLog: [],
        timings: [],
        pending: null
      }
      store.save(s)
      session = s
      d.awake?.hold()
      dispatch({ type: 'START', now, config: { warmup: opts.warmup } })
      return { sessionId: s.id }
    })
  }

  /** Rehydrate from disk; an in-flight (pending) or implied turn is re-requested, never lost. */
  function resume(id: string): { sessionId: string } {
    const s = store.load(id)
    if (!s || s.status !== 'active') throw new Error('session not resumable')
    abortInflight()
    stopTimers()
    speaking = false
    bind(s.caseId)
    session = s
    d.awake?.hold()
    const m = s.machineState
    const last = s.transcript.at(-1)
    const lastCandidate = last?.speaker === 'candidate' ? last.phase : null
    const derived: PendingTurn | null =
      lastCandidate === 'grilling' && m.phase === 'grilling'
        ? {
            kind: 'grill',
            ...(m.current ? { section: m.current } : {}),
            hintAllowed: m.hintAllowed
          }
        : (lastCandidate === 'warmup' || s.transcript.length === 0) && m.phase === 'warmup'
          ? { kind: 'warmup' }
          : null
    const need = s.pending ?? derived
    if (m.phase === 'warmup' && m.warmupDeadline !== null) {
      if (clock.now() >= m.warmupDeadline) {
        dispatch({ type: 'WARMUP_DONE', now: clock.now() })
        return { sessionId: id }
      }
      armTimer('warmup', m.warmupDeadline)
    }
    if (m.phase === 'review' && m.reviewDeadline !== null) {
      if (clock.now() >= m.reviewDeadline) {
        dispatch({ type: 'REVIEW_DEADLINE', now: clock.now() })
        return { sessionId: id }
      }
      armTimer('review', m.reviewDeadline)
      if (!m.reviewWarned && m.config.reviewMs > REVIEW_WARNING_MS) {
        const warnAt = m.reviewDeadline - REVIEW_WARNING_MS
        if (clock.now() >= warnAt) dispatch({ type: 'REVIEW_WARNING', now: clock.now() })
        else armTimer('warning', warnAt)
      }
    }
    pushView()
    if (need) void runLlm(need)
    return { sessionId: id }
  }

  return {
    start,
    resume: (id) => enqueue(() => resume(id)),
    discard(id) {
      if (session?.id === id) {
        abortInflight()
        stopTimers()
        speaking = false
        session = null
        lastView = null
        d.awake?.release()
      }
      const s = store.load(id)
      if (s?.status === 'active') store.save({ ...s, status: 'abandoned', endedAt: clock.now() })
    },
    intent: (i) => enqueue(() => onIntent(i)),
    ack(turnId, seq, spoken) {
      if (spoken !== false && live?.turnId === turnId) live.spoken.add(seq)
      acks.get(`${turnId}:${seq}`)?.()
    },
    started(turnId) {
      if (liveLat?.turnId === turnId) liveLat.lat.firstAudioAt ??= realNow()
    },
    sttChunk(answerId, idx, pcm) {
      if (session) answers.chunk(answerId, idx, pcm)
    },
    current: () => lastView
  }
}
