import type {} from '../../src/preload/index.d' // Window.api / __e2e globals
// T1 review mode + trends (REV-01..04, REV-06): the built app on fakes, with 2 seeded scored sessions.
import { expect, test } from '@playwright/test'
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readDeckText } from '../../src/main/domain/cases/deckSource'
import { loadCase } from '../../src/main/domain/cases/library'
import { SessionFileSchema } from '../../src/main/store/sessionSchema'
import { DIMENSION_IDS } from '../../src/shared/ipc'
import { ROOT } from './launch'
import { answer, driveToReviewMode, launchLibrary, startCase, waitPhase } from './session'

test.describe.configure({ mode: 'serial' })

const FIXTURE_ROOT = join(ROOT, 'tests', 'fixtures', 'cases')
const { brief } = loadCase(FIXTURE_ROOT, '99', readDeckText(FIXTURE_ROOT, '99'))
const DAY = 86_400_000
const OPENING = 'My call is to invest at this price. GRR is 85% and GRR is about 95%.'

function seed(userData: string, id: string, scores: number[], at: number): void {
  const total = scores.reduce((a, b) => a + b, 0)
  const file = SessionFileSchema.parse({
    schemaVersion: 1,
    id,
    caseId: '99',
    startedAt: at - 3_600_000,
    endedAt: at,
    status: 'completed',
    warmup: false,
    machineState: {
      phase: 'reviewMode',
      config: { warmup: false, warmupPosition: 'before', budgetMin: 30, reviewMs: 2_700_000 },
      startedAt: at - 3_600_000,
      reviewDeadline: null,
      reviewWarned: false,
      plan: [],
      omitted: [],
      done: [],
      current: null,
      caps: null,
      turnsInSection: 0,
      failedProbes: 0,
      hintAllowed: false,
      interruptedAnswerId: null,
      endedEarly: false
    },
    transcript: [
      {
        id: 't1',
        speaker: 'candidate',
        phase: 'presentation',
        text: 'I would pass.',
        at: at - 60_000
      },
      { id: 't2', speaker: 'interviewer', phase: 'grilling', text: 'Why?', at: at - 50_000 }
    ],
    controlLog: [],
    timings: [],
    pending: null,
    scorecard: {
      rubric: DIMENSION_IDS.map((d, i) => ({
        id: d,
        dimension: d,
        score: scores[i],
        evidence: [],
        answerKey: '',
        rationale: '',
        unverified: true
      })),
      total,
      band: 'another',
      flags: [],
      keep: 'Clear call',
      fix: `Fix from ${id}`,
      insight: { calledOut: [], missed: [] },
      summary: '',
      evidenceStats: { proposed: 0, verified: 0, dropped: 0 },
      checksSummary: {
        numbersCorrect: 1,
        numbersWrong: 1,
        numbersUnverifiable: 0,
        brevity: { short: 0, brief: 1, ideal: 1, long: 0, flagged: 0 },
        avgAnswerMs: 30_000,
        ledWithCall: false,
        flagsFound: 1,
        flagsHinted: 0,
        flagsTotal: 2
      },
      graderModel: 'fake',
      promptVersion: 'seed',
      scoredAt: at
    }
  })
  const dir = join(userData, 'sessions', id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'session.json'), JSON.stringify(file))
}

