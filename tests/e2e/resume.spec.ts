import type {} from '../../src/preload/index.d' // Window.api / __e2e globals
// Resilience (FLOW-07): SIGKILL mid-session, relaunch, resume or discard; corrupt files are quarantined.
import { expect, test, type Page } from '@playwright/test'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  answer,
  driveToReviewMode,
  launchLibrary,
  sessionFiles,
  startCase,
  waitPhase
} from './session'

test.describe.configure({ mode: 'serial' })

const transcript = (page: Page): ReturnType<Page['locator']> =>
  page.locator('[data-testid="transcript"] li')

// Start 99 without warm-up and answer up to the start of grilling.
async function toGrilling(page: Page): Promise<void> {
  await startCase(page, '99', { warmup: false })
  await waitPhase(page, 'review')
  await page.getByTestId('ready-btn').click()
  await waitPhase(page, 'presentation')
  await answer(page, 'My call is to invest at this price. Retention first, then valuation.')
  await waitPhase(page, 'grilling')
}

test('crash mid-grilling resumes from the last saved turn', async () => {
  test.setTimeout(120_000)
  const first = await launchLibrary()
  const { userData } = first
  await toGrilling(first.page)
  await answer(first.page, 'Retention is strong')
  await answer(first.page, 'Valuation looks fair')
  const n = await transcript(first.page).count()
  expect(sessionFiles(userData)[0].transcript.length).toBe(n) // saved after every turn
  first.app.process().kill('SIGKILL')

  const second = await launchLibrary({ userData })
  try {
    const banner = second.page.getByTestId('resume-banner')
    await expect(banner).toContainText('Fixturely')
    await expect(banner).toContainText('grilling')
    await second.page.getByTestId('resume-btn').click()
    await waitPhase(second.page, 'grilling')
    await expect(transcript(second.page)).toHaveCount(n)
    await driveToReviewMode(second.page)
    const files = sessionFiles(userData)
    expect(files).toHaveLength(1)
    expect(files[0].status).toBe('completed')
    expect(files[0].transcript.length).toBeGreaterThan(n)
  } finally {
    await second.app.close()
  }
})

test('a turn in flight at the crash is re-requested on resume', async () => {
  test.setTimeout(120_000)
  const first = await launchLibrary()
  const { userData } = first
  await toGrilling(first.page)
  const talk = first.page.getByTestId('talk-btn')
  await expect(talk).toBeEnabled({ timeout: 15_000 })
  await expect(first.page.getByTestId('speaking-ring')).toHaveAttribute('data-speaking', 'false')
  const before = await transcript(first.page).count()
  await first.page.evaluate(() => window.__e2e!.say('Churn is the main risk'))
  await talk.click()
  await talk.click()
  // The runner saves the candidate turn before pushing the view: a visible line is a saved line.
  await expect
    .poll(() => transcript(first.page).count(), { timeout: 15_000 })
    .toBeGreaterThan(before)
  first.app.process().kill('SIGKILL')

  const saved = sessionFiles(userData)[0]
  expect(saved.transcript.at(-1)?.speaker).toBe('candidate') // the reply was still in flight
  const second = await launchLibrary({ userData })
  try {
    await second.page.getByTestId('resume-btn').click()
    await waitPhase(second.page, 'grilling')
    await expect
      .poll(() => transcript(second.page).count(), { timeout: 15_000 })
      .toBeGreaterThan(saved.transcript.length)
    await expect(transcript(second.page).last()).toHaveAttribute('data-speaker', 'interviewer')
    await driveToReviewMode(second.page)
    expect(sessionFiles(userData)[0].status).toBe('completed')
  } finally {
    await second.app.close()
  }
})

test('discard abandons the interrupted session', async () => {
  const first = await launchLibrary()
  const { userData } = first
  await startCase(first.page, '99', { warmup: false })
  await waitPhase(first.page, 'review')
  first.app.process().kill('SIGKILL')

  const second = await launchLibrary({ userData })
  try {
    await second.page.getByTestId('discard-btn').click()
    await expect(second.page.getByTestId('resume-banner')).toHaveCount(0)
    expect(sessionFiles(userData)[0].status).toBe('abandoned')
    await expect(second.page.getByTestId('case-card-99')).toHaveAttribute(
      'data-completed',
      'false'
    )
  } finally {
    await second.app.close()
  }
})

test('corrupt session files are quarantined, not loaded', async () => {
  const userData = await mkdtemp(join(tmpdir(), 'mcp-e2e-'))
  const sessions = join(userData, 'sessions')
  for (const [id, body] of [
    ['bad1', '{not json'],
    ['bad2', '{"schemaVersion":2}']
  ]) {
    mkdirSync(join(sessions, id), { recursive: true })
    writeFileSync(join(sessions, id, 'session.json'), body)
  }

  const first = await launchLibrary({ userData })
  try {
    await expect(first.page.getByTestId('quarantine-notice')).toHaveText(
      '2 corrupt session file(s) were set aside.'
    )
    await expect(first.page.getByTestId('case-card-99')).toBeVisible()
    expect(readdirSync(join(sessions, '_quarantine'))).toHaveLength(2)
    expect(existsSync(join(sessions, 'bad1', 'session.json'))).toBe(false)
    await first.page.getByTestId('open-settings').click()
    await first.page.getByTestId('back-btn').click()
    await expect(first.page.getByTestId('case-card-99')).toBeVisible()
    await expect(first.page.getByTestId('quarantine-notice')).toHaveCount(0) // reported once
  } finally {
    await first.app.close()
  }

  const second = await launchLibrary({ userData })
  try {
    await expect(second.page.getByTestId('case-card-99')).toBeVisible()
    await expect(second.page.getByTestId('quarantine-notice')).toHaveCount(0)
    await expect(second.page.getByTestId('resume-banner')).toHaveCount(0)
  } finally {
    await second.app.close()
  }
})
