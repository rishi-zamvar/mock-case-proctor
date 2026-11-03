// Post-whisper cleaner (VIN-04): drop whole-output hallucinations, collapse n-gram loops.
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '')

// ponytail: phrases observed in the 07 spike; extend as new ones show up in real sessions.
const HALLUCINATIONS = new Set(
  [
    'thank you',
    'thank you for watching',
    'thanks for watching',
    'you',
    'dollars',
    'money',
    'transcription by castingwords',
    'blank_audio',
    'silence'
  ].map(norm)
)

/** Whole-output match only; '' after normalisation (punctuation, ♪, whitespace) counts too. */
export function isHallucination(text: string): boolean {
  const n = norm(text)
  return n === '' || HALLUCINATIONS.has(n)
}

const MAX_N = 8
const MIN_COPIES = 3

/** Any 1..8-gram repeated 3+ times consecutively collapses to its first copy (original tokens kept). */
export function collapseRepeats(text: string): string {
  const tok = text.trim().split(/\s+/).filter(Boolean)
  const key = tok.map(norm)
  const same = (a: number, b: number, n: number): boolean => {
    for (let k = 0; k < n; k++) if (key[a + k] !== key[b + k]) return false
    return true
  }
  let changed = true
  while (changed) {
    changed = false
    for (let n = MAX_N; n >= 1; n--) {
      for (let i = 0; i + n * MIN_COPIES <= tok.length; i++) {
        let copies = 1
        while (i + (copies + 1) * n <= tok.length && same(i, i + copies * n, n)) copies++
        if (copies >= MIN_COPIES) {
          tok.splice(i + n, (copies - 1) * n)
          key.splice(i + n, (copies - 1) * n)
          changed = true
        }
      }
    }
  }
  return tok.join(' ')
}

/** '' if the whole output is a hallucination, else repeat-collapsed and trimmed. */
export function cleanTranscript(text: string): string {
  return isHallucination(text) ? '' : collapseRepeats(text)
}