test('review mode renders every debrief surface and Trends across 3 sessions', async () => {
  test.setTimeout(120_000)
  const userData = mkdtempSync(join(tmpdir(), 'mcp-e2e-'))
  const now = Date.now()
  seed(userData, 'seed-a', [2, 2, 2, 3, 2, 3], now - 2 * DAY) // 14
  seed(userData, 'seed-b', [3, 3, 3, 3, 3, 4], now - DAY) // 19
  const { app, page } = await launchLibrary({ userData, casesRoot: FIXTURE_ROOT })
  try {
    await startCase(page, '99', { warmup: false, retake: true })
    await page.getByTestId('ready-btn').click()
    await waitPhase(page, 'presentation')
    await answer(page, OPENING)
    await driveToReviewMode(page)
    await expect(page.locator('main[data-screen="reviewMode"]')).toBeVisible()

    // Header
    await expect(page.getByTestId('review-header')).toBeVisible()
    await expect(page.getByTestId('score-total')).toHaveText('18/30')
    await expect(page.getByTestId('score-band')).toHaveAttribute('data-band', 'another')
    for (const id of ['keep', 'fix', 'summary'])
      expect(((await page.getByTestId(id).textContent()) ?? '').trim().length).toBeGreaterThan(0)

    // DOM order: insight -> flag map -> reveal -> rubric -> checks
    const order = await page.evaluate(() => {
      const ids = ['insight-h', 'flags-h', 'reveal-h', 'rubric-h', 'checks-h']
      const els = ids.map((i) => document.getElementById(i)!)
      return els.every(
        (e, i) =>
          i === 0 || !!(els[i - 1].compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING)
      )
    })
    expect(order).toBe(true)

    // Rubric
    const rows = page.getByTestId('rubric-row')
    await expect(rows).toHaveCount(6)
    for (let i = 0; i < 6; i++) {
      await expect(rows.nth(i).getByTestId('score-dots')).toHaveAttribute('aria-label', '3 of 5')
      expect(await rows.nth(i).getByTestId('evidence-quote').count()).toBeGreaterThanOrEqual(1)
    }

    // Flag map
    const flags = page.getByTestId('flag-row')
    await expect(flags).toHaveCount(brief.flags.map.length)
    expect(brief.flags.map.length).toBe(2)
    for (let i = 0; i < 2; i++) {
      expect(await flags.nth(i).getAttribute('data-status')).toMatch(/^(found|hinted|missed)$/)
      await expect(flags.nth(i).getByTestId('flag-where')).toHaveText('Deck: S2')
    }

    // Checks: the opening's two GRR claims, one right (85%) and one wrong (95%, expected 85%)
    await expect(page.getByTestId('led-with-call')).toBeVisible()
    expect(await page.getByTestId('brevity-bar').count()).toBeGreaterThanOrEqual(1)
    await expect(page.getByTestId('brevity-bar').first()).toHaveAttribute('data-band', /.+/)
    await expect(page.locator('[data-testid="numbers-row"][data-correct="true"]')).toHaveCount(1)
    const wrong = page.locator('[data-testid="numbers-row"][data-correct="false"]')
    await expect(wrong).toHaveCount(1)
    await expect(wrong.getByTestId('number-expected')).toHaveText('85%')

    // Reveal
    for (const id of ['intended-read', 'ideal-answer', 'your-opening', 'key-numbers'])
      await expect(page.getByTestId(id)).toBeVisible()
    await expect(page.getByTestId('back-solve')).toContainText('Post-money')
    await expect(page.getByTestId('your-opening')).toContainText('My call is to invest')

    // Transcript: timestamps on every line
    const lines = page.getByTestId('transcript-line')
    const n = await lines.count()
    expect(n).toBeGreaterThan(0)
    await expect(page.getByTestId('transcript-time')).toHaveCount(n)

    // Quote -> transcript highlight
    const quote = page.getByTestId('evidence-quote').first()
    const turn = await quote.getAttribute('data-turn')
    await quote.click()
    const target = page.locator(`[data-testid="transcript-line"][data-turn="${turn}"]`)
    await expect(target).toHaveAttribute('data-highlighted', 'true')
    await expect(target).toBeInViewport()

    // Search
    await page.getByTestId('transcript-search').fill('invest')
    expect(await page.locator('[data-testid="full-transcript"] mark').count()).toBeGreaterThan(0)

    // Trends
    await page.getByTestId('tab-trends').click()
    await expect(page.getByTestId('trends')).toHaveAttribute('data-status', 'ready', {
      timeout: 15_000
    })
    await expect(page.getByTestId('spark-total').getByTestId('sparkline')).toHaveAttribute(
      'data-points',
      '3'
    )
    await expect(page.getByTestId('spark-dim')).toHaveCount(6)
    expect(await page.getByTestId('recurring-weakness').count()).toBeGreaterThanOrEqual(1)
    await expect(page.getByTestId('carried-fix')).toContainText('Fix from seed-b')
    await expect(page.getByTestId('readiness')).toContainText('/30')
    expect(existsSync(join(userData, 'sessions', 'trends.json'))).toBe(true)
  } finally {
    await app.close()
  }
})

test('Trends with a single session says it needs more', async () => {
  test.setTimeout(120_000)
  const { app, page } = await launchLibrary({ casesRoot: FIXTURE_ROOT })
  try {
    await startCase(page, '99', { warmup: false })
    await page.getByTestId('ready-btn').click()
    await waitPhase(page, 'presentation')
    await answer(page, 'My call is to invest.')
    await driveToReviewMode(page)
    await page.getByTestId('tab-trends').click()
    await expect(page.getByTestId('trends')).toHaveAttribute('data-status', 'insufficient')
    await expect(page.getByTestId('trends-insufficient')).toBeVisible()
  } finally {
    await app.close()
  }
})
