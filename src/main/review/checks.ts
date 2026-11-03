// Deterministic review checks (REV-02, REV-03). Pure: no LLM, no IO.
import { brevityBand, type BrevityBand } from '../../shared/brevity'
import type { InterviewControl } from '../domain/machine/interviewMachine'
import { normalizeForGuard } from '../domain/text/leakGuard'
import { matches, parseNumbers, type NumberMention } from '../domain/text/numbers'
import type { Turn } from '../store/sessionSchema'

export type NumberCheckRow = {
  claim: string
  matched: string | null
  expected: string | null
  correct: boolean | 'unverifiable'
}

// ponytail: 6-word window + regex aliases on token ids; upgrade path is per-token metric tags in
// the case JSON. Number words above twenty stay unsupported by parseNumbers (whisper emits digits).
const WINDOW = 6
export const METRIC_KEYWORDS: readonly { word: RegExp; tokenId: RegExp }[] = [
  { word: /\barr\b/, tokenId: /arr/ },
  { word: /\b(grr|gross retention)\b/, tokenId: /grr/ },
  { word: /\b(nrr|net retention)\b/, tokenId: /nrr/ },
  { word: /\b(growth|growing)\b/, tokenId: /growth|cagr/ },
  { word: /\bmargins?\b/, tokenId: /margin|gm/ },
  // normalised text turns pre-money/post-money into "pre money"/"post money"
  { word: /\b(price|valuation|pre|post)\b/, tokenId: /pre|post|price|val/ },
  { word: /\b(multiple|times)\b/, tokenId: /mult/ },
  { word: /\bcagr\b/, tokenId: /cagr/ },
  { word: /\bburn\b/, tokenId: /burn/ }
]

const sameUnit = (a: NumberMention, b: NumberMention): boolean =>
  matches(a, { ...b, value: a.value }, 0)
const relDiff = (a: number, b: number): number =>
  Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), Number.EPSILON)

export function numberChecks(
  lines: { text: string }[],
  tokens: { id: string; text: string }[]
): NumberCheckRow[] {
  const parsed = tokens.flatMap((t) => {
    const [m] = parseNumbers(t.text)
    return m ? [{ id: t.id, text: t.text, m }] : []
  })
  const rows: NumberCheckRow[] = []
  for (const { text } of lines) {
    let cursor = 0
    for (const m of parseNumbers(text)) {
      const at = text.indexOf(m.raw, cursor)
      cursor = at + m.raw.length
      const window = [
        ...normalizeForGuard(text.slice(0, at)).slice(-WINDOW),
        ...normalizeForGuard(text.slice(cursor)).slice(0, WINDOW)
      ].join(' ')
      const ids = METRIC_KEYWORDS.filter((k) => k.word.test(window)).map((k) => k.tokenId)
      const cands = parsed.filter((t) => ids.some((re) => re.test(t.id)) && sameUnit(m, t.m))
      if (!cands.length) {
        rows.push({ claim: m.raw, matched: null, expected: null, correct: 'unverifiable' })
        continue
      }
      const hit = cands.find((t) => matches(m, t.m, 0.02))
      if (hit) {
        rows.push({ claim: m.raw, matched: hit.text, expected: null, correct: true })
        continue
      }
      const closest = cands.reduce((a, b) =>
        relDiff(m.value, b.m.value) < relDiff(m.value, a.m.value) ? b : a
      )
      rows.push({ claim: m.raw, matched: null, expected: closest.text, correct: false })
    }
  }
  return rows
}

const CALL_RE = /\b(invest(ing)?|pass|at a price|buy)\b/i

/** The call (invest / pass / at a price) sits in the first ~20 words of the first sentence. */
export function ledWithCall(
  opening: string,
  recommendation?: 'invest' | 'pass' | 'invest_at_price' | 'unclear'
): boolean {
  if (recommendation === 'unclear') return false
  const first = opening.trim().split(/[.!?]\s/)[0]
  return CALL_RE.test(first.split(/\s+/).slice(0, 20).join(' '))
}

export function brevityRows(
  transcript: Turn[]
): { turnId: string; ms: number; band: BrevityBand }[] {
  return transcript.flatMap((t) =>
    t.speaker === 'candidate' &&
    (t.phase === 'presentation' || t.phase === 'grilling') &&
    t.ms !== undefined
      ? [{ turnId: t.id, ms: t.ms, band: brevityBand(t.ms) }]
      : []
  )
}

export type FlagMapRow = {
  id: string
  flag: string
  status: 'found' | 'hinted' | 'missed'
  where: string
}

/** Status is fixed at a flag's first appearance in the control log. */
export function flagMap(
  controlLog: { control: InterviewControl }[],
  flags: { id: string; flag: string; templates: string[] }[]
): FlagMapRow[] {
  const status = new Map<string, 'found' | 'hinted'>()
  for (const { control } of controlLog) {
    const hinted = control.flags_hinted ?? []
    for (const id of [...hinted, ...(control.flags_surfaced ?? [])])
      if (!status.has(id)) status.set(id, hinted.includes(id) ? 'hinted' : 'found')
  }
  return flags.map((f) => ({
    id: f.id,
    flag: f.flag,
    status: status.get(f.id) ?? 'missed',
    where: f.templates.join(', ')
  }))
}
