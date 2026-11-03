// The only module that constructs adapters or reads config env (only its `env` argument,
// never the global). Real adapters swap in here: TTS Phase 5, LLM Phase 6, STT Phase 7.
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { CH, type LibraryView } from '../shared/ipc'
import { LibraryViewSchema, SpeakEventSchema } from '../shared/schemas'
import { createScaledClock } from './adapters/clock'
import { createFakeLlm } from './adapters/fakeLlm'
import { createFakeStt } from './adapters/fakeStt'
import { readDeckText } from './domain/cases/deckSource'
import { casePdfResolver, DEFAULT_LIBRARY_ROOT, listCases, loadCase } from './domain/cases/library'
import type { Logger } from './log'
import type { AwakePort } from './ports'
import { createSessionRunner, type SessionRunner } from './session/runner'
import { createSessionStore } from './store/sessionStore'

type Env = Record<string, string | undefined>
export type AppConfig = {
  adapters: 'fake'
  casesRoot: string
  sessionsDir: string
  timeScale: number
  e2e: boolean
}

export function readConfig(env: Env, userData: string): AppConfig {
  for (const name of ['ADAPTERS', 'LLM', 'STT', 'TTS']) {
    const v = env[name]
    if (v !== undefined && v !== 'fake')
      throw new Error(`adapter not available in this build: ${name}=${v}`)
  }
  const e2e = env.E2E === '1'
  const scale = Number(env.E2E_TIME_SCALE)
  return {
    adapters: 'fake',
    casesRoot: env.CASES_ROOT || DEFAULT_LIBRARY_ROOT,
    sessionsDir: env.SESSIONS_DIR || join(userData, 'sessions'),
    timeScale: e2e && scale > 0 ? scale : 1,
    e2e
  }
}

export function compose(
  env: Env,
  o: {
    userData: string
    log: Logger
    send(channel: string, payload: unknown): void
    awake?: AwakePort
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
  const runner = createSessionRunner({
    store,
    clock,
    stt,
    makeLlm: createFakeLlm(),
    loadCase: (id) => loadCase(config.casesRoot, id, readDeckText(config.casesRoot, id)),
    emitView: (v) => o.send(CH.view, v), // toViewState already parsed it
    emitSpeak: (s) => o.send(CH.speak, SpeakEventSchema.parse(s)),
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
