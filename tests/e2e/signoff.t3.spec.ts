import type {} from '../../src/preload/index.d' // Window.api / __e2e / __voice / __mic globals
// Phase 9 sign-off (QA-04) on the PACKAGED .app: two live sessions (case_99 + case 02) with real
// whisper, HeadTTS and Claude, an offline network tap, and a 3-session memory soak on fakes.
// Run via `npm run test:t3`. Never prints the key, transcript or brief text; the results file is numbers/enums only.
import { expect, test, type ElectronApplication } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { readDeckText } from '../../src/main/domain/cases/deckSource'
import { loadCase } from '../../src/main/domain/cases/library'
import { parseDotenv } from '../../src/main/keys/dotenv'
import { latencyStages, median, p90, type LatencyStages } from '../../src/main/session/latency'
import { launch, ROOT } from './launch'
import { answer, driveToReviewMode, sessionFiles, startCase, waitPhase } from './session'
import { assertTapClean } from './tap'
import {
  answerWav,
  BAD,
  bargeInto,
  inReviewMode,
  lines,
  speakWav,
  waitReady,
  waitReply,
  watchConsole
} from './voiceDrive'

test.describe.configure({ mode: 'serial' })
test.setTimeout(900_000)

const APP_BIN = join(
  ROOT,
  'release/mac-arm64/Mock Case Proctor.app/Contents/MacOS/Mock Case Proctor'
)
const AUDIO = join(ROOT, 'tests', 'fixtures', 'audio')
const RESULTS = join(ROOT, '.planning', 'phases', '09-packaged-live-sign-off', 't3-results.json')
const ENV_FILE = join(ROOT, '.env')
const KEY = existsSync(ENV_FILE)
  ? parseDotenv(readFileSync(ENV_FILE, 'utf8')).ANTHROPIC_API_KEY
  : undefined
