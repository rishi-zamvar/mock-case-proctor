import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { CH } from '../shared/ipc'
import { SpeakEventSchema, ViewStateSchema } from '../shared/schemas'
import { compose, readConfig } from './compose'
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
      e2e: false
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
      else throw new Error(`unexpected channel ${ch}`)
    }
    core.runner.discard(sessionId)
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
})
