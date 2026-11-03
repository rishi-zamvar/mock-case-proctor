// VOUT-02: streaming sentence splitter for Claude's text on its way to TTS.
// A boundary is .?! (plus closing quotes/parens) outside quotes, then whitespace, then a capital
// or opening quote. A trailing boundary is held until the next chunk confirms it, so "4." | "1x"
// never splits. The very first emission may come early at a clause comma for latency.

export interface SentenceSplitter {
  push(chunk: string): string[]
  flush(): string[]
}

const ABBREV = new Set([
  'e.g.',
  'i.e.',
  'vs.',
  'approx.',
  'u.s.',
  'n.a.',
  'inc.',
  'a.m.',
  'p.m.',
  'mr.',
  'dr.',
  'co.',
  'ltd.'
])
const START = /[A-Z“"]/

// ponytail: rescans the whole buffer on every push (O(n^2) for 1-char chunks); fine for sentence-sized buffers
function findBoundary(buf: string): number {
  let inQ = false
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i]
    if ('.?!'.includes(c)) {
      let j = i + 1
      let q = inQ
      while (j < buf.length && (buf[j] === '”' || buf[j] === ')' || (buf[j] === '"' && q))) {
        if (buf[j] !== ')') q = false
        j++
      }
      if (!q) {
        const ws = /^\s+/.exec(buf.slice(j))
        const next = ws ? buf[j + ws[0].length] : undefined
        const word = buf
          .slice(buf.lastIndexOf(' ', i) + 1, i + 1)
          .replace(/^[("“]+/, '')
          .toLowerCase()
        if (next !== undefined && START.test(next) && !ABBREV.has(word)) return j
      }
    }
    if (c === '"') inQ = !inQ
    else if (c === '“') inQ = true
    else if (c === '”') inQ = false
  }
  return -1
}

function findEarly(buf: string, minWords: number): number {
  let inQ = false
  for (let i = 0; i < buf.length; i++) {
    const c = buf[i]
    if (c === '"') inQ = !inQ
    else if (c === '“') inQ = true
    else if (c === '”') inQ = false
    else if (!inQ && ',;:—'.includes(c) && /\s/.test(buf[i + 1] ?? '')) {
      const words = buf.slice(0, i).trim().split(/\s+/).filter(Boolean).length
      if (words >= minWords) return i + 1
    }
  }
  return -1
}

export function createSentenceSplitter(opts: { earlyFirstWords?: number } = {}): SentenceSplitter {
  const minWords = opts.earlyFirstWords ?? 6
  let buf = ''
  let emittedAny = false

  const take = (end: number, out: string[]): void => {
    const s = buf.slice(0, end).trim()
    buf = buf.slice(end)
    if (s) out.push(s)
    emittedAny = true
  }

  return {
    push(chunk) {
      buf += chunk
      const out: string[] = []
      for (let end = findBoundary(buf); end !== -1; end = findBoundary(buf)) take(end, out)
      if (!emittedAny) {
        const end = findEarly(buf, minWords)
        if (end !== -1) take(end, out)
      }
      return out
    },
    flush() {
      const s = buf.trim()
      buf = ''
      emittedAny = false
      return s ? [s] : []
    }
  }
}
