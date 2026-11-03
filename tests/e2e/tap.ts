import type {} from '../../src/preload/index.d' // Window.__e2e globals
// IPC redaction tap: no interviewer content reaches the renderer before review mode (BAR-01).
// Brief text is never printed; failures carry only channel, index and field kind.
import { expect, type Page } from '@playwright/test'
import type { InterviewerBrief } from '../../src/main/domain/cases/brief'
import { checkUtterance } from '../../src/main/domain/text/leakGuard'

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

export async function assertTapClean(page: Page, brief: InterviewerBrief): Promise<void> {
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
