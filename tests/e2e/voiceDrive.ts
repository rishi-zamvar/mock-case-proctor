import type {} from '../../src/preload/index.d' // Window.api / __e2e / __voice / __mic globals
// Shared voice-loop drivers (WAV fixtures injected as the mic via window.__mic). Used by voiceloop.t2 and signoff.t3.
import { expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SpeakEvent, SpokenSeq } from '../../src/shared/ipc'
import { ROOT } from './launch'

const AUDIO = join(ROOT, 'tests', 'fixtures', 'audio')
export const BAD = /Refused to|jsdelivr/i

export const phaseOf = (page: Page): Promise<string | null> =>
  page
    .locator('main[data-screen="session"]')
    .getAttribute('data-phase', { timeout: 1000 })
    .catch(() => null)
export const inReviewMode = (page: Page): Promise<boolean> =>
  page.locator('main[data-screen="reviewMode"]').isVisible()
export const lines = (page: Page): ReturnType<Page['locator']> =>
  page.locator('[data-testid="transcript"] li')
export const lastCandidate = (page: Page): Promise<string> =>
  page.locator('[data-testid="transcript"] li[data-speaker="candidate"]').last().innerText()
export const seqs = (page: Page): Promise<SpokenSeq[]> =>
  page.evaluate(() => window.__voice?.spokenSeqs ?? [])
export const speaks = async (page: Page): Promise<SpeakEvent[]> =>
  (await page.evaluate(() => window.__e2e!.ipcLog()))
    .filter((e) => e.channel === 'speak:sentence')
    .map((e) => e.payload as SpeakEvent)

export function watchConsole(page: Page): string[] {
  const msgs: string[] = []
  page.on('console', (m) => msgs.push(`[${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => msgs.push(`[pageerror] ${e.message}`))
  return msgs
}

export async function waitReady(page: Page): Promise<void> {
  const probe = (k: 'ttsDevice' | 'ready'): Promise<unknown> =>
    page.evaluate((key) => (window.__voice ? window.__voice[key] : null), k)
  await expect.poll(() => probe('ttsDevice'), { timeout: 30_000 }).toBe('webgpu')
  await expect.poll(() => probe('ready'), { timeout: 60_000 }).toBe(true)
  await expect
    .poll(() => page.evaluate(() => window.api.stt!.status()), { timeout: 90_000 })
    .toBe('metal')
}

export const wavB64 = (name: string): string =>
  readFileSync(join(AUDIO, `${name}.wav`)).toString('base64')

// Arm the WAV as the next recording, Talk, let it play out plus 300 ms of trailing silence, Done.
// A MutationObserver records whether the transcribing indicator ever showed (it can be brief).
export async function speakWav(page: Page, name: string): Promise<void> {
  const talk = page.getByTestId('talk-btn')
  await expect(talk).toBeEnabled({ timeout: 90_000 })
  await page.evaluate((b) => window.__mic!.load(b), wavB64(name))
  await talk.click()
  await page.evaluate(() => window.__mic!.ended())
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    const w = window as unknown as { __sawTranscribing: boolean }
    w.__sawTranscribing = false
    const seen = (): boolean => !!document.querySelector('[data-testid="transcribing"]')
    const mo = new MutationObserver(() => {
      if (seen()) {
        w.__sawTranscribing = true
        mo.disconnect()
      }
    })
    mo.observe(document.body, { childList: true, subtree: true, attributes: true })
  })
  await talk.click()
}

// interviewer.t2's answer-wait: the reply line landed, speaking ended and Talk is back (or the phase moved).
export async function waitReply(page: Page, n: number, phase0: string | null): Promise<void> {
  await expect
    .poll(
      async () => {
        if (await inReviewMode(page)) return true
        const phase = await phaseOf(page)
        if (phase !== phase0) return true
        return (
          (await lines(page).count()) >= n + 2 &&
          (await page.getByTestId('speaking-ring').getAttribute('data-speaking')) === 'false' &&
          (await page.getByTestId('talk-btn').isEnabled())
        )
      },
      { timeout: 120_000 }
    )
    .toBe(true)
}

export async function answerWav(page: Page, name: string): Promise<string> {
  const n = await lines(page).count()
  const phase0 = await phaseOf(page)
  await speakWav(page, name)
  await expect.poll(() => lines(page).count(), { timeout: 60_000 }).toBeGreaterThanOrEqual(n + 1)
  const said = await lastCandidate(page)
  await waitReply(page, n, phase0)
  return said
}

// Answer each WAV until a reply's sentence 0 has ended with more still playing, then Talk with the
// `short` WAV loaded and time how long until speech stops. Leaves the barge-in answer submitted;
// nCut is the transcript line count just before the barge-in.
export async function bargeInto(
  page: Page,
  retries: readonly string[]
): Promise<{ cutTurn: string; bargeMs: number; nCut: number }> {
  let cutTurn: string | null = null
  for (let i = 0; i < retries.length && !cutTurn; i++) {
    const mark = (await speaks(page)).length
    const n = await lines(page).count()
    await speakWav(page, retries[i])
    await expect.poll(() => lines(page).count(), { timeout: 60_000 }).toBeGreaterThanOrEqual(n + 1)
    const deadline = Date.now() + 120_000
    while (Date.now() < deadline) {
      const st = await page.evaluate(() => ({
        speaking: window.__voice!.isSpeaking,
        seqs: window.__voice!.spokenSeqs
      }))
      const fresh = new Set((await speaks(page)).slice(mark).map((e) => e.turnId))
      const t = [...fresh].at(-1)
      if (
        t &&
        st.speaking &&
        st.seqs.some((s) => s.turnId === t && s.seq === 0 && s.endedAt !== null)
      ) {
        cutTurn = t
        break
      }
      // Reply finished without a second sentence to cut into: answer again.
      if (
        t &&
        !st.speaking &&
        (await lines(page).count()) >= n + 2 &&
        (await page.getByTestId('talk-btn').isEnabled())
      )
        break
      await page.waitForTimeout(25)
    }
  }
  if (!cutTurn)
    throw new Error(`no multi-sentence reply to barge into after ${retries.length} answers`)
  const nCut = await lines(page).count()
  await page.evaluate((b) => window.__mic!.load(b), wavB64('short'))
  const bargeMs = await page.evaluate(async () => {
    const t0 = performance.now()
    document.querySelector<HTMLButtonElement>('[data-testid="talk-btn"]')!.click()
    while (window.__voice!.isSpeaking && performance.now() - t0 < 1000)
      await new Promise((r) => setTimeout(r, 0))
    return performance.now() - t0
  })
  await page.evaluate(() => window.__mic!.ended())
  await page.waitForTimeout(300)
  await page.getByTestId('talk-btn').click()
  return { cutTurn, bargeMs, nCut }
}
