// VOUT-02: turn printed finance text into words Kokoro can say. Table-driven, order matters:
// commas and negatives first, ranges before single amounts, lexicon last.

export const LEXICON: Readonly<Record<string, string>> = {
  'Rule of 40': 'rule of forty',
  ARR: 'A R R',
  NRR: 'N R R',
  GRR: 'G R R',
  CAGR: 'kagger',
  EV: 'E V',
  NTM: 'N T M',
  LTM: 'L T M',
  SaaS: 'sass',
  PIMS: 'pims',
  EBITDA: 'ee-bit-dah',
  MOIC: 'moyk'
}

const SCALE: Record<string, string> = { K: 'thousand', M: 'million', B: 'billion', T: 'trillion' }
const N = String.raw`\d+(?:\.\d+)?`
// en dash may carry spaces; a hyphen must be tight so "10 - 2" arithmetic is not read as a range
const DASH = String.raw`(?:\s*–\s*|-)`

type Rule = [RegExp, string | ((...m: string[]) => string)]

const money = (n: string, s?: string): string => `${n}${s ? ` ${SCALE[s]}` : ''} dollars`

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const RULES: Rule[] = [
  [/(\d),(?=\d{3}\b)/g, '$1'],
  [/(?<![\w.])n\.a\./g, 'not available'],
  [new RegExp(String.raw`\((\$?${N}[KMBT]?%?)\)`, 'g'), 'negative $1'],
  [/\bFY(\d{2}|\d{4})([AE])?\b/g, (_m, y, ae) => `fiscal ${y.length === 2 ? `20${y}` : y}${ae === 'E' ? ' estimate' : ''}`],
  [
    new RegExp(String.raw`(\$)?(${N})([KMBT])?${DASH}(\$)?(${N})([KMBT])\b`, 'g'),
    (_m, d1, a, s1, d2, b, s2) => {
      const lo = s1 && s1 !== s2 ? `${a} ${SCALE[s1]}` : a
      return `${lo} to ${b} ${SCALE[s2]}${d1 || d2 ? ' dollars' : ''}`
    }
  ],
  [new RegExp(String.raw`(${N})%?${DASH}(${N})%`, 'g'), '$1 to $2 percent'],
  [new RegExp(String.raw`(\d)\s*–\s*(\d)`, 'g'), '$1 to $2'],
  [new RegExp(String.raw`\$(${N})([KMBT])?(?!\w)`, 'g'), (_m, n, s) => money(n, s)],
  [new RegExp(String.raw`\b(${N})([KMBT])\b`, 'g'), (_m, n, s) => `${n} ${SCALE[s]}`],
  [new RegExp(String.raw`\b(${N})x\b`, 'g'), '$1 times'],
  [/\+(?=\$?\d)/g, 'plus '],
  [/<\s*(?=\d)/g, 'under '],
  [/\s*%/g, ' percent'],
  [/\bbps\b/g, 'basis points'],
  [/(\d)\+/g, '$1 plus'],
  [/~\s*/g, 'about '],
  ...Object.entries(LEXICON).map(([k, v]): Rule => [new RegExp(String.raw`\b${escape(k)}\b`, 'g'), v]),
  [/ {2,}/g, ' ']
]

export function speakable(text: string): string {
  let out = text
  for (const [re, rep] of RULES) out = out.replace(re, rep as string)
  return out.trim()
}
