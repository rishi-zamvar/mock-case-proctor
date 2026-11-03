import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { CH } from '../shared/ipc'
import { SpeakCancelSchema, SpeakEventSchema, ViewStateSchema } from '../shared/schemas'
import { compose, readConfig, REVIEW_WARNING_LINE } from './compose'
import { DEFAULT_LIBRARY_ROOT } from './domain/cases/library'

const FIXTURE_ROOT = join(__dirname, '../../tests/fixtures/cases')
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
const tmp = (): string => mkdtempSync(join(tmpdir(), 'compose-'))

describe('readConfig', () => {
  it('given an empty env, when read, then returns fake adapters and default paths', () => {
    expect(readConfig({}, '/ud')).toEqual({
      adapters: 'fake',
      casesRoot: DEFAULT_LIBRARY_ROOT,
      sessionsDir: '/ud/sessions',
      timeScale: 1,
      e2e: false,
      tts: 'headtts'
    })
  })

  it('given CASES_ROOT and SESSIONS_DIR, when read, then they override the defaults', () => {
    const c = readConfig({ CASES_ROOT: '/c', SESSIONS_DIR: '/s' }, '/ud')
    expect(c.casesRoot).toBe('/c')
    expect(c.sessionsDir).toBe('/s')
  })

  it('given E2E_TIME_SCALE without E2E, when read, then the scale is ignored', () => {
    expect(readConfig({ E2E_TIME_SCALE: '600' }, '/ud').timeScale).toBe(1)
  })

  it('given E2E and E2E_TIME_SCALE 600, when read, then the scale is honoured', () => {
    const c = readConfig({ E2E: '1', E2E_TIME_SCALE: '600' }, '/ud')
    expect(c).toMatchObject({ e2e: true, timeScale: 600 })
  })

  it.each(['0', '-5', 'abc'])(
    'given E2E and an invalid scale %s, when read, then the scale is 1',
    (s) => {
      expect(readConfig({ E2E: '1', E2E_TIME_SCALE: s }, '/ud').timeScale).toBe(1)
    }
  )

  it.each([
    [{ ADAPTERS: 'real' }, 'ADAPTERS=real'],
    [{ LLM: 'claude' }, 'LLM=claude'],
    [{ STT: 'whisper' }, 'STT=whisper'],
    [{ TTS: 'kokoro' }, 'TTS=kokoro']
  ])('given unavailable adapter env %j, when read, then it throws', (env, name) => {
    expect(() => readConfig(env, '/ud')).toThrow(`adapter not available in this build: ${name}`)
  })

  it.each([
    [{}, 'headtts'],
    [{ E2E: '1' }, 'fake'],
    [{ TTS: 'headtts', E2E: '1' }, 'headtts'],
    [{ TTS: 'fake' }, 'fake']
  ])('given env %j, when read, then tts is %s', (env, tts) => {
    expect(readConfig(env, '/ud').tts).toBe(tts)
  })

  it('given LLM fake, when read, then it is accepted', () => {
    expect(readConfig({ LLM: 'fake' }, '/ud').adapters).toBe('fake')
  })
})

