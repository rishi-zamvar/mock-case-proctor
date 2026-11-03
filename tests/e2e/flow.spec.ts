import type {} from '../../src/preload/index.d' // Window.api / __e2e globals
// T1 flow suite (QA-02, LIB-01, LIB-02, FLOW-08, REV-05): the built app on fake LLM, STT, TTS and clock.
// Assertions compare booleans and counts only: brief text never reaches the test log.
import { expect, test, type Page } from '@playwright/test'
import { join } from 'node:path'
import { readDeckText } from '../../src/main/domain/cases/deckSource'
import { listCases, loadCase } from '../../src/main/domain/cases/library'
import { ROOT } from './launch'
import {
  answer,
  driveToReviewMode,
  launchLibrary,
  sessionFiles,
  startCase,
  waitPhase
} from './session'

test.describe.configure({ mode: 'serial' })

const FIXTURE_ROOT = join(ROOT, 'tests', 'fixtures', 'cases')
const { brief } = loadCase(FIXTURE_ROOT, '99', readDeckText(FIXTURE_ROOT, '99'))
const casesRoot = (): string => process.env.E2E_CASES_ROOT!
const transcript = (page: Page): ReturnType<Page['locator']> =>
  page.locator('[data-testid="transcript"] li')
const interviewerLines = (page: Page): ReturnType<Page['locator']> =>
  page.locator('[data-testid="transcript"] li[data-speaker="interviewer"]')

// Set by the full-session test so the greyed/Retake test can reopen the same profile.
let finishedUserData: string | null = null

test('library lists every case with only candidate-safe fields', async () => {
  const { app, page } = await launchLibrary()
  try {
    const expected = listCases(casesRoot())
    const cards = page.locator('[data-testid^="case-card-"]')
    await expect(cards).toHaveCount(expected.length)
    for (const c of expected) {
      const card = page.getByTestId(`case-card-${c.id}`)
      const text = (await card.textContent()) ?? ''
      const label = (await card.locator('button').textContent()) ?? ''
      const body = text.slice(0, text.length - label.length)
      const want = `Case ${String(c.number).padStart(2, '0')}Level ${c.level}${c.company}${c.vertical}`
      expect(body === want, `card ${c.id} shows exactly its four fields`).toBe(true)
      expect(text.includes(c.slug), `card ${c.id} hides its slug`).toBe(false)
      expect(/pdf/i.test(text), `card ${c.id} hides file names`).toBe(false)
    }
    if (process.env.E2E_REAL_LIBRARY === '1') {
      const ids = expected.map((c) => c.id)
      expect(ids).toEqual([
        ...Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')),
        '99'
      ])
    }
  } finally {
    await app.close()
  }
})

test('library path is configurable', async () => {
  const { app, page } = await launchLibrary({ casesRoot: FIXTURE_ROOT })
  try {
    await expect(page.locator('[data-testid^="case-card-"]')).toHaveCount(1)
    await expect(page.getByTestId('case-card-99')).toBeVisible()
  } finally {
    await app.close()
  }
})

test('full session walks every screen', async () => {
  test.setTimeout(120_000)
  const { app, page, userData } = await launchLibrary()
  try {
    await startCase(page, '99', { warmup: true })

    // Warm-up
    await waitPhase(page, 'warmup')
    await expect(interviewerLines(page)).toHaveCount(1, { timeout: 15_000 })
    await answer(page, 'Pretty good, thanks')
    await expect(interviewerLines(page)).toHaveCount(2, { timeout: 15_000 })
    await page.getByTestId('skip-warmup').click()

    // Review
    await waitPhase(page, 'review')
    await expect(page.getByTestId('deck-viewer')).toBeVisible()
    await expect(page.getByTestId('countdown')).toHaveText(/^4[45]:\d\d$/)
    await expect(page.getByTestId('webcam-tile')).toBeVisible()
    await page.getByTestId('ready-btn').click()

    // Presentation
    await waitPhase(page, 'presentation')
    await answer(page, 'My call is to invest at this price. Retention first, then valuation.')

    // Grilling
    await waitPhase(page, 'grilling')
    await expect(page.getByTestId('section-label')).toBeVisible()
    await driveToReviewMode(page)

    // Review mode
    await expect(page.locator('main[data-screen="reviewMode"]')).toBeVisible()
    await expect(page.getByTestId('rubric-row')).toHaveCount(6)
    await expect(page.getByTestId('score-total')).toHaveText('18/30')
    await expect(page.getByTestId('flag-row')).toHaveCount(brief.flags.map.length)
    const ideal = await page.locator('[data-testid="ideal-answer"] p').textContent()
    expect(ideal === brief.idealAnswer, 'ideal answer matches the brief').toBe(true)
    await expect(page.getByTestId('your-opening')).toContainText('My call is to invest')
    const shown = await page.locator('[data-testid="full-transcript"] li').count()
    const shownInterviewer = await page
      .locator('[data-testid="full-transcript"] li[data-speaker="interviewer"]')
      .count()
    await page.getByTestId('tab-trends').click()
    // One scored session: Trends needs two.
    await expect(page.getByTestId('trends')).toHaveAttribute('data-status', 'insufficient')

    // On disk (REV-05)
    const files = sessionFiles(userData)
    expect(files).toHaveLength(1)
    const f = files[0]
    expect(f.status).toBe('completed')
    expect(f.endedAt).toBeDefined()
    expect(f.transcript).toHaveLength(shown)
    expect(f.controlLog.length).toBeGreaterThanOrEqual(7)
    expect(f.timings.filter((t) => t.kind !== 'score')).toHaveLength(shownInterviewer)
    expect(f.scorecard?.total).toBe(18)
    expect(f.machineState.phase).toBe('reviewMode')
    finishedUserData = userData
  } finally {
    await app.close()
  }
})

