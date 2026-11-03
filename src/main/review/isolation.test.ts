// REV-06: the interviewer cannot see past sessions — by type, at runtime and by import graph.
import Anthropic from '@anthropic-ai/sdk'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { createClaudeLlm } from '../agent/claudeLlm'
import { sseEvents, sseFetch } from '../agent/sse.harness'
import type { InterviewerBrief } from '../domain/cases/brief'
import { loadCase } from '../domain/cases/library'
import type { MakeLlm } from '../ports'
import { FIXTURE_ROOT, deck } from '../session/runner.harness'

const brief = loadCase(FIXTURE_ROOT, '99', deck).brief
const OTHER_SESSION = 's_other_past_session_01'

describe('interviewer isolation', () => {
  it('given the factory types, then the interviewer takes only client, model and log, and a brief', () => {
    expectTypeOf<keyof Parameters<typeof createClaudeLlm>[0]>().toEqualTypeOf<
      'client' | 'model' | 'log'
    >()
    expectTypeOf<Parameters<MakeLlm>>().toEqualTypeOf<[InterviewerBrief]>()
  })

  it('given a store and summaries smuggled into the config, when warm-up, grill and scoring run, then neither is touched', async () => {
    const stub = sseFetch([
      sseEvents({ text: ['Hi, how was your week?'] }),
      sseEvents({ text: ['How did you get that number?'] })
    ])
    const client = new Anthropic({ apiKey: 'test', fetch: stub.fetch, maxRetries: 0 })
    const store = { load: vi.fn(), list: vi.fn(), listSummaries: vi.fn(), libraryView: vi.fn() }
    const listSummaries = vi.fn(() => [{ sessionId: OTHER_SESSION }])
    const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const llm = createClaudeLlm({
      client,
      model: 'm',
      log,
      store,
      listSummaries
    } as never)(brief)
    const signal = new AbortController().signal
    for await (const _ of llm.warmupTurn({ history: [] }, signal)) void _
    const history = [
      { speaker: 'candidate' as const, text: 'I recommend invest', phase: 'presentation' as const }
    ]
    for await (const _ of llm.streamTurn(
      { kind: 'grill', section: 'retention', turnInSection: 0, history },
      signal
    ))
      void _
    await llm.scoreSession(
      { transcript: [], controlLog: [], endedEarly: true, omitted: [], at: 1 },
      signal
    )
    expect(listSummaries).not.toHaveBeenCalled()
    for (const f of Object.values(store)) expect(f).not.toHaveBeenCalled()
    expect(stub.requests.length).toBeGreaterThanOrEqual(2)
    const bodies = JSON.stringify(stub.requests)
    expect(bodies).not.toContain(OTHER_SESSION)
    expect(bodies.toLowerCase()).not.toContain('trends')
  })

  it('given src/main/agent, when imports are read, then none reach the store, trends or the filesystem', () => {
    const dir = join(__dirname, '../agent')
    const files = readdirSync(dir).filter(
      (f) => f.endsWith('.ts') && !/\.(test|harness)\.ts$/.test(f)
    )
    expect(files.length).toBeGreaterThan(0)
    for (const f of files) {
      const src = readFileSync(join(dir, f), 'utf8')
      const specs = [...src.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)].map((m) => m[1])
      for (const bad of ['../store/sessionStore', '../review/trends', 'node:fs', 'fs'])
        expect(specs, `${f} imports ${bad}`).not.toContain(bad)
    }
  })
})
