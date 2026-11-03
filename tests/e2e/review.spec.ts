import type {} from '../../src/preload/index.d' // Window.api / __e2e globals
// Phase 4 review block (FLOW-03): deck viewer, page memory, deadline-driven countdown, T-10 warning, auto-advance.
import { expect, test } from '@playwright/test'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './launch'
import { deckCanvasPainted, launchLibrary, sessionFiles, startCase, waitPhase } from './session'

test.describe.configure({ mode: 'serial' })

const BAD =
  /Content Security Policy|Refused to|API version|Worker version|fake worker|Failed to load module script/i

test('deck renders through app:// with the bundled worker', async () => {
  const { app, page } = await launchLibrary()
  const msgs: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') msgs.push(m.text())
  })
  page.on('pageerror', (e) => msgs.push(e.message))
  try {
    await startCase(page, '99', { warmup: false })
    await waitPhase(page, 'review')
    const viewer = page.getByTestId('deck-viewer')
    const indicator = page.getByTestId('deck-page-indicator')
    await expect(viewer).toHaveAttribute('data-pages', '4', { timeout: 15_000 })
    await expect(indicator).toHaveText('Prompt')
    await expect.poll(() => deckCanvasPainted(page), { timeout: 10_000 }).toBe(true)

    await page.keyboard.press('PageDown')
    await expect(indicator).toHaveText('p. 1 / 3')
    await page.keyboard.press('ArrowRight')
    await expect(indicator).toHaveText('p. 2 / 3')
    await page.keyboard.press('ArrowLeft')
    await expect(indicator).toHaveText('p. 1 / 3')

    await page.getByTestId('thumbs-toggle').click()
    await expect(page.getByTestId('deck-thumbs')).toBeHidden()
    await expect(page.getByTestId('thumbs-toggle')).toHaveAttribute('aria-expanded', 'false')

    await page.keyboard.press('Meta+Equal')
    await expect(viewer).toHaveAttribute('data-zoom', '1.25')
    await page.keyboard.press('Meta+Minus')
    await expect(viewer).toHaveAttribute('data-zoom', '1')

    expect(msgs.filter((m) => BAD.test(m))).toEqual([])
    const assets = readdirSync(join(ROOT, 'out', 'renderer', 'assets'))
    expect(assets.some((f) => /^pdf\.worker.*\.m?js$/.test(f))).toBe(true)
  } finally {
    await app.close()
  }
})

test('deck page is remembered for the session', async () => {
  const { app, page, userData } = await launchLibrary()
  try {
    await startCase(page, '99', { warmup: false })
    await waitPhase(page, 'review')
    await expect(page.getByTestId('deck-viewer')).toHaveAttribute('data-pages', '4', {
      timeout: 15_000
    })
    await page.getByTestId('thumb-3').click()
    await expect(page.getByTestId('deck-page-indicator')).toHaveText('p. 2 / 3')
    await expect.poll(() => sessionFiles(userData)[0]?.deckPage, { timeout: 10_000 }).toBe(3)

    await page.getByTestId('ready-btn').click()
    await waitPhase(page, 'presentation')
    await expect(page.getByTestId('avatar-stage')).toBeVisible()
    await page.getByTestId('deck-toggle').click()
    await expect(page.getByTestId('deck-viewer')).toBeVisible()
    await expect(page.getByTestId('deck-page-indicator')).toHaveText('p. 2 / 3', {
      timeout: 15_000
    })
    await page.getByTestId('deck-toggle').click()
    await expect(page.getByTestId('avatar-stage')).toBeVisible()
  } finally {
    await app.close()
  }
})

const toSec = (t: string): number => {
  const [m, s] = t.split(':').map(Number)
  return m * 60 + s
}

test('countdown is deadline-driven, warns once at T-10 and starts the presentation at T-0', async () => {
  test.setTimeout(60_000)
  const SCALE = 300
  const TICK_MS = 250 // Session.tsx countdown interval
  const { app, page, userData, stdio } = await launchLibrary({ timeScale: SCALE })
  try {
    await startCase(page, '99', { warmup: false })
    await waitPhase(page, 'review')
    const main = page.locator('main[data-screen="session"]')
    const samples: { t: number; sec: number | null; warned: boolean }[] = []
    for (let i = 0; i < 400; i++) {
      if ((await main.getAttribute('data-phase').catch(() => null)) !== 'review') break
      const text = await page
        .getByTestId('countdown')
        .textContent({ timeout: 200 })
        .catch(() => null)
      const warned = await page.getByTestId('review-warning').isVisible()
      samples.push({
        t: Date.now(),
        sec: text && /^\d+:\d\d$/.test(text) ? toSec(text) : null,
        warned
      })
      await page.waitForTimeout(100)
    }
    const timed = samples.filter((s) => s.sec !== null) as {
      t: number
      sec: number
      warned: boolean
    }[]
    expect(timed.length).toBeGreaterThanOrEqual(30)
    for (let i = 1; i < timed.length; i++) {
      const drop = timed[i - 1].sec - timed[i].sec
      expect(drop, `sample ${i} never goes up`).toBeGreaterThanOrEqual(0)
      // The renderer repaints every TICK_MS, so one sample can absorb one whole tick of catch-up.
      const dt = timed[i].t - timed[i - 1].t + TICK_MS
      expect(drop, `sample ${i} skips at most the scaled dt`).toBeLessThanOrEqual(
        Math.ceil((dt * SCALE) / 1000) + 2
      )
      // No drift: the countdown tracks the wall clock from the first sample within one tick.
      const expected = timed[0].sec - ((timed[i].t - timed[0].t) * SCALE) / 1000
      expect(
        Math.abs(timed[i].sec - expected),
        `sample ${i} tracks the deadline`
      ).toBeLessThanOrEqual(Math.ceil((2 * TICK_MS * SCALE) / 1000) + 2)
    }
    const firstWarn = timed.find((s) => s.warned)
    expect(firstWarn, 'warning visible in at least one sample').toBeDefined()
    expect(firstWarn!.sec).toBeLessThanOrEqual(600)
    expect(firstWarn!.sec).toBeGreaterThanOrEqual(300)
    let rises = 0
    for (let i = 1; i < samples.length; i++)
      if (!samples[i - 1].warned && samples[i].warned) rises++
    expect(rises).toBeLessThanOrEqual(1)

    await waitPhase(page, 'presentation')
    expect(stdio().split('review warning').length - 1).toBe(1)
    expect(sessionFiles(userData)[0].machineState.reviewWarned).toBe(true)
  } finally {
    await app.close()
  }
})

test('Ready skips straight to the presentation', async () => {
  const { app, page, userData } = await launchLibrary()
  try {
    await startCase(page, '99', { warmup: false })
    await page.getByTestId('ready-btn').click()
    await waitPhase(page, 'presentation', 5_000)
    expect(sessionFiles(userData)[0].deckPage).toBeUndefined()
  } finally {
    await app.close()
  }
})
