import type {} from '../../src/preload/index.d' // Window.api / __e2e globals
// Information barrier in the built app: the IPC tap sees no interviewer content before review mode
// (BAR-01) and app:// serves only interviewee PDFs (BAR-02). Brief text is never printed.
import { expect, test, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { InterviewerBrief } from '../../src/main/domain/cases/brief'
import { readDeckText } from '../../src/main/domain/cases/deckSource'
import { DEFAULT_LIBRARY_ROOT, loadCase } from '../../src/main/domain/cases/library'
import { checkUtterance } from '../../src/main/domain/text/leakGuard'
import { ROOT } from './launch'
import { answer, driveToReviewMode, launchLibrary, startCase, waitPhase } from './session'

test.describe.configure({ mode: 'serial' })

const FIXTURE_ROOT = join(ROOT, 'tests', 'fixtures', 'cases')
const hasPdftotext = ((): boolean => {
  try {
    execFileSync('pdftotext', ['-v'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()
const REAL =
  process.env.E2E_REAL_LIBRARY === '1' &&
  hasPdftotext &&
  existsSync(join(DEFAULT_LIBRARY_ROOT, 'case_02_pawshub'))

function* leaves(x: unknown): Generator<string> {
  if (typeof x === 'string') yield x
  else if (Array.isArray(x)) for (const v of x) yield* leaves(v)
  else if (x && typeof x === 'object') for (const v of Object.values(x)) yield* leaves(v)
}

// Interviewer-only strings of 4+ words, lower-cased, tagged with their field kind.
function distinctive(b: InterviewerBrief): { kind: string; text: string }[] {
  const out: { kind: string; text: string }[] = []
  const add = (kind: string, v: unknown): void => {
    if (typeof v === 'string' && v.trim().split(/\s+/).length >= 4)
      out.push({ kind, text: v.toLowerCase() })
  }
  add('idealAnswer', b.idealAnswer)
  Object.values(b.modelAnswer).forEach((v) => add('modelAnswer', v))
  b.flags.map.forEach((f) => (add('flag', f.flag), add('flagSay', f.say)))
  b.flags.hidden.forEach((h) => add('hiddenFlag', (h as { flag?: unknown })?.flag))
  b.rubric.forEach((r) => (add('rubricFive', r.five), add('rubricOne', r.one)))
  add('intendedRead', b.intendedRead.sentence)
  b.whatItTests.forEach((w) => add('whatItTests', w.evidence))
  return out
}

async function assertTapClean(page: Page, brief: InterviewerBrief): Promise<void> {
  const log = await page.evaluate(() => window.__e2e!.ipcLog())
  const cut = log.findIndex(
    (e) =>
      e.channel === 'view:state' && (e.payload as { phase?: string } | null)?.phase === 'reviewMode'
  )
  expect(cut, 'the tap saw review mode').toBeGreaterThan(0)
  const pre = log.slice(0, cut)
  const channels = new Set(pre.map((e) => e.channel))
  for (const ch of ['library:list', 'session:start', 'view:state', 'speak:sentence'])
    expect(channels.has(ch), `tap recorded ${ch}`).toBe(true)
  expect(pre.length).toBeGreaterThanOrEqual(30)

  const dist = distinctive(brief)
  expect(dist.length, 'distinctive strings exist').toBeGreaterThan(0)
  const failures: string[] = []
  pre.forEach((e, i) => {
    if (e.channel === 'view:state' && (e.payload as { reveal?: unknown }).reveal !== null)
      failures.push(`${e.channel}#${i}: reveal before review mode`)
    for (const leaf of leaves(e.payload)) {
      const g = checkUtterance(leaf, brief)
      if (!g.ok) failures.push(`${e.channel}#${i}: guard ${g.reason}`)
      const low = leaf.toLowerCase()
      const hit = dist.find((d) => low.includes(d.text))
      if (hit) failures.push(`${e.channel}#${i}: ${hit.kind}`)
    }
  })
  expect(failures, 'no interviewer content before review mode').toEqual([])

  // Positive control: the tap does see the reveal once review mode starts.
  const post = log.slice(cut).flatMap((e) => [...leaves(e.payload)])
  expect(
    post.some((l) => l === brief.idealAnswer),
    'reveal visible after the cut'
  ).toBe(true)
}

test('IPC tap: no interviewer content before review mode (fixture case)', async () => {
  test.setTimeout(120_000)
  const { brief } = loadCase(FIXTURE_ROOT, '99', readDeckText(FIXTURE_ROOT, '99'))
  const { app, page } = await launchLibrary()
  try {
    await startCase(page, '99', { warmup: true })
    await waitPhase(page, 'warmup')
    await answer(page, 'Pretty good, thanks')
    await page.getByTestId('skip-warmup').click()
    await waitPhase(page, 'review')
    await page.getByTestId('ready-btn').click()
    await waitPhase(page, 'presentation')
    await answer(page, 'My call is to invest at this price. Retention first, then valuation.')
    await waitPhase(page, 'grilling')
    await driveToReviewMode(page)
    await assertTapClean(page, brief)
  } finally {
    await app.close()
  }
})

test('IPC tap on a real case', async () => {
  test.skip(!REAL, 'needs the real library and pdftotext')
  test.setTimeout(120_000)
  const { brief } = loadCase(DEFAULT_LIBRARY_ROOT, '02', readDeckText(DEFAULT_LIBRARY_ROOT, '02'))
  const { app, page } = await launchLibrary()
  try {
    await startCase(page, '02', { warmup: false })
    await waitPhase(page, 'review')
    await page.getByTestId('ready-btn').click()
    await waitPhase(page, 'presentation')
    await answer(page, 'My call is to pass at this price. Unit economics first, then valuation.')
    await waitPhase(page, 'grilling')
    await driveToReviewMode(page)
    await assertTapClean(page, brief)
  } finally {
    await app.close()
  }
})

test('app:// serves only interviewee PDFs', async () => {
  const B = 'app://bundle/'
  const refused = [
    'cases/99/interviewer.pdf',
    'cases/99/case_99_fixture_interviewer_package.pdf',
    'cases/99/%2e%2e/case_99_fixture_interviewer_package.pdf',
    'cases/9/interviewee.pdf',
    'cases/abc/interviewee.pdf',
    'cases/77/interviewee.pdf',
    'cases/99/interviewee.pdf/',
    'cases/',
    ...(REAL ? ['cases/02/case_02_pawshub_interviewer_package.pdf'] : [])
  ].map((p) => B + p)
  const { app, page } = await launchLibrary()
  try {
    const get = (u: string): Promise<{ status: number; type: string; pdf: boolean }> =>
      page.evaluate(async (url) => {
        try {
          const r = await fetch(url)
          const head = r.ok ? new TextDecoder().decode((await r.arrayBuffer()).slice(0, 4)) : ''
          return {
            status: r.status,
            type: r.headers.get('content-type') ?? '',
            pdf: head === '%PDF'
          }
        } catch {
          return { status: 0, type: '', pdf: false }
        }
      }, u)

    const ok = await get(B + 'cases/99/interviewee.pdf')
    expect(ok.status).toBe(200)
    expect(ok.type).toContain('pdf')
    expect(ok.pdf).toBe(true)

    for (const u of refused) {
      const r = await get(u)
      expect([0, 404], `renderer ${u}`).toContain(r.status)
      expect(r.pdf, `no PDF body for ${u}`).toBe(false)
      const main = await app.evaluate(async ({ net }, url) => (await net.fetch(url)).status, u)
      expect(main, `main ${u}`).toBe(404)
    }
  } finally {
    await app.close()
  }
})
