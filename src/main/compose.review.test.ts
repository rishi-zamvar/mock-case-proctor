// Phase 8 wiring: reviewer + trends behind REVIEWER / REVIEWER_MODEL switches.
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { DIMENSION_IDS } from '../shared/ipc'
import { startReplayServer } from '../../tests/replay/server'
import { jsonMessage } from './agent/sse.harness'
import { compose, readConfig } from './compose'
import { PROMPT_VERSION } from './review/grader'
import { FIXTURE_ROOT, manualClock } from './session/runner.harness'

const tmp = (): string => mkdtempSync(join(tmpdir(), 'compose-rev-'))
const mkLog = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })
const KEY = 'sk-ant-test-canary-0002'

const draft = {
  dimensions: DIMENSION_IDS.map((id) => ({
    id,
    score: 4,
    evidence_quotes: ['My call is to pass at this price'],
    answer_key_item: 'AK',
    rationale: 'R'
  })),
  keep: 'K',
  fix: 'F',
  insight: { called_out: [], missed: [] },
  summary: 'S'
}

async function scoreOnce(
  core: ReturnType<typeof compose>
): Promise<{ graderModel: string; promptVersion: string }> {
  const { sessionId } = await core.runner.start('99', { warmup: false })
  await core.runner.intent({ type: 'end' })
  await vi.waitFor(() => expect(core.runner.current()?.phase).toBe('reviewMode'), {
    timeout: 5000
  })
  const card = core.runner.current()?.reveal?.scorecard as { graderModel: string; promptVersion: string }
  core.runner.discard(sessionId)
  return card
}

describe('readConfig reviewer', () => {
  it.each([
    [{}, 'auto'],
    [{ E2E: '1' }, 'fake'],
    [{ E2E: '1', REVIEWER: 'claude' }, 'claude'],
    [{ REVIEWER: 'fake' }, 'fake']
  ])('given env %j, when read, then reviewer is %s', (env, reviewer) => {
    expect(readConfig(env, '/ud').reviewer).toBe(reviewer)
  })

  it.each([
    [{}, 'claude-opus-5-5'],
    [{ REVIEWER_MODEL: ' claude-sonnet-5-5 ' }, 'claude-sonnet-5-5'],
    [{ REVIEWER_MODEL: '  ' }, 'claude-opus-5-5']
  ])('given env %j, when read, then reviewerModel is %s', (env, m) => {
    expect(readConfig(env, '/ud').reviewerModel).toBe(m)
  })

  it('given REVIEWER=bogus, when read, then it throws', () => {
    expect(() => readConfig({ REVIEWER: 'bogus' }, '/ud')).toThrow(
      'adapter not available in this build: REVIEWER=bogus'
    )
  })
})

describe('compose reviewer + trends', () => {
  const env = (extra: Record<string, string> = {}): Record<string, string> => ({
    CASES_ROOT: FIXTURE_ROOT,
    SESSIONS_DIR: tmp(),
    E2E: '1',
    ...extra
  })

  it('given E2E and no REVIEWER, when a session ends, then the fake grader scores it', async () => {
    const l = mkLog()
    const core = compose(env(), {
      userData: tmp(),
      log: l,
      send: vi.fn(),
      getKey: () => KEY,
      clock: manualClock()
    })
    expect((await scoreOnce(core)).graderModel).toBe('fake')
    expect(l.info).toHaveBeenCalledWith('reviewer', 'fake', 'claude-opus-5-5')
  })

  it('given REVIEWER=claude, a key and a replay server, when a session ends, then the real reviewer scores it', async () => {
    const fixtures = tmp()
    mkdirSync(join(fixtures, 'rev'))
    writeFileSync(
      join(fixtures, 'rev', '0.res.json'),
      JSON.stringify({
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: jsonMessage(JSON.stringify(draft))[0]
      })
    )
    const srv = await startReplayServer({ fixturesDir: fixtures, logDir: tmp() })
    try {
      const l = mkLog()
      const core = compose(
        env({ REVIEWER: 'claude', ANTHROPIC_BASE_URL: `${srv.url}/s/rev` }),
        { userData: tmp(), log: l, send: vi.fn(), getKey: () => KEY, clock: manualClock() }
      )
      const card = await scoreOnce(core)
      expect(card.graderModel).toBe('claude-opus-5-5')
      expect(card.promptVersion).toBe(PROMPT_VERSION)
      const got = await (await fetch(`${srv.url}/__log/rev`)).json()
      expect(got.requests).toHaveLength(1)
      expect(got.requests[0].body.model).toBe('claude-opus-5-5')
      expect(JSON.stringify([l.info.mock.calls, l.warn.mock.calls])).not.toContain(KEY)
    } finally {
      await srv.close()
    }
  })

  it('given two completed sessions, when trends() is read, then ready with 2 summaries and trends.json written', async () => {
    const e = env()
    const core = compose(e, {
      userData: tmp(),
      log: mkLog(),
      send: vi.fn(),
      clock: manualClock()
    })
    await expect(core.trends()).resolves.toMatchObject({ status: 'insufficient' })
    await scoreOnce(core)
    await scoreOnce(core)
    const view = await core.trends()
    expect(view.status).toBe('ready')
    expect(view.summaries).toHaveLength(2)
    await vi.waitFor(() => expect(existsSync(join(e.SESSIONS_DIR, 'trends.json'))).toBe(true))
  })
})
