import type {} from '../../src/preload/index.d' // Window.api / __e2e globals
// Phase 4 media (VIN-05, VOUT-06): mic check, silent mic, mirrored never-recorded webcam tile, display awake.
import { expect, test } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './launch'
import { launchLibrary, startCase, waitPhase } from './session'

test.describe.configure({ mode: 'serial' })

// Chromium creates kIOPMAssertionTypeNoDisplaySleep, the legacy alias of PreventUserIdleDisplaySleep.
const DISPLAY_SLEEP = /PreventUserIdleDisplaySleep|NoDisplaySleepAssertion/
const SILENCE = join(ROOT, 'tests', 'fixtures', 'audio', 'silence.wav')

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]
  )
}

test('mic check meter moves for the fake WAV mic', async () => {
  const { app, page } = await launchLibrary()
  try {
    await page.getByTestId('start-99').click()
    await expect(page.getByTestId('setup-check')).toBeVisible()
    const peak = (): Promise<number> =>
      page
        .getByTestId('mic-level')
        .getAttribute('data-peak')
        .then((v) => Number(v))
    await expect.poll(peak, { timeout: 8_000 }).toBeGreaterThan(0.1)
    await page.waitForTimeout(4_000)
    await expect(page.getByTestId('mic-silent')).toHaveCount(0)
    await expect(page.getByTestId('webcam-tile')).toHaveAttribute('data-state', 'live', {
      timeout: 8_000
    })
    test.info().annotations.push({ type: 'mic peak', description: String(await peak()) })
  } finally {
    await app.close()
  }
})

test('a silent mic is flagged', async () => {
  const { app, page } = await launchLibrary({ env: { FAKE_AUDIO_WAV: SILENCE } })
  try {
    await page.getByTestId('start-99').click()
    await expect(page.getByTestId('mic-silent')).toBeVisible({ timeout: 8_000 })
    await expect(page.getByTestId('mic-silent')).toContainText("We can't hear you")
    await page.getByTestId('sheet-start').click()
    await expect(page.locator('main[data-screen="session"]')).toBeVisible({ timeout: 15_000 })
  } finally {
    await app.close()
  }
})

test('webcam tile is a mirrored live self-view that stops with the session', async () => {
  const { app, page, userData } = await launchLibrary()
  try {
    await startCase(page, '99', { warmup: false })
    const tile = page.getByTestId('webcam-tile')
    await expect(tile).toHaveAttribute('data-state', 'live', { timeout: 8_000 })
    await expect(tile).toContainText('You')
    const video = page.getByTestId('webcam-video')
    await expect
      .poll(() => video.evaluate((el: HTMLVideoElement) => el.videoWidth))
      .toBeGreaterThan(0)
    const info = await video.evaluate((el: HTMLVideoElement) => {
      const s = el.srcObject as MediaStream
      return {
        transform: getComputedStyle(el).transform,
        state: s.getVideoTracks()[0]?.readyState,
        audio: s.getAudioTracks().length
      }
    })
    expect(info).toEqual({ transform: 'matrix(-1, 0, 0, 1, 0, 0)', state: 'live', audio: 0 })

    // Keep a handle on the live track so we can prove it is stopped, not just hidden.
    const trackState = (): Promise<string> =>
      page.evaluate(
        () => (window as unknown as { __camTrack: MediaStreamTrack }).__camTrack.readyState
      )
    await video.evaluate((el: HTMLVideoElement) => {
      ;(window as unknown as { __camTrack: MediaStreamTrack }).__camTrack = (
        el.srcObject as MediaStream
      ).getVideoTracks()[0]
    })
    await page.getByTestId('cam-toggle').click()
    await expect(page.getByTestId('camera-off')).toBeVisible()
    await expect(video).toHaveCount(0)
    await expect.poll(trackState).toBe('ended')
    await page.getByTestId('cam-toggle').click()
    await expect(tile).toHaveAttribute('data-state', 'live', { timeout: 8_000 })
    await video.evaluate((el: HTMLVideoElement) => {
      ;(window as unknown as { __camTrack: MediaStreamTrack }).__camTrack = (
        el.srcObject as MediaStream
      ).getVideoTracks()[0]
    })

    await page.getByTestId('end-btn').click()
    await page.getByTestId('end-confirm').click()
    await expect(page.locator('main[data-screen="reviewMode"]')).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('webcam-video')).toHaveCount(0)
    await expect.poll(trackState).toBe('ended')
    const media = walk(userData).filter((f) =>
      /\.(webm|mp4|mkv|mov|wav|ogg|m4a|png|jpe?g)$/i.test(f)
    )
    expect(media).toEqual([])
  } finally {
    await app.close()
  }
})

test('the display stays awake during a session', async () => {
  const { app, page, stdio } = await launchLibrary()
  try {
    await startCase(page, '99', { warmup: false })
    await waitPhase(page, 'review')
    await expect.poll(() => stdio().includes('awake hold'), { timeout: 10_000 }).toBe(true)
    const pid = app.process().pid
    const held = (): string[] =>
      execFileSync('pmset', ['-g', 'assertions'], { encoding: 'utf8' })
        .split('\n')
        .filter((l) => DISPLAY_SLEEP.test(l) && l.includes('pid '))
    await expect
      .poll(() => held().some((l) => l.includes(`pid ${pid}(`)), {
        timeout: 10_000,
        message: `display-sleep assertion held by pid ${pid}`
      })
      .toBe(true)

    await page.getByTestId('end-btn').click()
    await page.getByTestId('end-confirm').click()
    await expect(page.locator('main[data-screen="reviewMode"]')).toBeVisible({ timeout: 30_000 })
    await expect.poll(() => stdio().includes('awake release'), { timeout: 10_000 }).toBe(true)
    await expect
      .poll(() => held().some((l) => l.includes(`pid ${pid}(`)), { timeout: 10_000 })
      .toBe(false)
  } finally {
    await app.close()
  }
})
