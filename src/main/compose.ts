// The only module that constructs adapters or reads config env (only its `env` argument,
// never the global). Real adapters swap in here: the Claude interviewer (per session, from the
// stored key), STT Phase 7 (TTS lives in the renderer).
import { randomUUID } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  CH,
  type LibraryView,
  type SttMode,
  type SttStatus,
  type TrendsView,
  type TtsMode
} from '../shared/ipc'
import { LibraryViewSchema, SpeakCancelSchema, SpeakEventSchema } from '../shared/schemas'
import { createScaledClock } from './adapters/clock'
import { createFakeLlm } from './adapters/fakeLlm'
import { createFakeStt } from './adapters/fakeStt'
import { createClaudeLlm, DEFAULT_INTERVIEWER_MODEL } from './agent/claudeLlm'
import { WARMUP_CLOSING_LINE } from './agent/turnText'
import { readDeckText } from './domain/cases/deckSource'
import { casePdfResolver, DEFAULT_LIBRARY_ROOT, listCases, loadCase } from './domain/cases/library'
import type { Logger } from './log'
import { createReviewer, DEFAULT_REVIEWER_MODEL } from './review/grader'
import { createFakeTrendsAgent, createTrendsAgent, createTrendsService } from './review/trends'
import type { AwakePort, ClockPort, MakeLlm, SttPort } from './ports'
import { createSessionRunner, type SessionRunner } from './session/runner'
import { createSessionStore } from './store/sessionStore'
import { filteredStt } from './stt/filtered'
import { createWhisperStt, MODEL_FILES, type ChildLike, type SttModel } from './stt/whisperStt'

type Env = Record<string, string | undefined>
export type AppConfig = {
  adapters: 'fake'
  casesRoot: string
  sessionsDir: string
  timeScale: number
  e2e: boolean
  tts: TtsMode
  llm: 'fake' | 'claude' | 'auto'
  interviewerModel: string
  reviewer: 'fake' | 'claude' | 'auto'
  reviewerModel: string
  stt: SttMode
  sttModel: SttModel
}

export const REVIEW_WARNING_LINE = 'Ten minutes left.'

export function readConfig(env: Env, userData: string): AppConfig {
  const unavailable = (name: string, v: string): Error =>
    new Error(`adapter not available in this build: ${name}=${v}`)
  for (const name of ['ADAPTERS']) {
    const v = env[name]
    if (v !== undefined && v !== 'fake') throw unavailable(name, v)
  }
  const e2e = env.E2E === '1'
  // Outside E2E the real interviewer runs whenever a key exists; E2E stays fake unless LLM=claude.
  const llm = env.LLM ?? (e2e ? 'fake' : 'auto')
  if (llm !== 'fake' && llm !== 'claude' && llm !== 'auto') throw unavailable('LLM', llm)
  const reviewer = env.REVIEWER ?? (e2e ? 'fake' : 'auto')
  if (reviewer !== 'fake' && reviewer !== 'claude' && reviewer !== 'auto')
    throw unavailable('REVIEWER', reviewer)
  // TTS runs in the renderer (HeadTTS); main only needs the mode. E2E defaults to the fake queue.
  const tts = env.TTS ?? (e2e ? 'fake' : 'headtts')
  if (tts !== 'headtts' && tts !== 'fake') throw unavailable('TTS', tts)
  // Real whisper unless E2E, which keeps FakeStt (T1) unless STT is set explicitly.
  const stt = env.STT ?? (e2e ? 'fake' : 'whisper')
  if (stt !== 'whisper' && stt !== 'fake') throw unavailable('STT', stt)
  const sttModel = env.STT_MODEL ?? 'turbo'
  if (!Object.hasOwn(MODEL_FILES, sttModel)) throw unavailable('STT_MODEL', sttModel)
  const scale = Number(env.E2E_TIME_SCALE)
  return {
    adapters: 'fake',
    casesRoot: env.CASES_ROOT || DEFAULT_LIBRARY_ROOT,
    sessionsDir: env.SESSIONS_DIR || join(userData, 'sessions'),
    timeScale: e2e && scale > 0 ? scale : 1,
    e2e,
    tts,
    llm,
    interviewerModel: env.INTERVIEWER_MODEL?.trim() || DEFAULT_INTERVIEWER_MODEL,
    reviewer,
    reviewerModel: env.REVIEWER_MODEL?.trim() || DEFAULT_REVIEWER_MODEL,
    stt,
    sttModel: sttModel as SttModel
  }
}

