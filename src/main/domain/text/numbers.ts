// Canonical number mentions for transcript-vs-deck comparison (REV-03 prep).

export type NumberMention = {
  value: number
  unit: 'usd' | 'pct' | 'x' | 'count' | 'bps'
  scale: 'K' | 'M' | 'B' | 'T' | null
  raw: string
}

// ponytail: number words only up to twenty; "one eighty four million" unsupported, Phase 8 may need a fuller parser
const WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen', 'twenty'
] // prettier-ignore
const WORD_ALT = [...WORDS].sort((a, b) => b.length - a.length).join('|')

const SCALES = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 } as const
const SCALE_WORDS: Record<string, keyof typeof SCALES> = {
  thousand: 'K',
  million: 'M',
  billion: 'B',
  trillion: 'T'
}

// $? number (digits with comma thousands, or a word) + optional scale + optional unit.
// The lookbehind keeps FY2026 / A3 / n.a. out; the trailing (?!\w) rejects 1e9-style junk.
const RE = new RegExp(
  String.raw`(?<![\w.])(\$)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|${WORD_ALT})` +
    String.raw`(?:([KMBT])|\s+(thousand|million|billion|trillion))?` +
    String.raw`(?:\s*(%)|\s*(x)|\s+(times|percent|bps|basis points|dollars)|(bps))?(?!\w)`,
  'gi'
)

export function parseNumbers(text: string): NumberMention[] {
  const out: NumberMention[] = []
  for (const mt of text.matchAll(RE)) {
    const [raw, dollar, num, letter, scaleWord, pct, x, unitWord, bps] = mt
    const before = text.slice(0, mt.index)
    if (/FY\s*$/i.test(before)) continue
    const isWord = !/\d/.test(num)
    const unitTxt = (pct ?? x ?? unitWord ?? bps ?? '').toLowerCase()
    // A bare number word ("one of the issues") is not a mention.
    if (isWord && !letter && !scaleWord && !unitTxt) continue
    const scale = letter
      ? (letter.toUpperCase() as keyof typeof SCALES)
      : scaleWord
        ? SCALE_WORDS[scaleWord.toLowerCase()]
        : null
    const base = isWord ? WORDS.indexOf(num.toLowerCase()) : parseFloat(num.replace(/,/g, ''))
    if (!Number.isFinite(base)) continue
    const unit: NumberMention['unit'] =
      dollar || unitTxt === 'dollars'
        ? 'usd'
        : unitTxt === '%' || unitTxt === 'percent'
          ? 'pct'
          : unitTxt === 'x' || unitTxt === 'times'
            ? 'x'
            : unitTxt === 'bps' || unitTxt === 'basis points'
              ? 'bps'
              : 'count'
    out.push({ value: scale ? base * SCALES[scale] : base, unit, scale, raw })
  }
  return out
}

const compatible = (a: NumberMention['unit'], b: NumberMention['unit']): boolean =>
  a === b || ((a === 'usd' || a === 'count') && (b === 'usd' || b === 'count'))

export function matches(a: NumberMention, b: NumberMention, tolerance = 0.02): boolean {
  if (!compatible(a.unit, b.unit)) return false
  return Math.abs(a.value - b.value) <= tolerance * Math.max(Math.abs(a.value), Math.abs(b.value))
}
