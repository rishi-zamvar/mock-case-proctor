// Layer 2 integration: recorded real Opus SSE (case_99 only) through the real SDK + adapter.
// Replay by default; RECORD=1 re-records via the proxy using the .env key (never printed).
import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { startReplayServer, type ReplayServer } from '../../../tests/replay/server'
import { loadCase } from '../domain/cases/library'
import { SECTION_IDS } from '../domain/machine/sections'
import { parseDotenv } from '../keys/dotenv'
import type { Logger } from '../log'
import type {
  HistoryTurn,
  LlmChunk,
  LlmPort,
  OpeningPlan,
  ProctorFacts,
  TurnRequest
} from '../ports'
import { FIXTURE_ROOT, deck } from '../session/runner.harness'
import { InterviewControlSchema } from '../store/sessionSchema'
import { createClaudeLlm, DEFAULT_INTERVIEWER_MODEL } from './claudeLlm'

const ROOT = join(__dirname, '..', '..', '..')
const FIXTURES = join(ROOT, 'tests', 'fixtures', 'claude')
const RECORD = process.env.RECORD === '1'
const realKey = (): string | undefined => {
  const p = join(ROOT, '.env')
  return existsSync(p) ? parseDotenv(readFileSync(p, 'utf8')).ANTHROPIC_API_KEY : undefined
}

const brief = loadCase(FIXTURE_ROOT, '99', deck).brief

const OPENING =
  'Fixturely sells widget seats to test teams and is at about ten million of ARR growing forty percent. ' +
  "I'd invest at the right price. The key considerations are retention, which I want to dig into first, " +
  'then the industry and how it compares to comps, and finally valuation and what return we can underwrite. Happy to dive into each.'
const WRONG = "Gross retention is about ninety five percent, so churn isn't a concern."
const STRONG =
  'Correcting myself: for customers live twelve months or more, gross retention is eighty five percent and net retention is one hundred four percent. ' +
  'So expansion only just offsets churn, which means growth leans on new logos, and that matters for the price we pay.'
const WARM_REPLY = 'Good week — been reading about vertical SaaS consolidation.'

const log = (): Logger => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) as unknown as Logger

let srv: ReplayServer
beforeAll(async () => {
  delete process.env.ANTHROPIC_BASE_URL
  srv = await startReplayServer({
    fixturesDir: FIXTURES,
    logDir: join(ROOT, 'test-results', 'replay'),
    record: RECORD
  })
})
afterAll(async () => {
  await srv?.close()
})

function session(scenario: string): {
  llm: LlmPort
  requests: () => Promise<Record<string, unknown>[]>
} {
  const key = `${scenario}~${randomUUID()}`
  const client = new Anthropic({
    apiKey: RECORD ? (realKey() ?? '') : 'test',
    baseURL: `${srv.url}/s/${key}`,
    maxRetries: 0
  })
  const llm = createClaudeLlm({ client, model: DEFAULT_INTERVIEWER_MODEL, log: log() })(brief)
  const requests = async (): Promise<Record<string, unknown>[]> => {
    const r = await fetch(`${srv.url}/__log/${encodeURIComponent(key)}`)
    const j = (await r.json()) as { requests: { body: Record<string, unknown> }[] }
    return j.requests.map((x) => x.body)
  }
  return { llm, requests }
}

async function collect(it: AsyncIterable<LlmChunk>): Promise<LlmChunk[]> {
  const out: LlmChunk[] = []
  for await (const c of it) out.push(c)
  return out
}
const spoken = (chunks: LlmChunk[]): string =>
  chunks
    .filter((c): c is { type: 'text'; delta: string } => c.type === 'text')
    .map((c) => c.delta)
    .join('')

const facts = (plan: OpeningPlan | undefined, over: Partial<ProctorFacts>): ProctorFacts => ({
  directive: 'probe',
  caps: { soft: 3, hard: 5 },
  grillElapsedMs: 0,
  budgetMs: 25 * 60_000,
  pushback: 'not_yet',
  lastAnswerLong: false,
  plan: plan?.order ?? ['retention', 'industry', 'valuation'],
  done: [],
  surfacedFlagIds: [],
  openingLabels: [],
  ...over
})

const lastUser = (body: Record<string, unknown>): MessageParam => {
  const msgs = body.messages as MessageParam[]
  return msgs[msgs.length - 1]
}
const userTexts = (body: Record<string, unknown>): string[] =>
  (body.messages as MessageParam[])
    .filter((m) => m.role === 'user')
    .flatMap((m) =>
      typeof m.content === 'string'
        ? [m.content]
        : m.content.flatMap((b) => (b.type === 'text' ? [b.text] : []))
    )

