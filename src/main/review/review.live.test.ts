// Layer 4 live eval (LIVE=1): real Claude grades the case_99 scripts; structure and ordering, not
// wording. Never prints the key or any text: totals, bands and counts only.
import Anthropic from '@anthropic-ai/sdk'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import type { Scorecard } from '../../shared/ipc'
import { ScorecardSchema, TrendsInsightsSchema } from '../../shared/schemas'
import { loadCase } from '../domain/cases/library'
import { initialState } from '../domain/machine/interviewMachine'
import { parseDotenv } from '../keys/dotenv'
import type { Logger } from '../log'
import { FIXTURE_ROOT, deck } from '../session/runner.harness'
import { AVERAGE, STRONG, WEAK, scoreInputOf } from './gradeScripts.harness'
import { createReviewer, DEFAULT_REVIEWER_MODEL } from './grader'
import { createTrendsAgent, toSummary } from './trends'

const ROOT = join(__dirname, '..', '..', '..')
const MODEL = process.env.REVIEWER_MODEL || DEFAULT_REVIEWER_MODEL
const apiKey = (): string | undefined => {
  const p = join(ROOT, '.env')
  return existsSync(p) ? parseDotenv(readFileSync(p, 'utf8')).ANTHROPIC_API_KEY : undefined
}
const log = (): Logger => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) as unknown as Logger

describe.skipIf(!process.env.LIVE)('reviewer live eval (case_99)', () => {
  const cards: Partial<Record<'strong' | 'average' | 'weak', Scorecard>> = {}

  test('strong > average > weak, schema-valid, dropped quotes < 20%', async () => {
    const client = new Anthropic({ apiKey: apiKey()!, maxRetries: 1, timeout: 600_000 })
    const brief = loadCase(FIXTURE_ROOT, '99', deck).brief
    const grade = createReviewer({ client, model: MODEL, log: log() })(brief)
    const scripts = { strong: STRONG, average: AVERAGE, weak: WEAK }
    const results = await Promise.all(
      (['strong', 'average', 'weak'] as const).map(
        async (k) =>
          [k, await grade(scoreInputOf(scripts[k]), new AbortController().signal)] as const
      )
    )
    let proposed = 0
    let dropped = 0
    for (const [k, c] of results) {
      expect(ScorecardSchema.safeParse(c).success, k).toBe(true)
      cards[k] = c
      proposed += c.evidenceStats.proposed
      dropped += c.evidenceStats.dropped
      console.log(
        `live ${k}: total=${c.total} band=${c.band} proposed=${c.evidenceStats.proposed} verified=${c.evidenceStats.verified} dropped=${c.evidenceStats.dropped}`
      )
    }
    console.log(`live dropped rate=${(dropped / proposed).toFixed(3)} (${dropped}/${proposed})`)
    expect(cards.strong!.total).toBeGreaterThan(cards.average!.total)
    expect(cards.average!.total).toBeGreaterThan(cards.weak!.total)
    expect(proposed).toBeGreaterThan(0)
    expect(dropped / proposed).toBeLessThan(0.2)
  }, 900_000)

  test('trends over the three live scorecards is valid', async (ctx) => {
    const { strong, average, weak } = cards
    if (!strong || !average || !weak) return ctx.skip('grading test failed')
    const summaries = [weak, average, strong].map((c, i) =>
      toSummary({
        schemaVersion: 1,
        id: `s${i}`,
        caseId: '99',
        startedAt: 1,
        endedAt: 2_000_000 + i,
        status: 'completed',
        warmup: false,
        machineState: initialState(),
        transcript: [],
        controlLog: [],
        timings: [],
        pending: null,
        scorecard: { ...c, scoredAt: 2_000_000 + i }
      })
    )
    const client = new Anthropic({ apiKey: apiKey()!, maxRetries: 1, timeout: 300_000 })
    const insights = await createTrendsAgent({ client, model: MODEL, log: log() })(
      {
        summaries,
        unseen: [
          { id: '98', vertical: 'Fictional logistics SaaS', level: 2 },
          { id: '97', vertical: 'Fictional healthcare SaaS', level: 3 }
        ]
      },
      new AbortController().signal
    )
    expect(TrendsInsightsSchema.safeParse(insights).success).toBe(true)
    if (insights.nextCase) expect(['98', '97']).toContain(insights.nextCase.caseId)
    console.log(
      `live trends: weaknesses=${insights.recurringWeaknesses.length} up=${insights.progress.filter((p) => p.direction === 'up').length} next=${insights.nextCase?.caseId ?? 'none'}`
    )
  }, 300_000)
})
