import type {} from '../../src/preload/index.d' // Window.api / __e2e / __voice / __mic globals
// QA-03 / VOUT-04 / VOUT-05: the full voice loop in the BUILT app. Real whisper turbo (utilityProcess),
// real HeadTTS, replayed Claude, WAV fixtures injected as the mic via window.__mic.
// @livevoice: the same loop against real Claude, reporting the real-world stop→first-audio total.
import { expect, test, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import { checkConversation } from '../../src/main/agent/messages'
import { createSentenceSplitter } from '../../src/main/domain/text/sentenceSplitter'
import { matches, parseNumbers, type NumberMention } from '../../src/main/domain/text/numbers'
import { parseDotenv } from '../../src/main/keys/dotenv'
import { median, stopToFirstAudio } from '../../src/main/session/latency'
import type { SessionFile } from '../../src/main/store/sessionSchema'
import type { SpeakEvent, SpokenSeq } from '../../src/shared/ipc'
import { launch, ROOT } from './launch'
import { sessionFiles, startCase, waitPhase } from './session'

test.describe.configure({ mode: 'serial' })
test.setTimeout(600_000)

const MODELS = join(ROOT, 'resources', 'assets', 'models')
const AUDIO = join(ROOT, 'tests', 'fixtures', 'audio')
const SILENCE = join(AUDIO, 'silence.wav')
const BAD = /Refused to|jsdelivr/i
test.beforeAll(() => {
  for (const f of [
    'onnx-community/Kokoro-82M-v1.0-ONNX-timestamped/onnx/model.onnx',
    'voices/bm_george.bin',
    'avatars/avatarsdk.glb',
    'whisper/ggml-large-v3-turbo-q5_0.bin'
  ])
    if (!existsSync(join(MODELS, f)))
      throw new Error(`Voice assets missing (${f}): run npm run fetch:voice`)
})

const sentences = (text: string): number => {
  const sp = createSentenceSplitter()
  return [...sp.push(text), ...sp.flush()].filter((x) => x.trim()).length
}
const has = (ms: NumberMention[], value: number, unit: NumberMention['unit']): boolean =>
  ms.some((m) => matches(m, { value, unit, scale: null, raw: '' }))

const phaseOf = (page: Page): Promise<string | null> =>
  page
    .locator('main[data-screen="session"]')
    .getAttribute('data-phase', { timeout: 1000 })
    .catch(() => null)
const inReviewMode = (page: Page): Promise<boolean> =>
  page.locator('main[data-screen="reviewMode"]').isVisible()
const lines = (page: Page): ReturnType<Page['locator']> =>
  page.locator('[data-testid="transcript"] li')
const lastCandidate = (page: Page): Promise<string> =>
  page.locator('[data-testid="transcript"] li[data-speaker="candidate"]').last().innerText()
const seqs = (page: Page): Promise<SpokenSeq[]> =>
  page.evaluate(() => window.__voice?.spokenSeqs ?? [])
const speaks = async (page: Page): Promise<SpeakEvent[]> =>
  (await page.evaluate(() => window.__e2e!.ipcLog()))
    .filter((e) => e.channel === 'speak:sentence')
    .map((e) => e.payload as SpeakEvent)

function watchConsole(page: Page): string[] {
  const msgs: string[] = []
  page.on('console', (m) => msgs.push(`[${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => msgs.push(`[pageerror] ${e.message}`))
  return msgs
}

async function waitReady(page: Page): Promise<void> {
  const probe = (k: 'ttsDevice' | 'ready'): Promise<unknown> =>
    page.evaluate((key) => (window.__voice ? window.__voice[key] : null), k)
  await expect.poll(() => probe('ttsDevice'), { timeout: 30_000 }).toBe('webgpu')
  await expect.poll(() => probe('ready'), { timeout: 60_000 }).toBe(true)
  await expect
    .poll(() => page.evaluate(() => window.api.stt!.status()), { timeout: 90_000 })
    .toBe('metal')
}

const wavB64 = (name: string): string => readFileSync(join(AUDIO, `${name}.wav`)).toString('base64')

// Arm the WAV as the next recording, Talk, let it play out plus 300 ms of trailing silence, Done.
// A MutationObserver records whether the transcribing indicator ever showed (it can be brief).
async function speakWav(page: Page, name: string): Promise<void> {
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
async function waitReply(page: Page, n: number, phase0: string | null): Promise<void> {
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

async function answerWav(page: Page, name: string): Promise<string> {
  const n = await lines(page).count()
  const phase0 = await phaseOf(page)
  await speakWav(page, name)
  await expect.poll(() => lines(page).count(), { timeout: 60_000 }).toBeGreaterThanOrEqual(n + 1)
  const said = await lastCandidate(page)
  await waitReply(page, n, phase0)
  return said
}

function annotateLatency(s: SessionFile): number[] {
  const xs = stopToFirstAudio(s.timings)
  const info = test.info().annotations
  xs.forEach((x, i) => info.push({ type: 'latency-ms', description: `turn ${i}: ${x}` }))
  info.push({ type: 'latency-ms', description: `median: ${median(xs)}` })
  for (const t of s.timings)
    if (t.latency) {
      const l = t.latency
      info.push({
        type: 'stt-ms',
        description:
          `${t.kind}${t.interrupted ? ' (interrupted)' : ''}: stt ${l.transcriptAt - l.stopAt}` +
          ` req +${l.requestAt - l.transcriptAt}` +
          ` delta +${l.firstDeltaAt === undefined ? '-' : l.firstDeltaAt - l.requestAt}` +
          ` sentence +${l.firstSentenceAt === undefined ? '-' : l.firstSentenceAt - l.requestAt}` +
          ` audio ${l.firstAudioAt === undefined ? '-' : l.firstAudioAt - l.stopAt}`
      })
    }
  return xs
}

const lastText = (m: MessageParam): string => {
  if (typeof m.content === 'string') return m.content
  const t = m.content.filter((b) => b.type === 'text').at(-1)
  return t && t.type === 'text' ? t.text : ''
}

test('full voice loop with real STT + TTS and replayed Claude @t2', async () => {
  const { app, page, userData, scenarioKey, stdio } = await launch({
    scenario: 'interviewer-e2e',
    env: {
      ANTHROPIC_API_KEY: 'e2e-' + randomUUID(),
      CASES_ROOT: process.env.E2E_CASES_ROOT!,
      LLM: 'claude',
      TTS: 'headtts',
      STT: 'whisper',
      FAKE_AUDIO_WAV: SILENCE
    }
  })
  const msgs = watchConsole(page)
  try {
    // a. Ready: TTS on WebGPU and whisper on Metal.
    await expect(page.locator('main[data-screen="home"]')).toBeVisible({ timeout: 15_000 })
    await waitReady(page)

    // b. Opening by voice (~32 s, exercises the chunk path).
    await startCase(page, '99', { warmup: false })
    await page.getByTestId('ready-btn').click()
    await waitPhase(page, 'presentation')
    const n0 = await lines(page).count()
    await speakWav(page, 'opening')
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as unknown as { __sawTranscribing: boolean }).__sawTranscribing
          ),
        {
          timeout: 60_000
        }
      )
      .toBe(true)
    await expect(page.getByTestId('transcribing')).toHaveCount(0, { timeout: 60_000 })
    await expect.poll(() => lines(page).count(), { timeout: 60_000 }).toBeGreaterThan(n0)
    const opening = await lastCandidate(page)
    expect(opening.trim().length).toBeGreaterThan(0)
    expect(has(parseNumbers(opening), 40, 'pct'), opening).toBe(true)

    // c. Grilling: first reply, then finance numbers, then retention.
    await waitPhase(page, 'grilling', 120_000)
    await waitReply(page, (await lines(page).count()) - 2, 'grilling')
    const finance = parseNumbers(await answerWav(page, 'finance'))
    expect(has(finance, 540e6, 'usd'), JSON.stringify(finance)).toBe(true)
    expect(has(finance, 87, 'pct'), JSON.stringify(finance)).toBe(true)
    expect(has(finance, 48, 'pct'), JSON.stringify(finance)).toBe(true)
    await answerWav(page, 'retention')

    // d. Silent answer: no candidate line, the "didn't catch that" line is spoken.
    const nSilent = await lines(page).count()
    await speakWav(page, 'silence')
    await page.waitForTimeout(5_000)
    expect(await lines(page).count()).toBe(nSilent)
    expect((await speaks(page)).some((e) => e.text.includes('catch that'))).toBe(true)
    await expect(page.getByTestId('speaking-ring')).toHaveAttribute('data-speaking', 'false', {
      timeout: 30_000
    })

    // e. Barge-in mid-reply: wait for sentence 0 to finish with more still playing.
    let cutTurn: string | null = null
    const retries = ['diligence', 'tooling', 'gaps'] as const
    for (let i = 0; i < retries.length && !cutTurn; i++) {
      const mark = (await speaks(page)).length
      const n = await lines(page).count()
      await speakWav(page, retries[i])
      await expect
        .poll(() => lines(page).count(), { timeout: 60_000 })
        .toBeGreaterThanOrEqual(n + 1)
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
    expect(cutTurn, 'no multi-sentence reply to barge into after 3 answers').not.toBeNull()
    const nCut = await lines(page).count()
    await page.evaluate((b) => window.__mic!.load(b), wavB64('short'))
    const bargeMs = await page.evaluate(async () => {
      const t0 = performance.now()
      document.querySelector<HTMLButtonElement>('[data-testid="talk-btn"]')!.click()
      while (window.__voice!.isSpeaking && performance.now() - t0 < 1000)
        await new Promise((r) => setTimeout(r, 0))
      return performance.now() - t0
    })
    test.info().annotations.push({ type: 'barge-in-ms', description: bargeMs.toFixed(1) })
    expect(bargeMs).toBeLessThanOrEqual(200)
    await page.evaluate(() => window.__mic!.ended())
    await page.waitForTimeout(300)
    await page.getByTestId('talk-btn').click()
    await expect(
      page.locator('[data-testid="transcript"] li[data-speaker="candidate"]').last()
    ).toContainText(/cohort/i, { timeout: 60_000 })
    expect(await lines(page).count()).toBeGreaterThan(nCut)
    await waitReply(page, nCut, 'grilling')

    // f. End.
    const spokenAtEnd = await seqs(page)
    await page.getByTestId('end-btn').click()
    await page.getByTestId('end-confirm').click()
    await expect(page.locator('main[data-screen="reviewMode"]')).toBeVisible({ timeout: 60_000 })

    // g. Session file: truthful interrupted line, ordered stamps, latency gate.
    const files = sessionFiles(userData)
    expect(files).toHaveLength(1)
    const s = files[0]
    const cut = s.timings.find((t) => t.turnId === cutTurn)
    expect(cut?.interrupted).toBe(true)
    const done = spokenAtEnd.filter((x) => x.turnId === cutTurn && x.endedAt !== null).length
    const line = s.transcript.find((t) => t.id === cutTurn && t.speaker === 'interviewer')
    if (done === 0) expect(line).toBeUndefined()
    else expect(sentences(line!.text)).toBe(done)
    for (const t of s.timings)
      if (t.latency) {
        expect(t.latency.stopAt).toBeLessThanOrEqual(t.latency.transcriptAt)
        expect(t.latency.transcriptAt).toBeLessThanOrEqual(t.latency.requestAt)
      }
    const xs = annotateLatency(s)
    expect(xs.length).toBeGreaterThanOrEqual(3)
    expect(median(xs)!).toBeLessThanOrEqual(3000)

    // h. The request after the barge-in alternates and carries the truthful '[interrupted]' line.
    const log = (await (
      await fetch(`${process.env.REPLAY_URL}/__log/${encodeURIComponent(scenarioKey)}`)
    ).json()) as { requests: { method: string; path: string; body: Record<string, unknown> }[] }
    const grill = log.requests
      .filter((q) => q.method === 'POST' && Array.isArray(q.body.tools))
      .map((q) => q.body.messages as MessageParam[])
    const after = grill.find((m) =>
      m.some((x) => x.role === 'assistant' && lastText(x).endsWith('[interrupted]'))
    )
    expect(after, 'no request carried an [interrupted] assistant line').toBeDefined()
    expect(checkConversation(after!)).toEqual([])
    expect(after!.at(-2)!.role).toBe('assistant')
    expect(lastText(after!.at(-2)!).endsWith('[interrupted]')).toBe(true)
    expect(after!.at(-1)!.role).toBe('user')

    // i. Privacy + CSP.
    expect(stdio()).not.toMatch(/back solve|backsolve|cohort curves/i)
    expect(msgs.filter((m) => BAD.test(m))).toEqual([])
  } finally {
    await app.close()
  }
})

test('live real-world stop→first-audio @livevoice', async () => {
  test.skip(process.env.LIVE_VOICE !== '1', 'set LIVE_VOICE=1 (real Claude, small spend)')
  const p = join(ROOT, '.env')
  const key = existsSync(p) ? parseDotenv(readFileSync(p, 'utf8')).ANTHROPIC_API_KEY : undefined
  test.skip(!key, 'no ANTHROPIC_API_KEY in .env')
  const { app, page, userData } = await launch({
    live: true,
    env: {
      ANTHROPIC_API_KEY: key!,
      CASES_ROOT: process.env.E2E_CASES_ROOT!,
      LLM: 'claude',
      TTS: 'headtts',
      STT: 'whisper',
      FAKE_AUDIO_WAV: SILENCE
    }
  })
  try {
    await expect(page.locator('main[data-screen="home"]')).toBeVisible({ timeout: 30_000 })
    await waitReady(page)
    await startCase(page, '99', { warmup: false })
    await page.getByTestId('ready-btn').click()
    await waitPhase(page, 'presentation')
    await speakWav(page, 'opening')
    await waitPhase(page, 'grilling', 180_000)
    await waitReply(page, (await lines(page).count()) - 2, 'grilling')
    for (const name of ['retention', 'diligence']) {
      if (await inReviewMode(page)) break
      await answerWav(page, name)
    }
    if (!(await inReviewMode(page))) {
      await page.getByTestId('end-btn').click()
      await page.getByTestId('end-confirm').click()
    }
    await expect(page.locator('main[data-screen="reviewMode"]')).toBeVisible({ timeout: 120_000 })
    annotateLatency(sessionFiles(userData)[0]) // reports only: model choice is Rishi's call
  } finally {
    await app.close()
  }
})
