import type {} from '../../src/preload/index.d' // Window.api / __e2e / __voice / __mic globals
// QA-03 / VOUT-04 / VOUT-05: the full voice loop in the BUILT app. Real whisper turbo (utilityProcess),
// real HeadTTS, replayed Claude, WAV fixtures injected as the mic via window.__mic.
// @livevoice: the same loop against real Claude, reporting the real-world stop→first-audio total.
import { expect, test } from '@playwright/test'
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
import { launch, ROOT } from './launch'
import { sessionFiles, startCase, waitPhase } from './session'
import {
  answerWav,
  BAD,
  bargeInto,
  inReviewMode,
  lastCandidate,
  lines,
  seqs,
  speakWav,
  speaks,
  waitReady,
  waitReply,
  watchConsole
} from './voiceDrive'

test.describe.configure({ mode: 'serial' })
test.setTimeout(600_000)

const MODELS = join(ROOT, 'resources', 'assets', 'models')
const AUDIO = join(ROOT, 'tests', 'fixtures', 'audio')
const SILENCE = join(AUDIO, 'silence.wav')
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
    const { cutTurn, bargeMs, nCut } = await bargeInto(page, ['diligence', 'tooling', 'gaps'])
    test.info().annotations.push({ type: 'barge-in-ms', description: bargeMs.toFixed(1) })
    expect(bargeMs).toBeLessThanOrEqual(200)
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
