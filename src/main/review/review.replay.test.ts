// Layer 2 integration: recorded real Opus grader + trends output (case_99 only) through the real SDK.
// Replay by default; RECORD=1 re-records via the proxy using the .env key (never printed).
import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { startReplayServer, type ReplayServer } from '../../../tests/replay/server'
import type { Scorecard } from '../../shared/ipc'
import { ScorecardSchema, TrendsInsightsSchema } from '../../shared/schemas'
import { loadCase } from '../domain/cases/library'
import { initialState } from '../domain/machine/interviewMachine'
import { parseDotenv } from '../keys/dotenv'
import type { Logger } from '../log'
import { FIXTURE_ROOT, deck } from '../session/runner.harness'
import type { SessionFile } from '../store/sessionSchema'
import { AVERAGE, STRONG, WEAK, scoreInputOf } from './gradeScripts.harness'
import { createReviewer, DEFAULT_REVIEWER_MODEL, PROMPT_VERSION } from './grader'
import { createTrendsAgent, toSummary } from './trends'

const ROOT = join(__dirname, '..', '..', '..')
const FIXTURES = join(ROOT, 'tests', 'fixtures', 'claude')
const RECORD = process.env.RECORD === '1'
const realKey = (): string | undefined => {
  const p = join(ROOT, '.env')
  return existsSync(p) ? parseDotenv(readFileSync(p, 'utf8')).ANTHROPIC_API_KEY : undefined
}

const brief = loadCase(FIXTURE_ROOT, '99', deck).brief
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

function clientFor(scenario: string): {
  client: Anthropic
  requests: () => Promise<Record<string, unknown>[]>
} {
  const key = `${scenario}~${randomUUID()}`
  const client = new Anthropic({
    apiKey: RECORD ? (realKey() ?? '') : 'test',
    baseURL: `${srv.url}/s/${key}`,
    maxRetries: 0,
    timeout: 600_000
  })
  const requests = async (): Promise<Record<string, unknown>[]> => {
    const r = await fetch(`${srv.url}/__log/${encodeURIComponent(key)}`)
    const j = (await r.json()) as { requests: { body: Record<string, unknown> }[] }
    return j.requests.map((x) => x.body)
  }
  return { client, requests }
}

const cards: Partial<Record<'strong' | 'average' | 'weak', Scorecard>> = {}

async function grade(name: 'strong' | 'average' | 'weak'): Promise<Scorecard> {
  const turns = { strong: STRONG, average: AVERAGE, weak: WEAK }[name]
  const { client, requests } = clientFor(`reviewer-${name}`)
  const card = await createReviewer({ client, model: DEFAULT_REVIEWER_MODEL, log: log() })(brief)(
    scoreInputOf(turns),
    new AbortController().signal
  )
  const reqs = await requests()
  expect(reqs).toHaveLength(1)
  const b = reqs[0]
  expect(b.output_config).toMatchObject({ effort: 'high' })
  expect((b.output_config as { format?: unknown }).format).toBeTruthy()
  expect(b.max_tokens).toBe(16000)
  expect(JSON.stringify(b.system)).toContain('<case_key>')
  expect(JSON.stringify(b.messages)).toContain('<candidate_said>')
  expect(JSON.stringify(b)).not.toContain('sk-ant')
  expect(ScorecardSchema.safeParse(card).success).toBe(true)
  expect(card.graderModel).toBe(DEFAULT_REVIEWER_MODEL)
  expect(card.promptVersion).toBe(PROMPT_VERSION)
  cards[name] = card
  return card
}

const sessionOf = (id: string, card: Scorecard): SessionFile => ({
  schemaVersion: 1,
  id,
  caseId: '99',
  startedAt: card.scoredAt - 1_000_000,
  endedAt: card.scoredAt,
  status: 'completed',
  warmup: false,
  machineState: initialState(),
  transcript: [],
  controlLog: [],
  timings: [],
  pending: null,
  scorecard: card
})

describe('reviewer + trends against recorded Opus responses (case_99)', () => {
  it.each(['strong', 'average', 'weak'] as const)(
    'reviewer-%s: schema-valid scorecard from one structured call',
    async (name, ctx) => {
      if (RECORD && !realKey()) ctx.skip('RECORD=1 needs ANTHROPIC_API_KEY in .env')
      const card = await grade(name)
      if (name === 'strong')
        for (const r of card.rubric) expect(r.evidence.length, r.id).toBeGreaterThan(0)
    },
    600_000
  )

  it('orders strong > average > weak', (ctx) => {
    if (RECORD && !realKey()) ctx.skip('RECORD=1 needs ANTHROPIC_API_KEY in .env')
    const { strong, average, weak } = cards
    expect(strong && average && weak).toBeTruthy()
    expect(strong!.total).toBeGreaterThan(average!.total)
    expect(average!.total).toBeGreaterThan(weak!.total)
  })

  it('trends-run: insights over weak -> average -> strong pick a next case from unseen', async (ctx) => {
    if (RECORD && !realKey()) ctx.skip('RECORD=1 needs ANTHROPIC_API_KEY in .env')
    const { strong, average, weak } = cards
    expect(strong && average && weak).toBeTruthy()
    // Distinct, increasing scoredAt so oldest = weak.
    const ordered = [weak!, average!, strong!].map((c, i) => ({ ...c, scoredAt: 2_000_000 + i }))
    const summaries = ordered.map((c, i) => toSummary(sessionOf(`s${i}`, c)))
    const unseen = [
      { id: '98', vertical: 'Fictional logistics SaaS', level: 2 },
      { id: '97', vertical: 'Fictional healthcare SaaS', level: 3 }
    ]
    const { client, requests } = clientFor('trends-run')
    const insights = await createTrendsAgent({
      client,
      model: DEFAULT_REVIEWER_MODEL,
      log: log()
    })({ summaries, unseen }, new AbortController().signal)
    expect(TrendsInsightsSchema.safeParse(insights).success).toBe(true)
    expect(insights.progress.some((p) => p.direction === 'up')).toBe(true)
    if (insights.nextCase) expect(['98', '97']).toContain(insights.nextCase.caseId)
    const reqs = await requests()
    expect(reqs).toHaveLength(1)
    expect(JSON.stringify(reqs[0])).not.toContain('<candidate_said>')
  }, 300_000)
})