test('completed case is greyed and Retake starts fresh', async () => {
  test.setTimeout(120_000)
  expect(finishedUserData, 'full-session test ran first').not.toBeNull()
  const userData = finishedUserData!
  const before = sessionFiles(userData)[0]
  const { app, page } = await launchLibrary({ userData })
  try {
    const card = page.getByTestId('case-card-99')
    await expect(card).toHaveAttribute('data-completed', 'true')
    const opacity = await card.evaluate((el) => Number(getComputedStyle(el).opacity))
    expect(opacity).toBeLessThan(0.6)
    await expect(page.getByTestId('completed-99')).toHaveText(
      /^Completed \w{3} \d{1,2}, \d{4} · 18\/30$/
    )

    await startCase(page, '99', { warmup: false, retake: true })
    await waitPhase(page, 'review')
    await expect(transcript(page)).toHaveCount(0)

    await expect.poll(() => sessionFiles(userData).length, { timeout: 10_000 }).toBe(2)
    const [older, newer] = sessionFiles(userData)
    expect(older.id).toBe(before.id)
    expect(older.status).toBe('completed')
    expect(older.transcript).toEqual(before.transcript)
    expect(newer.status).toBe('active')
  } finally {
    await app.close()
  }
})

test('back to library from review mode shows the greyed card', async () => {
  test.setTimeout(120_000)
  const { app, page } = await launchLibrary({ casesRoot: FIXTURE_ROOT })
  try {
    await startCase(page, '99', { warmup: false })
    await page.getByTestId('ready-btn').click()
    await waitPhase(page, 'presentation')
    await answer(page, 'My call is to invest.')
    await driveToReviewMode(page)
    await page.getByTestId('back-to-library').click()
    await expect(page.locator('main[data-screen="home"]')).toBeVisible()
    await expect(page.getByTestId('case-card-99')).toHaveAttribute('data-completed', 'true')
    await expect(page.getByTestId('retake-99')).toBeVisible()
  } finally {
    await app.close()
  }
})

test('ending early from grilling still produces a scorecard', async () => {
  test.setTimeout(120_000)
  const { app, page, userData } = await launchLibrary()
  try {
    await startCase(page, '99', { warmup: false })
    await page.getByTestId('ready-btn').click()
    await waitPhase(page, 'presentation')
    await answer(page, 'My call is to pass.')
    await waitPhase(page, 'grilling')
    await answer(page, 'One answer')

    await page.getByTestId('end-btn').click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page.getByTestId('end-cancel').click()
    await expect(page.getByRole('alertdialog')).toBeHidden()
    await waitPhase(page, 'grilling')
    await page.getByTestId('end-btn').click()
    await page.getByTestId('end-confirm').click()

    await expect(page.locator('main[data-screen="reviewMode"]')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByTestId('ended-early')).toBeVisible()
    await expect(page.getByTestId('score-total')).toBeVisible()
    const [f] = sessionFiles(userData)
    expect(f.machineState.endedEarly).toBe(true)
    expect(f.status).toBe('completed')
    expect(f.scorecard).toBeDefined()
  } finally {
    await app.close()
  }
})

test('review deadline advances on its own under E2E_TIME_SCALE', async () => {
  const { app, page } = await launchLibrary({ timeScale: 600 })
  try {
    await startCase(page, '99', { warmup: false })
    await expect(page.getByTestId('countdown')).toBeVisible()
    await waitPhase(page, 'presentation', 15_000)
  } finally {
    await app.close()
  }
})

test('Space toggles Talk', async () => {
  const { app, page } = await launchLibrary()
  try {
    await startCase(page, '99', { warmup: false })
    await page.getByTestId('ready-btn').click()
    await waitPhase(page, 'presentation')
    await expect(page.getByTestId('talk-btn')).toBeEnabled()
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
    await page.evaluate((t) => window.__e2e!.say(t), 'Spoken by keyboard')
    await page.keyboard.press('Space')
    await expect(page.getByTestId('talk-btn')).toHaveText('Done')
    await page.keyboard.press('Space')
    await expect(
      page.locator('[data-testid="transcript"] li[data-speaker="candidate"]')
    ).toHaveCount(1, { timeout: 15_000 })
    await expect(page.locator('main[data-screen="session"]')).not.toHaveAttribute(
      'data-phase',
      'presentation',
      { timeout: 15_000 }
    )
  } finally {
    await app.close()
  }
})