describe('compose', () => {
  const env = (extra: Record<string, string> = {}): Record<string, string> => ({
    CASES_ROOT: FIXTURE_ROOT,
    SESSIONS_DIR: tmp(),
    E2E: '1',
    ...extra
  })

  it('given the fixture root, when library(), then lists the fixture card uncompleted', () => {
    const core = compose(env(), { userData: tmp(), log, send: vi.fn() })
    const lib = core.library()
    expect(lib.error).toBeNull()
    expect(lib.cases.map((c) => [c.card.id, c.completed])).toEqual([['99', null]])
  })

  it('given the fixture root, when casePdf, then resolves only the interviewee package', () => {
    const core = compose(env(), { userData: tmp(), log, send: vi.fn() })
    expect(core.casePdf('99')).toMatch(/_interviewee_package\.pdf$/)
    expect(core.casePdf('98')).toBeNull()
  })

  it('given E2E, when composed, then e2eSay is defined', () => {
    expect(compose(env(), { userData: tmp(), log, send: vi.fn() }).e2eSay).toBeTypeOf('function')
  })

  it('given no E2E, when composed, then e2eSay is undefined', () => {
    const e = env()
    delete e.E2E
    expect(compose(e, { userData: tmp(), log, send: vi.fn() }).e2eSay).toBeUndefined()
  })

  it('given a started session, when start resolves, then a review view is sent and every payload passes its schema', async () => {
    const send = vi.fn()
    const core = compose(env(), { userData: tmp(), log, send })
    const { sessionId } = await core.runner.start('99', { warmup: false })
    const views = send.mock.calls.filter(([ch]) => ch === CH.view).map(([, p]) => p)
    expect(views.some((v) => v.phase === 'review')).toBe(true)
    for (const [ch, p] of send.mock.calls) {
      if (ch === CH.view) expect(ViewStateSchema.safeParse(p).success).toBe(true)
      else if (ch === CH.speak) expect(SpeakEventSchema.safeParse(p).success).toBe(true)
      else if (ch === CH.speakCancel) expect(SpeakCancelSchema.safeParse(p).success).toBe(true)
      else throw new Error(`unexpected channel ${ch}`)
    }
    core.runner.discard(sessionId)
  })

  it('given an awake port, when a session starts, then the display is held once', async () => {
    const awake = { hold: vi.fn(), release: vi.fn() }
    const core = compose(env(), { userData: tmp(), log, send: vi.fn(), awake })
    const { sessionId } = await core.runner.start('99', { warmup: false })
    expect(awake.hold).toHaveBeenCalledTimes(1)
    core.runner.discard(sessionId)
    expect(awake.release).toHaveBeenCalledTimes(1)
  })

  it('given a missing cases root, when library(), then returns a pathless error without throwing', () => {
    const missing = join(tmp(), 'nope')
    const core = compose(env({ CASES_ROOT: missing }), { userData: tmp(), log, send: vi.fn() })
    const lib = core.library()
    expect(lib).toEqual({
      cases: [],
      resumable: null,
      quarantined: 0,
      error: 'Case library not found. Set CASES_ROOT.'
    })
    expect(lib.error).not.toContain(missing)
  })

  const warnSpeaks = async (tts: string): Promise<unknown[]> => {
    const send = vi.fn()
    const core = compose(env({ TTS: tts, E2E_TIME_SCALE: '100000' }), {
      userData: tmp(),
      log,
      send
    })
    const { sessionId } = await core.runner.start('99', { warmup: false })
    // The deadline fires after T-10, so leaving review proves the warning already ran.
    await vi.waitFor(() => expect(core.runner.current()?.phase).not.toBe('review'), {
      timeout: 3000,
      interval: 2
    })
    core.runner.discard(sessionId)
    return send.mock.calls
      .filter(([ch, p]) => ch === CH.speak && p.text === REVIEW_WARNING_LINE)
      .map(([, p]) => p)
  }

  it('given TTS=headtts, when the T-10 warning fires, then the warning line is sent once', async () => {
    const speaks = await warnSpeaks('headtts')
    expect(speaks).toHaveLength(1)
    expect(speaks[0]).toMatchObject({ seq: 0, text: REVIEW_WARNING_LINE })
  })

  it('given TTS=fake, when the T-10 warning fires, then nothing is spoken', async () => {
    expect(await warnSpeaks('fake')).toEqual([])
  })

  it('given a warm-up turn mid-speech, when skipped, then a schema-valid speak:cancel is sent', async () => {
    const send = vi.fn()
    const core = compose(env(), { userData: tmp(), log, send })
    const { sessionId } = await core.runner.start('99', { warmup: true })
    await vi.waitFor(() => expect(send.mock.calls.some(([ch]) => ch === CH.speak)).toBe(true))
    await core.runner.intent({ type: 'skipWarmup' })
    const cancels = send.mock.calls.filter(([ch]) => ch === CH.speakCancel).map(([, p]) => p)
    expect(cancels).toHaveLength(1)
    expect(SpeakCancelSchema.parse(cancels[0]).turnId).toMatch(/^t_/)
    core.runner.discard(sessionId)
  })
})
