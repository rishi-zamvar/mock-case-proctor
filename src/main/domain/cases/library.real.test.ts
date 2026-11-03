// LIB-03 + BAR-03 on the 12 real cases. Skips when the library or pdftotext is absent.
// Assertion messages carry case ids only: never dump answer-key text into the test log.
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CaseCardSchema } from '../../../shared/schemas'
import { checkUtterance, normalizeForGuard } from '../text/leakGuard'
import { DEFAULT_LIBRARY_ROOT as ROOT, listCases, loadCase } from './library'
import { LEFTOVER_RE, resolveDeep } from './resolve'
import { sttPrompt } from './sttPrompt'

const HAS_LIB = existsSync(join(ROOT, '_work/data/case_01.json'))
const HAS_PDFTOTEXT = spawnSync('pdftotext', ['-v']).status === 0
const IDS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))
const SLUGS = [
  'claimpath',
  'pawshub',
  'buildledger',
  'carecadence',
  'ledgerloop',
  'shipstream',
  'clinicflow',
  'fieldwise',
  'gridsense',
  'coursely',
  'vaultlane',
  'harvestiq'
]
const DIMENSIONS = [
  'Clear call',
  'Lead Edge 8',
  'Retention insight',
  'Valuation and comps',
  'Return back-solve',
  'Business quality and poise'
]

function load(id: string): ReturnType<typeof loadCase> {
  const card = listCases(ROOT).find((c) => c.id === id)!
  const deck = execFileSync('pdftotext', [card.intervieweePdfPath, '-'], { encoding: 'utf8' })
  return loadCase(ROOT, id, deck)
}

const grams = (s: string): Set<string> => {
  const t = normalizeForGuard(s)
  const out = new Set<string>()
  for (let i = 0; i + 8 <= t.length; i++) out.add(t.slice(i, i + 8).join(' '))
  return out
}

/** First 10-word window of the ideal answer with no 8-gram overlap with the deck. */
function idealWindow(idealAnswer: string, deckText: string): string | undefined {
  const deck = grams(deckText)
  const words = idealAnswer.split(/\s+/).filter(Boolean)
  for (let i = 0; i + 10 <= words.length; i++) {
    const w = words.slice(i, i + 10).join(' ')
    if (normalizeForGuard(w).length >= 10 && [...grams(w)].every((g) => !deck.has(g))) return w
  }
  return undefined
}

describe.skipIf(!HAS_LIB || !HAS_PDFTOTEXT)(`real case library at ${ROOT}`, () => {
  it('given the library, when listed, then returns the 12 cases in order', () => {
    const cards = listCases(ROOT)
    expect(cards.map((c) => c.number)).toEqual(IDS.map(Number))
    expect(cards.map((c) => c.slug)).toEqual(SLUGS)
    for (const c of cards) {
      expect(() => CaseCardSchema.parse(c), c.id).not.toThrow()
      expect(existsSync(c.intervieweePdfPath), c.id).toBe(true)
    }
  })

  it.each(IDS)('given case %s, when loaded, then the brief is complete and the card safe', (id) => {
    const { card, brief } = load(id)
    const left: string[] = []
    resolveDeep(brief, (s) => (LEFTOVER_RE.test(s) && left.push(s), s))
    expect(left.length, `case ${id} leftovers`).toBe(0)
    expect(brief.deckPages.length, id).toBeGreaterThanOrEqual(30)
    expect(brief.deckPages.length, id).toBeLessThanOrEqual(32)
    expect(brief.flags.deliberateOmissions.length, id).toBeGreaterThan(0)
    expect(
      brief.rubric.map((r) => r.dimension),
      id
    ).toEqual(DIMENSIONS)
    const json = JSON.stringify(card)
    expect(json.includes(brief.idealAnswer.slice(0, 40)), `case ${id} card leaks ideal`).toBe(false)
    expect(
      brief.flags.map.some((f) => json.includes(f.say)),
      `case ${id} card leaks say`
    ).toBe(false)
    expect(sttPrompt(brief).split(/\s+/).length, id).toBeLessThanOrEqual(150)
  })

  it.each(IDS)('given case %s brief, when guarding, then blocks its ideal answer', (id) => {
    const { brief } = load(id)
    const w = idealWindow(brief.idealAnswer, brief.deckText)
    expect(w, `case ${id} has no deck-free ideal window`).toBeDefined()
    const r = checkUtterance('So ' + w, brief)
    expect(r.ok ? 'ok' : r.reason, id).toBe('ngram')
    expect(checkUtterance('Walk me through gross retention.', brief).ok, id).toBe(true)
    expect(checkUtterance('What does the deck not show you?', brief).ok, id).toBe(true)
    const b = checkUtterance('Let me look at the rubric', brief)
    expect(b.ok ? 'ok' : b.reason, id).toBe('banned_term')
  })
})
