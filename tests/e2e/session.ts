import type {} from '../../src/preload/index.d' // Window.api / __e2e globals
// One-line helpers to drive a session in the built app on fakes (T1).
import { expect, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SessionFileSchema, type SessionFile } from '../../src/main/store/sessionSchema'
import { launch } from './launch'

export async function launchLibrary(
  o: { userData?: string; casesRoot?: string; timeScale?: number } = {}
): Promise<Awaited<ReturnType<typeof launch>>> {
  const l = await launch({
    scenario: 'probe-ok',
    userData: o.userData,
    env: {
      ANTHROPIC_API_KEY: 'e2e-' + randomUUID(),
      CASES_ROOT: o.casesRoot ?? process.env.E2E_CASES_ROOT!,
      ...(o.timeScale ? { E2E_TIME_SCALE: String(o.timeScale) } : {})
    }
  })
  try {
    await expect(l.page.locator('main[data-screen="home"]')).toBeVisible({ timeout: 15_000 })
  } catch (e) {
    await l.app.close()
    throw e
  }
  return l
}

export async function startCase(
  page: Page,
  id: string,
  o: { warmup: boolean; retake?: boolean }
): Promise<void> {
  await page.getByTestId(`${o.retake ? 'retake' : 'start'}-${id}`).click()
  await page.getByTestId('warmup-toggle').setChecked(o.warmup)
  await page.getByTestId('sheet-start').click()
  await expect(page.locator('main[data-screen="session"]')).toBeVisible({ timeout: 15_000 })
}

export async function waitPhase(page: Page, phase: string, timeout = 15_000): Promise<void> {
  await expect(page.locator(`main[data-screen="session"][data-phase="${phase}"]`)).toBeVisible({
    timeout
  })
}

const phaseOf = (page: Page): Promise<string | null> =>
  page
    .locator('main[data-screen="session"]')
    .getAttribute('data-phase', { timeout: 1000 })
    .catch(() => null)

const inReviewMode = (page: Page): Promise<boolean> =>
  page.locator('main[data-screen="reviewMode"]').isVisible()

// say → Talk → Done, then wait for the candidate line and for the interviewer to finish (or the phase to move).
export async function answer(page: Page, text: string): Promise<void> {
  const lines = page.locator('[data-testid="transcript"] li')
  const n = await lines.count()
  const phase0 = await phaseOf(page)
  const talk = page.getByTestId('talk-btn')
  await expect(talk).toBeEnabled({ timeout: 15_000 })
  await page.evaluate((t) => window.__e2e!.say(t), text)
  await talk.click()
  await talk.click()
  await expect
    .poll(async () => (await inReviewMode(page)) || (await lines.count()) >= n + 1, {
      timeout: 15_000
    })
    .toBe(true)
  await expect
    .poll(
      async () => {
        if (await inReviewMode(page)) return true
        const phase = await phaseOf(page)
        if (phase !== phase0) return true
        if (phase0 === 'presentation') return false
        return (
          (await lines.count()) >= n + 2 &&
          (await page.getByTestId('speaking-ring').getAttribute('data-speaking')) === 'false' &&
          (await talk.isEnabled())
        )
      },
      { timeout: 15_000 }
    )
    .toBe(true)
}

// Answers every grilling prompt until the app lands in review mode (bounded).
export async function driveToReviewMode(page: Page): Promise<void> {
  for (let i = 0; i < 40; i++) {
    if (await inReviewMode(page)) return
    if ((await phaseOf(page)) === 'grilling' && (await page.getByTestId('talk-btn').isEnabled()))
      await answer(page, 'Answer ' + i)
    else await page.waitForTimeout(200)
  }
  if (await inReviewMode(page)) return
  throw new Error('review mode not reached within 40 steps')
}

export function sessionFiles(userData: string): SessionFile[] {
  const dir = join(userData, 'sessions')
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== '_quarantine')
    .map((e) => join(dir, e.name, 'session.json'))
    .filter((p) => existsSync(p))
    .map((p) => SessionFileSchema.parse(JSON.parse(readFileSync(p, 'utf8'))))
    .sort((a, b) => a.startedAt - b.startedAt)
}
