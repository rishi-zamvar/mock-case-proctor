// BAR-03 answer-key leak guard. Run it on the WRITTEN text, before speakable():
// the sources hold written forms such as `$45.0M`. Never log utterances or sources.

/** InterviewerBrief satisfies this structurally. */
export type LeakSource = { leakSources: string[]; deckText: string }
export type LeakResult =
  { ok: true } | { ok: false; reason: 'ngram' | 'banned_term'; match: string }

export const BANNED_TERMS: readonly string[] = [
  'rubric',
  'answer key',
  'flag map',
  'interviewer package',
  'ideal answer',
  'scoring sheet'
]

const N = 8
// Banned terms match whole normalised tokens, so 'rubrics' and 'answer keys' pass.
const BANNED_TOKENS = BANNED_TERMS.map((t) => t.split(' '))

export function normalizeForGuard(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function gramsOf(tokens: string[]): Set<string> {
  const out = new Set<string>()
  for (let i = 0; i + N <= tokens.length; i++) out.add(tokens.slice(i, i + N).join(' '))
  return out
}

// Answer-key grams minus deck grams, so the interviewer may always repeat deck wording.
const cache = new WeakMap<LeakSource, Set<string>>()
function bannedGrams(src: LeakSource): Set<string> {
  let set = cache.get(src)
  if (!set) {
    set = new Set<string>()
    for (const s of src.leakSources) for (const g of gramsOf(normalizeForGuard(s))) set.add(g)
    for (const g of gramsOf(normalizeForGuard(src.deckText))) set.delete(g)
    cache.set(src, set)
  }
  return set
}

export function checkUtterance(text: string, src: LeakSource): LeakResult {
  const tokens = normalizeForGuard(text)
  for (let t = 0; t < BANNED_TOKENS.length; t++) {
    const term = BANNED_TOKENS[t]
    for (let i = 0; i + term.length <= tokens.length; i++) {
      if (term.every((w, j) => tokens[i + j] === w)) {
        return { ok: false, reason: 'banned_term', match: BANNED_TERMS[t] }
      }
    }
  }
  if (tokens.length < N) return { ok: true }
  const banned = bannedGrams(src)
  for (let i = 0; i + N <= tokens.length; i++) {
    const gram = tokens.slice(i, i + N).join(' ')
    if (banned.has(gram)) return { ok: false, reason: 'ngram', match: gram }
  }
  return { ok: true }
}
