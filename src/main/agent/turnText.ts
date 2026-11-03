// INT-02 spoken-turn policy and INT-07 candidate wrapping. Pure; never log sentence text.
// leakGuard's BANNED_TERMS (rubric, answer key, ...) run separately in the runner.
import { normalizeForGuard } from '../domain/text/leakGuard'

export const MAX_SENTENCES = 4

export const BANNED_PHRASES: readonly string[] = [
  'great question',
  'great point',
  'as an ai',
  'your score',
  'out of 30',
  'out of thirty',
  'language model'
]
const PHRASE_TOKENS = BANNED_PHRASES.map((p) => p.split(' '))

function hasBannedPhrase(s: string): boolean {
  const t = normalizeForGuard(s)
  return PHRASE_TOKENS.some((p) => {
    for (let i = 0; i + p.length <= t.length; i++)
      if (p.every((w, j) => t[i + j] === w)) return true
    return false
  })
}

export function createTurnFilter(): {
  accept(sentence: string): { ok: true } | { ok: false; reason: 'too_long' | 'banned_phrase' }
} {
  let count = 0
  return {
    accept(sentence) {
      if (hasBannedPhrase(sentence)) return { ok: false, reason: 'banned_phrase' }
      if (count >= MAX_SENTENCES) return { ok: false, reason: 'too_long' }
      count++
      return { ok: true }
    }
  }
}

export const INTERRUPT_LINES: readonly string[] = [
  "Let me stop you there — what's the one number that matters?",
  'Okay, pause — give me the headline.',
  "Hold on, what's the punchline?",
  'Let me jump in — so what does that mean for the deal?'
]

export function pickInterruptLine(n: number): string {
  return INTERRUPT_LINES[n % INTERRUPT_LINES.length]
}

export const FALLBACK_LINE = 'Say more about that.'
export const WARMUP_CLOSING_LINE = "Great — here's the project."
export const SORRY_LINE = 'Sorry, give me a second.'

export function escapeTags(s: string): string {
  return s.replace(/</g, '‹').replace(/>/g, '›')
}

export function wrapCandidate(text: string): string {
  return `<candidate_said>${escapeTags(text)}</candidate_said>`
}
