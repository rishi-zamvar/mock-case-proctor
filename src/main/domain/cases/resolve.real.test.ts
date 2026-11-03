// LIB-03: every placeholder in all 12 real cases resolves. Skips when the library is absent.
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LEFTOVER_RE, makeResolver, resolveDeep } from './resolve'

const ROOT = join(homedir(), 'Documents/Projects/lead_edge_mock_cases')
const HAS_LIB = existsSync(join(ROOT, '_work/data/case_01.json'))
const IDS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'))

describe.skipIf(!HAS_LIB)(`real case library at ${ROOT}`, () => {
  it.each(IDS)('given case %s, when fully resolved, then zero placeholders are left', (id) => {
    const data = JSON.parse(readFileSync(join(ROOT, `_work/data/case_${id}.json`), 'utf8'))
    const { tokens: _t, params: _p, ...rest } = data
    const out = resolveDeep(rest, makeResolver(data))
    expect(JSON.stringify(out)).not.toMatch(LEFTOVER_RE)
  })
})
