import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { CaseCard } from '../../../shared/ipc'
import { casePdfResolver, findCase, listCases, loadCase } from './library'
import { LEFTOVER_RE, resolveDeep } from './resolve'

const FIXTURE_ROOT = join(__dirname, '../../../../tests/fixtures/cases')
const deck = readFileSync(join(FIXTURE_ROOT, 'case_99_fixture/deck.txt'), 'utf8')
const CARD_KEYS = ['company', 'id', 'intervieweePdfPath', 'level', 'number', 'slug', 'vertical']

function leftovers(o: unknown): string[] {
  const left: string[] = []
  resolveDeep(o, (s) => (LEFTOVER_RE.test(s) && left.push(s), s))
  return left
}

function tmpRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'cases-'))
  cpSync(FIXTURE_ROOT, root, { recursive: true })
  return root
}

describe('listCases', () => {
  it('given the fixture root, when listed, then returns exactly the fixture card', () => {
    const cards = listCases(FIXTURE_ROOT)
    expect(cards).toHaveLength(1)
    const [c] = cards
    expect(c).toMatchObject({
      id: '99',
      number: 99,
      slug: 'fixture',
      company: 'Fixturely',
      level: 1
    })
    expect(c.vertical.length).toBeGreaterThan(0)
    expect(c.intervieweePdfPath).toMatch(
      /case_99_fixture\/case_99_fixture_interviewee_package\.pdf$/
    )
  })

  it('given non-case entries, when listed, then ignores them', () => {
    const root = tmpRoot()
    writeFileSync(join(root, '00_INDEX.md'), 'x')
    mkdirSync(join(root, 'notes'))
    writeFileSync(join(root, '_work/data/comps_master_v2.json'), '{}')
    expect(listCases(root).map((c) => c.id)).toEqual(['99'])
  })
})

describe('loadCase on the fixture', () => {
  const { card, brief } = loadCase(FIXTURE_ROOT, '99', deck)

  it('given the fixture, when loaded, then no placeholder is left in the brief', () => {
    expect(leftovers(brief)).toEqual([])
    const json = JSON.stringify(brief)
    expect(json).toContain('note (1)')
    expect(json).toContain('note (2)')
  })

  it('given the fixture, when loaded, then the brief carries the interviewer fields', () => {
    expect(brief.flags.deliberateOmissions.length).toBeGreaterThan(0)
    expect(Array.isArray(brief.flags.map[0].templates)).toBe(true)
    expect(brief.flags.map[0].templates[0]).toMatch(/^[A-Z]+\d+$/)
    expect(brief.rubric[0]).toEqual({
      dimension: 'Clear call',
      five: expect.any(String),
      one: expect.any(String)
    })
    expect(brief.deckPages).toHaveLength(3)
    expect(brief.deckText).toBe(deck)
    expect(brief.company.name).toBe('Fixturely')
  })

  it('given the fixture, when loaded, then leakSources hold every answer-key source', () => {
    const want = [
      brief.idealAnswer,
      ...Object.values(brief.modelAnswer),
      ...brief.flags.map.map((f) => f.say),
      ...brief.rubric.flatMap((r) => [r.five, r.one]),
      ...brief.whatItTests.map((t) => t.evidence)
    ]
    for (const w of want) expect(brief.leakSources).toContain(w)
    expect(leftovers(brief.leakSources)).toEqual([])
  })

  it('given the fixture, when loaded, then calibration sources are skipped', () => {
    expect(JSON.stringify(brief)).not.toContain('Fictional source.')
  })

  it('given the fixture, when loaded, then the card has only the 7 safe keys', () => {
    expect(Object.keys(card).sort()).toEqual(CARD_KEYS)
    const json = JSON.stringify(card)
    expect(json).not.toContain(brief.idealAnswer)
    for (const f of brief.flags.map) expect(json).not.toContain(f.say)
  })

  it('given an extra interviewer field, when typed as CaseCard, then it is a type error', () => {
    // @ts-expect-error extra interviewer field
    const c: CaseCard = { ...card, idealAnswer: 'x' }
    expect(c).toBeDefined()
  })
})

describe('loadCase errors', () => {
  it('given an unknown id, when loaded, then throws not found', () => {
    expect(() => loadCase(FIXTURE_ROOT, '42', deck)).toThrow(/case 42 not found/)
  })

  it('given an unknown token in the data, when loaded, then throws unresolved token', () => {
    const root = tmpRoot()
    const p = join(root, '_work/data/case_99.json')
    const data = JSON.parse(readFileSync(p, 'utf8'))
    data.interviewer.prep_brief.ideal_answer += ' {no_such_token}'
    writeFileSync(p, JSON.stringify(data))
    expect(() => loadCase(root, '99', deck)).toThrow(/unresolved token/)
  })
})

describe('findCase', () => {
  it('given the fixture id, when found, then returns id, slug and dir', () => {
    const c = findCase(FIXTURE_ROOT, '99')
    expect(c).toMatchObject({ id: '99', slug: 'fixture' })
    expect(c?.dir).toMatch(/case_99_fixture$/)
  })
  it.each(['98', '../99', '9', ''])('given id %j, when found, then null', (id) => {
    expect(findCase(FIXTURE_ROOT, id)).toBeNull()
  })
})

describe('casePdfResolver', () => {
  const resolve = casePdfResolver(FIXTURE_ROOT)
  it('given the fixture id, when resolved, then returns the existing interviewee pdf', () => {
    const p = resolve('99')
    expect(p).toMatch(/case_99_fixture_interviewee_package\.pdf$/)
    expect(existsSync(p!)).toBe(true)
  })
  it.each(['98', '9'])('given id %s, when resolved, then null', (id) => {
    expect(resolve(id)).toBeNull()
  })
  it('given a case dir with no interviewee pdf, when resolved, then null', () => {
    const root = mkdtempSync(join(tmpdir(), 'cases-'))
    mkdirSync(join(root, 'case_42_nopdf'))
    expect(casePdfResolver(root)('42')).toBeNull()
  })
})
