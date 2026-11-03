import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadCase } from './library'
import { sttPrompt } from './sttPrompt'

const FIXTURE_ROOT = join(__dirname, '../../../../tests/fixtures/cases')
const deck = readFileSync(join(FIXTURE_ROOT, 'case_99_fixture/deck.txt'), 'utf8')

describe('sttPrompt', () => {
  const { brief } = loadCase(FIXTURE_ROOT, '99', deck)

  it('given the fixture brief, when built, then has company, glossary and finance vocab', () => {
    const p = sttPrompt(brief)
    for (const s of [
      'Fixturely',
      ...brief.glossary.map((g) => g.term),
      'MOIC',
      'Rule of 40',
      'NRR'
    ])
      expect(p).toContain(s)
    expect(p.split(/\s+/).length).toBeLessThanOrEqual(150)
  })

  it('given a glossary term equal to a finance term, when built, then it appears once', () => {
    const p = sttPrompt({ company: brief.company, glossary: [{ term: 'nrr', def: 'x' }] })
    expect(p.split(', ').filter((t) => t.toLowerCase() === 'nrr')).toHaveLength(1)
  })
})
