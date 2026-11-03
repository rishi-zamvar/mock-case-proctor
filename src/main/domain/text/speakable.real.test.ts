// VOUT-02 census: every token .s in the real 12-case library must normalise to speakable text.
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { speakable } from './speakable'

const ROOT = join(homedir(), 'Documents/Projects/lead_edge_mock_cases/_work/data')
const HAS_LIB = existsSync(join(ROOT, 'case_01.json'))
const UNSPEAKABLE = /[$%~<]|\d[MBKTx]\b|\bbps\b/
const CASES = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))

describe.skipIf(!HAS_LIB)(`speakable census over ${ROOT}`, () => {
  it.each(CASES)('given case_%s tokens, when normalised, then no unspeakable form remains', (nn) => {
    const data = JSON.parse(readFileSync(join(ROOT, `case_${nn}.json`), 'utf8')) as {
      tokens: Record<string, { s: unknown }>
    }
    const values = Object.values(data.tokens).map((t) => String(t.s))
    expect(values.length).toBeGreaterThan(0)
    const failing = values
      .map((s) => [s, speakable(s)])
      .filter(([, out]) => UNSPEAKABLE.test(out))
      .slice(0, 20)
    expect(failing, `unspeakable: ${JSON.stringify(failing)}`).toEqual([])
  })
})