export function compose(
  env: Env,
  o: {
    userData: string
    log: Logger
    send(channel: string, payload: unknown): void
    awake?: AwakePort
    /** Main-only key getter, read at each session start. The key is never logged. */
    getKey?: () => string | null
    /** Forks the STT utilityProcess (index.ts); absent in unit tests means whisper is 'failed'. */
    forkStt?: () => ChildLike
    sttModelsDir?: string
    /** Test seam: a manual clock instead of the (E2E-scaled) wall clock. */
    clock?: ClockPort
  }
): {
  config: AppConfig
  runner: SessionRunner
  library(): LibraryView
  casePdf(id: string): string | null
  e2eSay?: (text: string) => void
  sttStatus(): Promise<SttStatus>
  disposeStt?: () => void
  trends(): Promise<TrendsView>
} {
  const config = readConfig(env, o.userData)
  const clock = o.clock ?? createScaledClock({ scale: config.timeScale })
  const store = createSessionStore({ root: config.sessionsDir, now: clock.now, log: o.log })
  o.log.info('stt', config.stt, config.sttModel)
  let stt: SttPort
  let fakeStt: ReturnType<typeof createFakeStt> | undefined
  let sttStatus: () => Promise<SttStatus> = async () => 'off'
  let disposeStt: (() => void) | undefined
  if (config.stt === 'fake') {
    fakeStt = createFakeStt()
    stt = fakeStt
  } else {
    const model = join(o.sttModelsDir ?? '', MODEL_FILES[config.sttModel])
    if (!o.forkStt || !existsSync(model)) {
      // No path in the log: it could name the user's home dir.
      o.log.error(
        o.forkStt ? 'whisper model missing; run npm run fetch:voice' : 'stt worker unavailable'
      )
      stt = { transcribe: () => Promise.reject(new Error('stt unavailable')) }
      sttStatus = async () => 'failed'
    } else {
      const w = createWhisperStt({ fork: o.forkStt, model, log: o.log })
      void w.warm()
      stt = filteredStt(w, { log: o.log }) // gate + cleaner wrap the real adapter only
      sttStatus = () => w.status()
      disposeStt = () => w.dispose()
    }
  }
  o.log.info('interviewer', config.llm, config.interviewerModel)
  o.log.info('reviewer', config.reviewer, config.reviewerModel)
  const anthropic = (key: string, { timeout }: { timeout: number }): Anthropic =>
    new Anthropic({
      apiKey: key,
      maxRetries: 1,
      timeout,
      ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {})
    })
  // Effort 'high' grading can run well past the interviewer's 30 s budget.
  const reviewerClient = (key: string): Anthropic => anthropic(key, { timeout: 180_000 })
  const reviewerKey = (): string | null =>
    config.reviewer === 'fake' ? null : (o.getKey?.() ?? null)
  const fake = createFakeLlm()
  const makeLlm: MakeLlm = (brief) => {
    const key = o.getKey?.() ?? null
    let port
    if (config.llm === 'fake' || !key) {
      if (config.llm !== 'fake') o.log.warn('no API key; using fake interviewer')
      port = fake(brief)
    } else {
      port = createClaudeLlm({
        client: anthropic(key, { timeout: 30_000 }),
        model: config.interviewerModel,
        log: o.log
      })(brief)
    }
    const rk = reviewerKey()
    if (!rk) return port
    const scoreSession = createReviewer({
      client: reviewerClient(rk),
      model: config.reviewerModel,
      log: o.log
    })(brief)
    return { ...port, scoreSession }
  }
  const trends = createTrendsService({
    listSummaries: () => store.listSummaries(),
    cases: () => {
      try {
        return listCases(config.casesRoot).map(({ id, vertical, level }) => ({
          id,
          vertical,
          level
        }))
      } catch {
        return []
      }
    },
    agent: () => {
      const key = reviewerKey()
      return key
        ? createTrendsAgent({ client: reviewerClient(key), model: config.reviewerModel, log: o.log })
        : createFakeTrendsAgent()
    },
    file: join(config.sessionsDir, 'trends.json'),
    log: o.log
  })
  const runner = createSessionRunner({
    store,
    clock,
    stt,
    makeLlm,
    loadCase: (id) => loadCase(config.casesRoot, id, readDeckText(config.casesRoot, id)),
    emitView: (v) => o.send(CH.view, v), // toViewState already parsed it
    emitSpeak: (s) => o.send(CH.speak, SpeakEventSchema.parse(s)),
    emitCancel: (t) => o.send(CH.speakCancel, SpeakCancelSchema.parse({ turnId: t })),
    warmupClosingLine: config.llm !== 'fake' ? WARMUP_CLOSING_LINE : undefined,
    reviewWarningLine: config.tts === 'headtts' ? REVIEW_WARNING_LINE : undefined,
    newId: (p) =>
      `${p === 'session' ? 's' : 't'}_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`,
    awake: o.awake,
    onScored: () =>
      void trends.refresh().catch(() => o.log.warn('trends refresh failed')),
    log: o.log
  })
  const library = (): LibraryView => {
    try {
      return store.libraryView(listCases(config.casesRoot))
    } catch {
      o.log.warn('case library unavailable') // no path: it could name the user's home dir
      return LibraryViewSchema.parse({
        cases: [],
        resumable: null,
        quarantined: store.takeQuarantined(),
        error: 'Case library not found. Set CASES_ROOT.'
      })
    }
  }
  return {
    config,
    runner,
    library,
    casePdf: casePdfResolver(config.casesRoot),
    // Text injection only exists with FakeStt.
    e2eSay: config.e2e && fakeStt ? (t) => fakeStt.inject(t) : undefined,
    sttStatus,
    disposeStt,
    trends: trends.get
  }
}
