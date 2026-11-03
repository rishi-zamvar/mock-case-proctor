import type {} from '../../src/preload/index.d' // Window.api / __e2e / __voice globals
// T2: real HeadTTS (Kokoro on WebGPU) + TalkingHead in the BUILT app under the real CSP, fake LLM.
import { expect, test, type Page } from '@playwright/test'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { SpeakEvent, SpokenSeq } from '../../src/shared/ipc'
import { ROOT } from './launch'
import { launchLibrary, startCase, waitPhase } from './session'

test.describe.configure({ mode: 'serial' })
test.setTimeout(120_000)

const CASE = '99'
const MODELS = join(ROOT, 'resources', 'assets', 'models')
const BAD = /Refused to|jsdelivr/i
const T2 = { env: { TTS: 'headtts' } }

test.beforeAll(() => {
  for (const f of [
    'onnx-community/Kokoro-82M-v1.0-ONNX-timestamped/onnx/model.onnx',
    'voices/bm_george.bin',
    'avatars/avatarsdk.glb'
  ])
    if (!existsSync(join(MODELS, f)))
      throw new Error('Voice assets missing: run npm run fetch:voice')
})

function watchConsole(page: Page): string[] {
  const msgs: string[] = []
  page.on('console', (m) => msgs.push(`[${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => msgs.push(`[pageerror] ${e.message}`))
  return msgs
}
const assertClean = (msgs: string[]): void => expect(msgs.filter((m) => BAD.test(m))).toEqual([])

type Probe = NonNullable<Window['__voice']>
type Field = Exclude<keyof Probe, 'opaqueFraction' | 'audition'>
const probe = <K extends Field>(page: Page, k: K): Promise<Probe[K] | null> =>
  page.evaluate((key) => (window.__voice ? window.__voice[key as Field] : null), k) as Promise<
    Probe[K] | null
  >
const opaque = (page: Page): Promise<number> =>
  page.evaluate(() => window.__voice?.opaqueFraction() ?? 0)
const seqs = (page: Page): Promise<SpokenSeq[]> =>
  page.evaluate(() => window.__voice?.spokenSeqs ?? [])
const speaks = async (page: Page): Promise<SpeakEvent[]> =>
  (await page.evaluate(() => window.__e2e!.ipcLog()))
    .filter((e) => e.channel === 'speak:sentence')
    .map((e) => e.payload as SpeakEvent)

async function waitReady(page: Page): Promise<void> {
  await expect.poll(() => probe(page, 'ttsDevice'), { timeout: 30_000 }).toBe('webgpu')
  await expect.poll(() => probe(page, 'ready'), { timeout: 60_000 }).toBe(true)
}

test('speaks a sentence lip-synced on WebGPU @t2', async () => {
  const { app, page } = await launchLibrary(T2)
  const msgs = watchConsole(page)
  try {
    const t0 = Date.now()
    await waitReady(page)
    test.info().annotations.push({ type: 'ready-ms', description: String(Date.now() - t0) })
    await startCase(page, CASE, { warmup: true })

    await expect.poll(() => probe(page, 'isSpeaking'), { timeout: 15_000 }).toBe(true)
    await expect
      .poll(async () => (await seqs(page)).find((s) => s.seq === 0)?.endedAt ?? null, {
        timeout: 30_000
      })
      .not.toBeNull()
    expect(await probe(page, 'visemeCount')).toBeGreaterThan(0)
    await expect.poll(() => opaque(page), { timeout: 5_000 }).toBeGreaterThan(0.05)
    await expect(page.getByTestId('transcript')).toContainText('thanks for making the time', {
      timeout: 15_000
    })
    const shot = test.info().outputPath('avatar-stage.png')
    await page.getByTestId('avatar-stage').screenshot({ path: shot })
    await test.info().attach('avatar-stage', { path: shot, contentType: 'image/png' })

    // Let the whole opening turn finish before answering.
    const talk = page.getByTestId('talk-btn')
    await expect(talk).toBeEnabled({ timeout: 30_000 })
    await expect(page.getByTestId('speaking-ring')).toHaveAttribute('data-speaking', 'false', {
      timeout: 30_000
    })
    const lines = page.locator('[data-testid="transcript"] li')
    const n = await lines.count()
    const logStart = ((await probe(page, 'stateLog')) ?? []).length

    await page.evaluate(() => window.__e2e!.say('Good week, thanks.'))
    await talk.click()
    const samples: { state: string; speaking: boolean }[] = []
    for (let i = 0; i < 6; i++) {
      samples.push(
        await page.evaluate(() => ({
          state: window.__voice!.avatarState,
          speaking: window.__voice!.isSpeaking
        }))
      )
      await page.waitForTimeout(50)
    }
    await talk.click()
    await expect.poll(() => lines.count(), { timeout: 15_000 }).toBeGreaterThanOrEqual(n + 2)
    await expect(page.getByTestId('speaking-ring')).toHaveAttribute('data-speaking', 'false', {
      timeout: 30_000
    })
    expect(samples.some((s) => s.state === 'listening')).toBe(true)
    expect(samples.filter((s) => s.state === 'listening' && s.speaking)).toEqual([])

    const after = ((await probe(page, 'stateLog')) ?? []).slice(logStart)
    const iL = after.indexOf('listening')
    const iT = after.indexOf('thinking', iL)
    const iS = after.indexOf('speaking', iT)
    expect({ after, ordered: iL >= 0 && iT > iL && iS > iT }).toMatchObject({ ordered: true })

    await page.getByTestId('skip-warmup').click()
    await waitPhase(page, 'review')
    await expect(page.getByTestId('avatar-stage')).toHaveCount(0)
    await page.getByTestId('ready-btn').click()
    await waitPhase(page, 'presentation')
    await expect(page.getByTestId('avatar-stage')).toBeVisible()
    await expect(page.locator('[data-testid="avatar-slot"] canvas')).toHaveCount(1)
    expect(await probe(page, 'instances')).toBe(1)
    assertClean(msgs)
  } finally {
    await app.close()
  }
})

test('cancel stops playback with no stale audio @t2', async () => {
  const { app, page } = await launchLibrary(T2)
  const msgs = watchConsole(page)
  try {
    await waitReady(page)
    await startCase(page, CASE, { warmup: true })
    await expect.poll(() => probe(page, 'isSpeaking'), { timeout: 15_000 }).toBe(true)
    const turnId = (await seqs(page)).at(-1)!.turnId

    await page.getByTestId('skip-warmup').click()
    const ms = await page.evaluate(async () => {
      const t0 = performance.now()
      while (window.__voice!.isSpeaking && performance.now() - t0 < 1000)
        await new Promise((r) => setTimeout(r, 5))
      return performance.now() - t0
    })
    const cancelAt = Date.now()
    expect(ms).toBeLessThan(200)
    const log = await page.evaluate(() => window.__e2e!.ipcLog())
    expect(
      log.some(
        (e) => e.channel === 'speak:cancel' && (e.payload as { turnId: string }).turnId === turnId
      )
    ).toBe(true)

    await page.waitForTimeout(2_000)
    const stale = (await seqs(page)).filter((s) => s.turnId === turnId && s.startedAt > cancelAt)
    expect(stale).toEqual([])
    expect(await probe(page, 'isSpeaking')).toBe(false)
    assertClean(msgs)
  } finally {
    await app.close()
  }
})

test('speaks the T-10 warning while the deck is shown @t2', async () => {
  const { app, page } = await launchLibrary({ timeScale: 600, ...T2 })
  const msgs = watchConsole(page)
  try {
    await waitReady(page)
    await startCase(page, CASE, { warmup: false })
    await waitPhase(page, 'review')
    await expect(page.getByTestId('deck-viewer')).toBeVisible()
    let warn: SpeakEvent | undefined
    await expect
      .poll(async () => (warn = (await speaks(page)).find((s) => s.text === 'Ten minutes left.')), {
        timeout: 30_000
      })
      .toBeDefined()
    await expect
      .poll(
        async () => {
          const s = (await seqs(page)).find((x) => x.turnId === warn!.turnId)
          return !!s && s.visemes > 0 && s.endedAt !== null
        },
        { timeout: 30_000 }
      )
      .toBe(true)
    assertClean(msgs)
  } finally {
    await app.close()
  }
})

test('forced WebGPU fallback shows the banner @t2', async () => {
  const { app, page } = await launchLibrary(T2)
  const msgs = watchConsole(page)
  try {
    await app
      .context()
      .addInitScript(() =>
        Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined })
      )
    await page.reload()
    await expect(page.getByTestId('voice-banner')).toBeVisible({ timeout: 60_000 })
    expect(['wasm', 'none']).toContain(await probe(page, 'ttsDevice'))
    assertClean(msgs)
  } finally {
    await app.close()
  }
})
