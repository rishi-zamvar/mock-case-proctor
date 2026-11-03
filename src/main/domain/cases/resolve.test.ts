import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { LEFTOVER_RE, makeFnRef, makeResolver, resolveDeep, resolveString, type Tokens } from './resolve'

const tokens: Tokens = {
  grr: { v: 0.85, fmt: 'pct', s: '85%' },
  nrr: { v: 1.04, fmt: 'pct', s: '104%' },
  exA_breakeven_pre: { v: 12, fmt: '$M', s: '$12.0M' }
}
const deck = {
  s1: { notes: { numbered: [{ id: 'dup' }] } },
  s2: { notes: { numbered: [{ id: 'churn' }, { id: 'terms' }, { id: 'dup' }] } },
  s3: null
}
const noFn = (k: string): string => {
  throw new Error(`unexpected fn ${k}`)
}

describe('resolveString tokens', () => {
  it.each([
    ['{grr}', '85%'],
    ['{exA_breakeven_pre}', '$12.0M'],
    ['GRR {grr}, NRR {nrr}', 'GRR 85%, NRR 104%']
  ])('given %s, when resolved, then %s', (s, out) => {
    expect(resolveString(s, tokens, noFn)).toBe(out)
  })

  it('given an unknown token, when resolved, then it throws', () => {
    expect(() => resolveString('x {nope}', tokens, noFn)).toThrow(/unresolved token \{nope\}/)
  })

  it('given a {fn:} ref, when resolved, then fn runs before tokens', () => {
    expect(resolveString('{fn:s2.churn} {grr}', tokens, (k) => `<${k}>`)).toBe('<s2.churn> 85%')
  })
})

describe('makeFnRef', () => {
  it.each([
    ['H1', 's2.terms', 'note (2)'],
    ['H3', 's2.terms', 'note (b)'],
    ['H2', 'terms', 'note (2)'],
    ['H1', 'churn', 'note (1)']
  ])('given house %s, when {fn:%s}, then %s', (house, k, out) => {
    expect(makeFnRef({ deck, bank: { house } })(k)).toBe(out)
  })

  it.each([['dup'], ['s9.x'], ['nothere']])('given {fn:%s} not matching exactly one note, then it throws', (k) => {
    expect(() => makeFnRef({ deck, bank: { house: 'H1' } })(k)).toThrow(/matches \d+ notes/)
  })

  it('given an insert, when {fn:ins1.x}, then it resolves via the lowercased insert id', () => {
    const f = makeFnRef({ deck: {}, inserts: [{ id: 'INS1', notes: { numbered: [{ id: 'x' }] } }], bank: { house: 'H1' } })
    expect(f('ins1.x')).toBe('note (1)')
  })
})

describe('resolveDeep', () => {
  it('given a nested object, when resolved, then strings change, scalars stay, input is not mutated', () => {
    const input = { a: '{grr}', b: [1, '{nrr}', { c: true, d: null }], e: 7 }
    const snapshot = JSON.parse(JSON.stringify(input))
    const out = resolveDeep(input, (s) => resolveString(s, tokens, noFn))
    expect(out).toEqual({ a: '85%', b: [1, '104%', { c: true, d: null }], e: 7 })
    expect(input).toEqual(snapshot)
  })
})

describe('LEFTOVER_RE', () => {
  it.each([['{fn:a.b}'], ['{exA_x}'], ['{x}']])('matches %s', (s) => expect(s).toMatch(LEFTOVER_RE))
  it.each([['{ }'], ['plain text']])('does not match %s', (s) => expect(s).not.toMatch(LEFTOVER_RE))
})

describe('fixture case_99', () => {
  it('given the fixture, when every field but tokens/params is resolved, then no placeholder is left', () => {
    const path = join(process.cwd(), 'tests/fixtures/cases/_work/data/case_99.json')
    const data = JSON.parse(readFileSync(path, 'utf8'))
    const { tokens: _t, params: _p, ...rest } = data
    const out = resolveDeep(rest, makeResolver(data))
    expect(JSON.stringify(out)).not.toMatch(LEFTOVER_RE)
    expect(out.answer_key.intended_read).toContain('$12.0M')
  })
})
