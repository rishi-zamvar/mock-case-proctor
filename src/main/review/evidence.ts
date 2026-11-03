// Evidence-quote verification and score bands (REV-01). Pure.
import { normalizeForGuard } from '../domain/text/leakGuard'

const MIN_TOKENS = 3

const contains = (hay: string[], needle: string[]): boolean => {
  for (let i = 0; i + needle.length <= hay.length; i++)
    if (needle.every((w, j) => hay[i + j] === w)) return true
  return false
}

/** A quote verifies if its normalised tokens (>= 3) appear contiguously in one candidate line. */
export function verifyQuotes(
  quotes: string[],
  lines: { id: string; text: string }[]
): { verified: { quote: string; turnId: string }[]; dropped: number } {
  const norm = lines.map((l) => ({ id: l.id, tokens: normalizeForGuard(l.text) }))
  const verified: { quote: string; turnId: string }[] = []
  let dropped = 0
  for (const quote of quotes) {
    const q = normalizeForGuard(quote)
    const hit = q.length >= MIN_TOKENS ? norm.find((l) => contains(l.tokens, q)) : undefined
    if (hit) verified.push({ quote, turnId: hit.id })
    else dropped++
  }
  return { verified, dropped }
}

export function bandOf(total: number): 'ready' | 'close' | 'another' {
  return total >= 26 ? 'ready' : total >= 20 ? 'close' : 'another'
}