const hasPdftotext = ((): boolean => {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()

test.skip(!existsSync(APP_BIN), 'run npm run test:t3')

// Read-modify-write so each test adds its own key.
function mergeResults(key: string, value: unknown): void {
  const cur = existsSync(RESULTS)
    ? (JSON.parse(readFileSync(RESULTS, 'utf8')) as Record<string, unknown>)
    : {}
  cur[key] = value
  writeFileSync(RESULTS, JSON.stringify(cur, null, 2) + '\n')
}

const stats = (s: LatencyStages): Record<string, { median: number | null; p90: number | null }> =>
  Object.fromEntries(Object.entries(s).map(([k, xs]) => [k, { median: median(xs), p90: p90(xs) }]))

type G = { __net: string[]; __mainHosts: string[] }

// Logs every renderer request (session webRequest) and every main-process fetch host (the SDK
// resolves globalThis.fetch per client, and compose builds one client per session after this runs).
async function installNetTap(app: ElectronApplication): Promise<void> {
  await app.evaluate(({ session }) => {
    const g = globalThis as unknown as G
    g.__net = []
    session.defaultSession.webRequest.onBeforeRequest((d, cb) => {
      g.__net.push(d.url)
      cb({})
    })
    const f = globalThis.fetch
    g.__mainHosts = []
    globalThis.fetch = (i, o) => {
      g.__mainHosts.push(
        new URL(typeof i === 'string' ? i : i instanceof URL ? i.href : i.url).host
      )
      return f(i, o)
    }
  })
}

async function liveSession(
  caseId: string,
  wavs: { opening: string; wrongGrr: string; barge: string[]; answers: string[] }
): Promise<void> {
  test.skip(!KEY, 'no ANTHROPIC_API_KEY in .env')
  const casesRoot = process.env.E2E_CASES_ROOT!
  const { app, page, userData, stdio } = await launch({
    executablePath: APP_BIN,
    live: true,
    env: {
      ANTHROPIC_API_KEY: KEY!,
      CASES_ROOT: casesRoot,
      LLM: 'claude',
      STT: 'whisper',
      TTS: 'headtts',
      REVIEWER: 'claude',
      FAKE_AUDIO_WAV: join(AUDIO, 'silence.wav')
    }
  })
  try {
    const home = page.locator('main[data-screen="home"]')
    await expect(home).toBeVisible({ timeout: 30_000 })
    await installNetTap(app)
    await page.reload()
    await expect(home).toBeVisible({ timeout: 30_000 })
    const msgs = watchConsole(page)

    // Whisper on Metal, HeadTTS on WebGPU, native whisper.node from app.asar.unpacked.
    await waitReady(page)
    const ttsDevice = await page.evaluate(() => window.__voice?.ttsDevice ?? null)
    const sttStatus = await page.evaluate(() => window.api.stt!.status())
    const utils = await app.evaluate(({ app }) =>
      app
        .getAppMetrics()
        .filter((m) => m.type === 'Utility')
        .map((m) => ({ pid: m.pid, name: m.name, serviceName: m.serviceName }))
    )
    const stt = utils.find((u) => u.serviceName === 'stt-worker' || u.name === 'stt-worker')
    expect(stt, 'stt-worker utility process').toBeDefined()
    const open = execFileSync('lsof', ['-p', String(stt!.pid)], { encoding: 'utf8' })
    expect(open).toContain('app.asar.unpacked')
    expect(open).toContain('whisper.node')

    // Full session: opening, wrong GRR, barge-in, more answers, review mode.
    await startCase(page, caseId, { warmup: false })
    await page.getByTestId('ready-btn').click()
    await waitPhase(page, 'presentation')
    await speakWav(page, wavs.opening)
    await waitPhase(page, 'grilling', 180_000)
    await waitReply(page, (await lines(page).count()) - 2, 'grilling')
    await answerWav(page, wavs.wrongGrr)
    const { bargeMs } = await bargeInto(page, wavs.barge)
    for (const name of wavs.answers) {
      if (await inReviewMode(page)) break
      await answerWav(page, name)
    }
    if (!(await inReviewMode(page))) {
      await page.getByTestId('end-btn').click()
      await page.getByTestId('end-confirm').click()
    }
    await expect(page.locator('main[data-screen="reviewMode"]')).toBeVisible({ timeout: 300_000 })

    // Scorecard, flag map, GRR pushback, interrupted turn.
    await expect(page.getByTestId('score-total')).toHaveText(/^\d+\/30$/, { timeout: 60_000 })
    const s = sessionFiles(userData)[0]
    const sc = s.scorecard!
    expect(sc, 'persisted scorecard').toBeDefined()
    expect(sc.total).toBeGreaterThanOrEqual(6)
    expect(sc.total).toBeLessThanOrEqual(30)
    expect(sc.evidenceStats.verified).toBeGreaterThanOrEqual(1)
    expect(await page.getByTestId('flag-row').count()).toBeGreaterThanOrEqual(1)
    expect(
      s.controlLog.some((c) => c.control.numbers_checked?.some((n) => n.correct === false)),
      'GRR pushback logged'
    ).toBe(true)
    expect(s.timings.some((t) => t.interrupted === true)).toBe(true)

    // Barrier, console, key hygiene.
    const { brief } = loadCase(casesRoot, caseId, readDeckText(casesRoot, caseId))
    await assertTapClean(page, brief)
    expect(msgs.filter((m) => BAD.test(m))).toEqual([])
    expect(msgs.filter((m) => m.startsWith('[pageerror]') || m.includes('Uncaught'))).toEqual([])
    expect(stdio().includes(KEY!), 'key never in stdio').toBe(false)

    // Offline: no remote renderer request; main talks only to api.anthropic.com.
    const net = await app.evaluate(() => {
      const g = globalThis as unknown as G
      return { urls: g.__net, hosts: g.__mainHosts }
    })
    expect(net.urls.filter((u) => /^(https?|wss?):/i.test(u))).toEqual([])
    expect([...new Set(net.hosts)]).toEqual(['api.anthropic.com'])

    const stages = latencyStages(s.timings)
    mergeResults(`case_${caseId}`, {
      at: new Date().toISOString(),
      stages,
      stats: stats(stages),
      bargeMs,
      ttsDevice,
      sttStatus,
      total: sc.total,
      band: sc.band,
      evidenceStats: sc.evidenceStats,
      graderModel: sc.graderModel ?? null,
      turns: s.timings.length
    })
  } finally {
    await app.close()
  }
}

test('T3 live packaged session: case_99', { tag: '@t3' }, async () => {
  await liveSession('99', {
    opening: 'opening',
    wrongGrr: 'wrong_grr',
    barge: ['diligence', 'tooling', 'gaps'],
    answers: ['retention', 'finance']
  })
})

test('T3 live packaged session: case 02 PawsHub', { tag: '@t3' }, async () => {
  test.skip(
    process.env.E2E_REAL_LIBRARY !== '1' || !hasPdftotext,
    'needs the real library and pdftotext'
  )
  // Live only: launch({ live: true }) has no replay server, so the real case is never recorded.
  await liveSession('02', {
    opening: 'paws_opening',
    wrongGrr: 'wrong_grr',
    barge: ['paws_retention', 'paws_industry', 'paws_diligence'],
    answers: ['paws_valuation', 'paws_diligence']
  })
})

test('T3 memory soak: 3 back-to-back sessions', { tag: '@t3' }, async () => {
  const { app, page } = await launch({
    executablePath: APP_BIN,
    scenario: 'probe-ok',
    env: {
      ANTHROPIC_API_KEY: 'e2e-' + randomUUID(),
      CASES_ROOT: process.env.E2E_CASES_ROOT!,
      TTS: 'headtts'
    }
  })
  try {
    await expect(page.locator('main[data-screen="home"]')).toBeVisible({ timeout: 30_000 })
    // TTS-only ready (STT is fake here).
    await expect
      .poll(() => page.evaluate(() => window.__voice?.ttsDevice ?? null), { timeout: 30_000 })
      .toBe('webgpu')
    await expect
      .poll(() => page.evaluate(() => window.__voice?.ready ?? null), { timeout: 60_000 })
      .toBe(true)

    const samples: { main: number; renderer: number; gpu: number | null }[] = []
    for (let i = 0; i < 3; i++) {
      if (i > 0) await page.getByTestId('back-to-library').click()
      await startCase(page, '99', { warmup: false, retake: i > 0 })
      await page.getByTestId('ready-btn').click()
      await waitPhase(page, 'presentation')
      await answer(page, 'My call is to invest at this price. Retention first, then valuation.')
      await waitPhase(page, 'grilling')
      await driveToReviewMode(page, 600) // HeadTTS speaks every fake reply (~8 s/turn)
      await page.waitForTimeout(3_000)
      samples.push(
        await app.evaluate(({ app }) => {
          const ms = app.getAppMetrics()
          const ws = (t: string): number[] =>
            ms.filter((m) => m.type === t).map((m) => m.memory.workingSetSize)
          return {
            main: ws('Browser')[0],
            renderer: Math.max(...ws('Tab')),
            gpu: ws('GPU')[0] ?? null
          }
        })
      )
    }
    mergeResults('soak', { at: new Date().toISOString(), unit: 'KB', samples })
    expect(samples[2].renderer / samples[0].renderer).toBeLessThan(1.25)
    expect(samples[2].main / samples[0].main).toBeLessThan(1.25)
    expect(await page.evaluate(() => window.__voice?.instances)).toBe(1)
  } finally {
    await app.close()
  }
})
