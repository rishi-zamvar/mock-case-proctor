import type {} from '../../src/preload/index.d' // Window.api / __e2e globals
// T2: one full session in the BUILT app on replayed Claude (case_99 only) with real HeadTTS.
// RECORD=1 re-records via the proxy using the .env key (never printed).
import { expect, test, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { mergePlan } from '../../src/main/domain/machine/sections'
import { createSentenceSplitter } from '../../src/main/domain/text/sentenceSplitter'
import { parseDotenv } from '../../src/main/keys/dotenv'
import { PROMPT_VERSION } from '../../src/main/review/grader'
import { launch, ROOT } from './launch'
import { sessionFiles, startCase, waitPhase } from './session'

test.setTimeout(600_000)

const MODELS = join(ROOT, 'resources', 'assets', 'models')
const BAD = /Refused to|jsdelivr/i
const RECORD = process.env.RECORD === '1'

const realKey = (): string => {
  const p = join(ROOT, '.env')
  const k = existsSync(p) ? parseDotenv(readFileSync(p, 'utf8')).ANTHROPIC_API_KEY : undefined
  if (!k) throw new Error('RECORD=1 needs ANTHROPIC_API_KEY in .env')
  return k
}

const OPENING =
  'Fixturely sells widget seats to test teams, nine point nine million of ARR growing forty percent. ' +
  'My recommendation is to invest, at the right price. For: strong growth and a product teams use daily. Against: gross retention of eighty five percent is soft. ' +
  'The considerations are retention first, then the industry and how it compares to public comps, then valuation and whether we get to 3x. Happy to dive into each.'

const SCRIPT = [
  'Gross retention is eighty five percent and net retention one hundred four percent for customers live twelve months or more, so expansion barely offsets churn and growth leans on new logos.',
  'Fifteen percent gross churn on nine point nine million of ARR is about one and a half million to replace every year before any growth. I would diligence cohort curves and churn reasons by segment.',
  'Test tooling has a real tailwind as teams ship faster, and once seats are wired into CI the switching cost is meaningful. Public dev-tool comps are the easy anchor for the multiple.',
  'Working back to 3x over five years: if ARR compounds at thirty percent it roughly reaches thirty five million, and at a mid-single-digit exit multiple that supports paying about six to seven times ARR today.',
  'What the deck does not show is the customer concentration, the payback on new logos and the churn split between small and large teams. Those are my first three diligence asks.',
  'So my call: invest, at no more than about seven times ARR, because the retention profile caps what we can pay but the growth and switching costs make it a business worth owning.'
]

const sentences = (text: string): number => {
  const sp = createSentenceSplitter()
  return [...sp.push(text), ...sp.flush()].filter((x) => x.trim()).length
}

const inReviewMode = (page: Page): Promise<boolean> =>
  page.locator('main[data-screen="reviewMode"]').isVisible()
const phaseOf = (page: Page): Promise<string | null> =>
  page
    .locator('main[data-screen="session"]')
    .getAttribute('data-phase', { timeout: 1000 })
    .catch(() => null)

// session.ts answer() with room for a real Claude turn plus real TTS speaking it (its 15 s is T1-sized).
async function answer(page: Page, text: string): Promise<void> {
  const lines = page.locator('[data-testid="transcript"] li')
  const n = await lines.count()
  const phase0 = await phaseOf(page)
  const talk = page.getByTestId('talk-btn')
  await expect(talk).toBeEnabled({ timeout: 60_000 })
  await page.evaluate((t) => window.__e2e!.say(t), text)
  await talk.click()
  await talk.click()
  await expect
    .poll(async () => (await inReviewMode(page)) || (await lines.count()) >= n + 1, {
      timeout: 60_000
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
      { timeout: 90_000 }
    )
    .toBe(true)
}

async function waitReady(page: Page): Promise<void> {
  const probe = (k: 'ttsDevice' | 'ready'): Promise<unknown> =>
    page.evaluate((key) => (window.__voice ? window.__voice[key] : null), k)
  await expect.poll(() => probe('ttsDevice'), { timeout: 30_000 }).toBe('webgpu')
  await expect.poll(() => probe('ready'), { timeout: 60_000 }).toBe(true)
}

test.beforeAll(() => {
  for (const f of [
    'onnx-community/Kokoro-82M-v1.0-ONNX-timestamped/onnx/model.onnx',
    'voices/bm_george.bin',
    'avatars/avatarsdk.glb'
  ])
    if (!existsSync(join(MODELS, f)))
      throw new Error('Voice assets missing: run npm run fetch:voice')
})

test('full replayed-Claude session with real TTS reaches review mode @t2', async () => {
  const { app, page, userData, scenarioKey } = await launch({
    scenario: 'interviewer-e2e',
    env: {
      ANTHROPIC_API_KEY: RECORD ? realKey() : 'e2e-' + randomUUID(),
      CASES_ROOT: process.env.E2E_CASES_ROOT!,
      LLM: 'claude',
      TTS: 'headtts',
      REVIEWER: 'claude'
    }
  })
  const msgs: string[] = []
  page.on('console', (m) => msgs.push(`[${m.type()}] ${m.text()}`))
  page.on('pageerror', (e) => msgs.push(`[pageerror] ${e.message}`))
  try {
    await expect(page.locator('main[data-screen="home"]')).toBeVisible({ timeout: 15_000 })
    await waitReady(page)
    await startCase(page, '99', { warmup: false })
    await page.getByTestId('ready-btn').click()
    await waitPhase(page, 'presentation')
    await answer(page, OPENING)

    // Up to 60 answers; idle polls (TTS still speaking, LLM in flight) are bounded by wall time.
    const deadline = Date.now() + 480_000
    let i = 0
    while (i < 60 && Date.now() < deadline && !(await inReviewMode(page))) {
      if ((await phaseOf(page)) === 'grilling' && (await page.getByTestId('talk-btn').isEnabled()))
        await answer(page, SCRIPT[i++ % SCRIPT.length])
      else await page.waitForTimeout(500)
    }
    await expect(page.locator('main[data-screen="reviewMode"]')).toBeVisible({ timeout: 60_000 })

    // Real (replayed) reviewer scorecard
    await expect(page.getByTestId('score-total')).toHaveText(/^\d+\/30$/)
    await expect(page.getByTestId('rubric-row')).toHaveCount(6)

    const files = sessionFiles(userData)
    expect(files).toHaveLength(1)
    const s = files[0]
    expect(s.openingPlan).toBeDefined()
    expect(s.machineState.omitted).toEqual(mergePlan(s.openingPlan!.order).omitted)
    const sectioned = new Set(s.controlLog.map((e) => e.control.section))
    for (const sec of s.machineState.plan) expect(sectioned.has(sec)).toBe(true)
    expect(s.controlLog.length).toBeGreaterThanOrEqual(s.machineState.plan.length)
    const grill = s.timings.filter((x) => x.kind === 'grill')
    expect(grill.length).toBeGreaterThan(0)
    for (const g of grill) expect(g.firstSentenceAt).toBeDefined()
    for (const t of s.transcript.filter(
      (x) => x.speaker === 'interviewer' && x.phase === 'grilling'
    ))
      expect(sentences(t.text)).toBeLessThanOrEqual(4)

    const r = await fetch(`${process.env.REPLAY_URL}/__log/${encodeURIComponent(scenarioKey)}`)
    const log = (await r.json()) as {
      requests: { method: string; path: string; body: Record<string, unknown> }[]
    }
    // Request 0 is the KeyStore probe (its own cheap model, no system); the rest are the interviewer.
    const posts = log.requests.filter(
      (q) => q.method === 'POST' && q.path.endsWith('/v1/messages') && q.body.system !== undefined
    )
    expect(posts.length).toBeGreaterThan(0)
    for (const p of posts) expect(p.body.model).toBe('claude-opus-5-5')
    const grillReqs = posts.filter((p) => Array.isArray(p.body.tools))
    expect(grillReqs.length).toBeGreaterThanOrEqual(grill.length)
    const sys0 = JSON.stringify(grillReqs[0].body.system)
    for (const p of grillReqs) expect(JSON.stringify(p.body.system)).toBe(sys0)

    const sc = s.scorecard!
    expect(sc).toBeDefined()
    expect(sc.graderModel).toBe('claude-opus-5-5')
    expect(sc.promptVersion).toBe(PROMPT_VERSION)
    expect(sc.evidenceStats.verified).toBeGreaterThanOrEqual(1)
    const reviewer = posts.filter(
      (p) => (p.body.output_config as { format?: unknown } | undefined)?.format !== undefined
    )
    expect(reviewer.length).toBeGreaterThanOrEqual(1)
    expect((reviewer.at(-1)!.body.output_config as { effort?: string }).effort).toBe('high')

    expect(msgs.filter((m) => BAD.test(m))).toEqual([])
  } finally {
    await app.close()
  }
})