describe('claudeLlm against recorded Opus responses (case_99)', () => {
  it('interviewer-grill: extraction, then three grill turns with cached prefix', async (ctx) => {
    if (RECORD && !realKey()) ctx.skip('RECORD=1 needs ANTHROPIC_API_KEY in .env')
    const { llm, requests } = session('interviewer-grill')
    const sig = new AbortController().signal

    const ex = await llm.extractPlan(OPENING, sig)
    expect(ex.order.length).toBeGreaterThan(0)
    for (const s of ex.order) expect(SECTION_IDS).toContain(s)
    expect(['invest', 'pass', 'invest_at_price', 'unclear']).toContain(ex.plan?.recommendation)

    const history: HistoryTurn[] = [{ speaker: 'candidate', text: OPENING, phase: 'presentation' }]
    const turns: { candidate?: string; directive: ProctorFacts['directive'] }[] = [
      { directive: 'framing' },
      { candidate: WRONG, directive: 'probe' },
      { candidate: STRONG, directive: 'probe' }
    ]
    for (const [i, t] of turns.entries()) {
      if (t.candidate) history.push({ speaker: 'candidate', text: t.candidate, phase: 'grilling' })
      const req: TurnRequest = {
        kind: 'grill',
        section: 'retention',
        turnInSection: i,
        history: [...history],
        proctor: facts(ex.plan, {
          directive: t.directive,
          openingLabels: i === 0 ? (ex.plan?.considerations.map((c) => c.label) ?? []) : []
        })
      }
      const chunks = await collect(llm.streamTurn(req, sig))
      const ctlIdx = chunks.findIndex((c) => c.type === 'control')
      expect(chunks.findIndex((c) => c.type === 'text')).toBeGreaterThanOrEqual(0)
      expect(chunks.findIndex((c) => c.type === 'text')).toBeLessThan(ctlIdx)
      const ctl = chunks.filter((c) => c.type === 'control')
      expect(ctl).toHaveLength(1)
      const payload = (ctl[0] as { payload: unknown }).payload
      expect(InterviewControlSchema.safeParse(payload).success).toBe(true)
      expect(payload).toMatchObject({ section: 'retention' })
      const done = chunks[chunks.length - 1]
      expect(done.type).toBe('done')
      const usage = (done as Extract<LlmChunk, { type: 'done' }>).usage
      expect(usage?.stopReason).toBe('tool_use')
      // request index i+1 within the session; from the third request on, the prefix is cached
      if (i + 1 >= 2) expect(usage?.cacheRead).toBeGreaterThan(0)
      history.push({ speaker: 'interviewer', text: spoken(chunks), phase: 'grilling' })
    }

    const reqs = await requests()
    expect(reqs).toHaveLength(4)
    const grill = reqs.slice(1)
    const sys0 = JSON.stringify(grill[0].system)
    const tools0 = JSON.stringify(grill[0].tools)
    for (const [i, b] of grill.entries()) {
      expect(JSON.stringify(b.system)).toBe(sys0)
      expect(JSON.stringify(b.tools)).toBe(tools0)
      const sys = b.system as { cache_control?: unknown }[]
      expect(sys[sys.length - 1].cache_control).toBeTruthy()
      expect(b.cache_control).toEqual({ type: 'ephemeral' })
      expect(b.output_config).toMatchObject({ effort: 'low' })
      expect(b.max_tokens).toBe(1024)
      expect(b.tool_choice).toEqual({ type: 'auto' })
      expect('thinking' in b).toBe(false)
      if (i >= 1) {
        const content = lastUser(b).content as { type: string }[]
        expect(content[0].type).toBe('tool_result')
      }
      for (const said of [OPENING, WRONG, STRONG])
        for (const t of userTexts(b).filter((x) => x.includes(said)))
          expect(t).toContain('<candidate_said>')
    }
    expect(JSON.stringify(reqs[0])).toContain('<candidate_said>')
  }, 180_000)

  it('interviewer-warmup: two case-free small-talk turns', async (ctx) => {
    if (RECORD && !realKey()) ctx.skip('RECORD=1 needs ANTHROPIC_API_KEY in .env')
    const { llm, requests } = session('interviewer-warmup')
    const sig = new AbortController().signal
    const history: HistoryTurn[] = []
    for (const reply of [undefined, WARM_REPLY]) {
      if (reply) history.push({ speaker: 'candidate', text: reply, phase: 'warmup' })
      const chunks = await collect(llm.warmupTurn({ history: [...history] }, sig))
      expect(spoken(chunks).length).toBeGreaterThan(0)
      const done = chunks[chunks.length - 1] as Extract<LlmChunk, { type: 'done' }>
      expect(done.type).toBe('done')
      expect(done.warmupComplete).toBeUndefined()
      history.push({ speaker: 'interviewer', text: spoken(chunks), phase: 'warmup' })
    }
    const reqs = await requests()
    expect(reqs).toHaveLength(2)
    for (const b of reqs) {
      expect('tools' in b).toBe(false)
      const s = JSON.stringify(b)
      expect(s.includes(brief.company.name)).toBe(false)
      expect(s.includes('<evaluation_key>')).toBe(false)
    }
    expect(userTexts(reqs[1]).some((t) => t.includes('<candidate_said>'))).toBe(true)
  }, 120_000)
})
