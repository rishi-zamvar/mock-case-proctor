import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { CH } from '../shared/ipc'
import { SpeakCancelSchema, SpeakEventSchema, ViewStateSchema } from '../shared/schemas'
import { compose, readConfig, REVIEW_WARNING_LINE } from './compose'
import { DEFAULT_LIBRARY_ROOT } from './domain/cases/library'
import { WARMUP_CLOSING_LINE } from './agent/turnText'
import { startReplayServer } from '../../tests/replay/server'
import type { FromWorker, ToWorker } from './stt/protocol'
import type { ChildLike } from './stt/whisperStt'
import { manualClock } from './session/runner.harness'

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
      tts: 'headtts',
      llm: 'auto',
      interviewerModel: 'claude-opus-5-5',
      stt: 'whisper',
      sttModel: 'turbo'
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
    [{ LLM: 'gpt' }, 'LLM=gpt'],
    [{ STT: 'bogus' }, 'STT=bogus'],
    [{ STT_MODEL: 'large' }, 'STT_MODEL=large'],
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

  it.each([
    [{}, 'auto'],
    [{ E2E: '1' }, 'fake'],
    [{ E2E: '1', LLM: 'claude' }, 'claude'],
    [{ LLM: 'auto' }, 'auto'],
    [{ LLM: 'fake' }, 'fake']
  ])('given env %j, when read, then llm is %s', (env, llm) => {
    expect(readConfig(env, '/ud').llm).toBe(llm)
  })

  it.each([
    [{ INTERVIEWER_MODEL: 'claude-haiku-5-5' }, 'claude-haiku-5-5'],
    [{ INTERVIEWER_MODEL: '  ' }, 'claude-opus-5-5']
  ])('given env %j, when read, then interviewerModel is %s', (env, m) => {
    expect(readConfig(env, '/ud').interviewerModel).toBe(m)
  })

  it.each([
    [{}, 'whisper', 'turbo'],
    [{ E2E: '1' }, 'fake', 'turbo'],
    [{ E2E: '1', STT: 'whisper', STT_MODEL: 'base' }, 'whisper', 'base'],
    [{ STT: 'fake' }, 'fake', 'turbo']
  ])('given env %j, when read, then stt is %s / %s', (env, stt, sttModel) => {
    expect(readConfig(env, '/ud')).toMatchObject({ stt, sttModel })
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

  // Manual clock: wall-clock time scaling flaked under parallel-suite CPU load.
  const warnSpeaks = async (tts: string): Promise<unknown[]> => {
    const send = vi.fn()
    const clock = manualClock()
    const core = compose(env({ TTS: tts }), { userData: tmp(), log, send, clock })
    const { sessionId } = await core.runner.start('99', { warmup: false })
    expect(core.runner.current()?.phase).toBe('review')
    clock.advance(36 * 60_000) // past T-10 of the 45 min review
    await vi.waitFor(() =>
      expect(
        send.mock.calls.some(([ch, p]) => ch === CH.speak && p.text === REVIEW_WARNING_LINE)
      ).toBe(tts === 'headtts')
    )
    clock.advance(10 * 60_000) // past the deadline: leaving review proves the warning ran once
    await vi.waitFor(() => expect(core.runner.current()?.phase).not.toBe('review'))
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

  describe('interviewer selection', () => {
    const KEY = 'sk-ant-test-canary-0001'
    const FAKE_HELLO = 'Hi, thanks for making the time today. How has your week been?'
    const mkLog = (): typeof log => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })
    const allLogText = (l: typeof log): string =>
      JSON.stringify([l.info.mock.calls, l.warn.mock.calls, l.error.mock.calls])
    const spoken = (send: ReturnType<typeof vi.fn>): string[] =>
      send.mock.calls.filter(([ch]) => ch === CH.speak).map(([, p]) => p.text as string)

    const withServer = async (
      fn: (
        url: string,
        logOf: (k: string) => Promise<{
          requests: { method: string; path: string; body: { model?: string } }[]
          sawCanary: boolean
        }>
      ) => Promise<void>
    ): Promise<void> => {
      const srv = await startReplayServer({ fixturesDir: tmp(), logDir: tmp() })
      try {
        await fn(srv.url, async (k) =>
          (await fetch(`${srv.url}/__log/${k}?canary=${encodeURIComponent(KEY)}`)).json()
        )
      } finally {
        await srv.close()
      }
    }

    it('given llm auto and a key, when warm-up runs, then Claude is called at ANTHROPIC_BASE_URL with the model and key, and the key is never logged', async () => {
      await withServer(async (url, logOf) => {
        const l = mkLog()
        const e = env({
          ANTHROPIC_BASE_URL: `${url}/s/auto`,
          INTERVIEWER_MODEL: 'claude-haiku-5-5'
        })
        delete e.E2E
        const core = compose(e, { userData: tmp(), log: l, send: vi.fn(), getKey: () => KEY })
        expect(core.config.llm).toBe('auto')
        const { sessionId } = await core.runner.start('99', { warmup: true })
        await vi.waitFor(
          async () => expect((await logOf('auto')).requests.length).toBeGreaterThan(0),
          {
            timeout: 5000
          }
        )
        const got = await logOf('auto')
        expect(got.sawCanary).toBe(true)
        expect(got.requests[0]).toMatchObject({ method: 'POST', path: '/v1/messages' })
        expect(got.requests[0].body.model).toBe('claude-haiku-5-5')
        core.runner.discard(sessionId)
        expect(allLogText(l)).not.toContain(KEY)
        expect(l.info).toHaveBeenCalledWith('interviewer', 'auto', 'claude-haiku-5-5')
      })
    })

    it('given llm auto and no key, when two sessions run, then each uses the fake and warns once', async () => {
      const l = mkLog()
      const send = vi.fn()
      const e = env()
      delete e.E2E
      const core = compose(e, { userData: tmp(), log: l, send, getKey: () => null })
      for (let i = 1; i <= 2; i++) {
        const { sessionId } = await core.runner.start('99', { warmup: true })
        await vi.waitFor(() => expect(spoken(send).join(' ')).toContain(FAKE_HELLO))
        core.runner.discard(sessionId)
        const warns = l.warn.mock.calls.filter(([m]) => m === 'no API key; using fake interviewer')
        expect(warns).toHaveLength(i)
      }
    })

    it('given llm fake and a key, when warm-up runs, then no request reaches the server', async () => {
      await withServer(async (url, logOf) => {
        const l = mkLog()
        const send = vi.fn()
        const core = compose(env({ ANTHROPIC_BASE_URL: `${url}/s/fake` }), {
          userData: tmp(),
          log: l,
          send,
          getKey: () => KEY
        })
        expect(core.config.llm).toBe('fake')
        const { sessionId } = await core.runner.start('99', { warmup: true })
        await vi.waitFor(() => expect(spoken(send).join(' ')).toContain(FAKE_HELLO))
        core.runner.discard(sessionId)
        expect((await logOf('fake')).requests).toEqual([])
        expect(l.warn).not.toHaveBeenCalled()
      })
    })

    it.each([
      ['claude', true],
      ['fake', false]
    ])(
      'given LLM=%s, when warm-up is skipped, then the closing line spoken is %s',
      async (llm, said) => {
        const send = vi.fn()
        const core = compose(env({ LLM: llm }), {
          userData: tmp(),
          log: mkLog(),
          send,
          getKey: () => null
        })
        const { sessionId } = await core.runner.start('99', { warmup: true })
        await vi.waitFor(() => expect(spoken(send).length).toBeGreaterThan(0))
        await core.runner.intent({ type: 'skipWarmup' })
        core.runner.discard(sessionId)
        expect(spoken(send).includes(WARMUP_CLOSING_LINE)).toBe(said)
      }
    )
  })

  describe('stt selection', () => {
    const METAL = [{ name: 'MTL0', description: 'Apple M', type: 'gpu' }]
    const mkLog = (): typeof log => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })
    const fakeChild = (sent: ToWorker[]): ChildLike => {
      const subs: ((m: FromWorker) => void)[] = []
      const emit = (m: FromWorker): void => void setImmediate(() => subs.forEach((cb) => cb(m)))
      return {
        postMessage: (m) => {
          sent.push(m)
          if (m.type === 'init') emit({ type: 'ready', gpus: METAL })
          else emit({ type: 'text', id: m.id, text: 'hello' })
        },
        on: ((ev: string, cb: (m: FromWorker) => void) => {
          if (ev === 'message') subs.push(cb)
        }) as ChildLike['on'],
        kill: () => true
      }
    }
    const whisperEnv = (): Record<string, string> => env({ STT: 'whisper', STT_MODEL: 'base' })

    it('given STT=whisper, a model file and a fork, when composed, then it pre-warms with the model path and reports metal', async () => {
      const dir = tmp()
      writeFileSync(join(dir, 'ggml-base.en.bin'), '')
      const sent: ToWorker[] = []
      const forkStt = vi.fn(() => fakeChild(sent))
      const l = mkLog()
      const core = compose(whisperEnv(), {
        userData: tmp(),
        log: l,
        send: vi.fn(),
        forkStt,
        sttModelsDir: dir
      })
      // Pre-warm fired at compose time: no transcribe call was made by the test.
      await vi.waitFor(() =>
        expect(sent[0]).toEqual({ type: 'init', model: join(dir, 'ggml-base.en.bin') })
      )
      expect(forkStt).toHaveBeenCalledTimes(1)
      await expect(core.sttStatus()).resolves.toBe('metal')
      expect(core.e2eSay).toBeUndefined()
      expect(l.info).toHaveBeenCalledWith('stt', 'whisper', 'base')
      core.disposeStt?.()
    })

    it('given STT=whisper and a missing model, when composed, then status is failed, the log is pathless and fork is never called', async () => {
      const dir = tmp()
      const forkStt = vi.fn()
      const l = mkLog()
      const core = compose(whisperEnv(), {
        userData: tmp(),
        log: l,
        send: vi.fn(),
        forkStt,
        sttModelsDir: dir
      })
      await expect(core.sttStatus()).resolves.toBe('failed')
      expect(l.error).toHaveBeenCalledWith('whisper model missing; run npm run fetch:voice')
      expect(JSON.stringify(l.error.mock.calls)).not.toContain(dir)
      expect(forkStt).not.toHaveBeenCalled()
    })

    it('given STT=whisper and no forkStt, when composed, then status is failed without throwing', async () => {
      const core = compose(whisperEnv(), { userData: tmp(), log: mkLog(), send: vi.fn() })
      await expect(core.sttStatus()).resolves.toBe('failed')
    })

    it('given E2E default, when composed, then stt is off and e2eSay is defined', async () => {
      const core = compose(env(), { userData: tmp(), log: mkLog(), send: vi.fn() })
      expect(core.config.stt).toBe('fake')
      await expect(core.sttStatus()).resolves.toBe('off')
      expect(core.e2eSay).toBeTypeOf('function')
    })
  })
})
