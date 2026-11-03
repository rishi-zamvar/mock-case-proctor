// The only module that constructs adapters or reads config env (only its `env` argument,
// never the global). Real adapters swap in here: the Claude interviewer (per session, from the
// stored key), STT Phase 7 (TTS lives in the renderer).
import { randomUUID } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { join } from 'node:path'
import { CH, type LibraryView, type TtsMode } from '../shared/ipc'
import { LibraryViewSchema, SpeakCancelSchema, SpeakEventSchema } from '../shared/schemas'
import { createScaledClock } from './adapters/clock'
import { createFakeLlm } from './adapters/fakeLlm'
import { createFakeStt } from './adapters/fakeStt'
import { createClaudeLlm, DEFAULT_INTERVIEWER_MODEL } from './agent/claudeLlm'
import { WARMUP_CLOSING_LINE } from './agent/turnText'
import { readDeckText } from './domain/cases/deckSource'
import { casePdfResolver, DEFAULT_LIBRARY_ROOT, listCases, loadCase } from './domain/cases/library'
import type { Logger } from './log'
import type { AwakePort, MakeLlm } from './ports'
import { createSessionRunner, type SessionRunner } from './session/runner'
import { createSessionStore } from './store/sessionStore'

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
}

export const REVIEW_WARNING_LINE = 'Ten minutes left.'

export function readConfig(env: Env, userData: string): AppConfig {
  const unavailable = (name: string, v: string): Error =>
    new Error(`adapter not available in this build: ${name}=${v}`)
  for (const name of ['ADAPTERS', 'STT']) {
    const v = env[name]
    if (v !== undefined && v !== 'fake') throw unavailable(name, v)
  }
  const e2e = env.E2E === '1'
  // Outside E2E the real interviewer runs whenever a key exists; E2E stays fake unless LLM=claude.
  const llm = env.LLM ?? (e2e ? 'fake' : 'auto')
  if (llm !== 'fake' && llm !== 'claude' && llm !== 'auto') throw unavailable('LLM', llm)
  // TTS runs in the renderer (HeadTTS); main only needs the mode. E2E defaults to the fake queue.
  const tts = env.TTS ?? (e2e ? 'fake' : 'headtts')
  if (tts !== 'headtts' && tts !== 'fake') throw unavailable('TTS', tts)
  const scale = Number(env.E2E_TIME_SCALE)
  return {
    adapters: 'fake',
    casesRoot: env.CASES_ROOT || DEFAULT_LIBRARY_ROOT,
    sessionsDir: env.SESSIONS_DIR || join(userData, 'sessions'),
    timeScale: e2e && scale > 0 ? scale : 1,
    e2e,
    tts,
    llm,
    interviewerModel: env.INTERVIEWER_MODEL?.trim() || DEFAULT_INTERVIEWER_MODEL
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
  }
): {
  config: AppConfig
  runner: SessionRunner
  library(): LibraryView
  casePdf(id: string): string | null
  e2eSay?: (text: string) => void
} {
  const config = readConfig(env, o.userData)
  const clock = createScaledClock({ scale: config.timeScale })
  const store = createSessionStore({ root: config.sessionsDir, now: clock.now, log: o.log })
  const stt = createFakeStt()
  o.log.info('interviewer', config.llm, config.interviewerModel)
  const fake = createFakeLlm()
  const makeLlm: MakeLlm = (brief) => {
    const key = o.getKey?.() ?? null
    if (config.llm === 'fake' || !key) {
      if (config.llm !== 'fake') o.log.warn('no API key; using fake interviewer')
      return fake(brief)
    }
    const client = new Anthropic({
      apiKey: key,
      maxRetries: 1,
      timeout: 30_000,
      ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {})
    })
    return createClaudeLlm({ client, model: config.interviewerModel, log: o.log })(brief)
  }
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
    e2eSay: config.e2e ? (t) => stt.inject(t) : undefined
  }
}
