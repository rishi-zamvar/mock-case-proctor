import { describe, expect, it } from 'vitest'
import { matches, parseNumbers, type NumberMention } from './numbers'

const m = (
  value: number,
  unit: NumberMention['unit'],
  scale: NumberMention['scale'],
  raw: string
): NumberMention => ({ value, unit, scale, raw })

describe('parseNumbers', () => {
  it.each<[string, NumberMention[]]>([
    ['$184M', [m(184e6, 'usd', 'M', '$184M')]],
    ['$1.5B', [m(1.5e9, 'usd', 'B', '$1.5B')]],
    ['$7.5K', [m(7500, 'usd', 'K', '$7.5K')]],
    ['184 million dollars', [m(184e6, 'usd', 'M', '184 million dollars')]],
    ['184 million', [m(184e6, 'count', 'M', '184 million')]],
    ['$184 million', [m(184e6, 'usd', 'M', '$184 million')]],
    ['4.1x', [m(4.1, 'x', null, '4.1x')]],
    ['three x', [m(3, 'x', null, 'three x')]],
    ['twenty times', [m(20, 'x', null, 'twenty times')]],
    ['4.1 times', [m(4.1, 'x', null, '4.1 times')]],
    ['48 percent', [m(48, 'pct', null, '48 percent')]],
    ['48.2%', [m(48.2, 'pct', null, '48.2%')]],
    ['twelve percent', [m(12, 'pct', null, 'twelve percent')]],
    ['25 bps', [m(25, 'bps', null, '25 bps')]],
    ['25 basis points', [m(25, 'bps', null, '25 basis points')]],
    ['1,100 customers', [m(1100, 'count', null, '1,100')]],
    [
      'ARR of $45M at 4.1x with 85% GRR',
      [m(45e6, 'usd', 'M', '$45M'), m(4.1, 'x', null, '4.1x'), m(85, 'pct', null, '85%')]
    ],
    ['n.a.', []],
    ['no numbers here', []],
    ['Revenue in FY2026 was flat', []]
  ])('%j', (text, expected) => {
    const got = parseNumbers(text)
    expect(got.map((g) => ({ ...g, value: +g.value.toPrecision(12) }))).toEqual(expected)
  })

  it.each(['', '$', 'x%', '...', '$,', 'FY', '1e999', '((()))', '\u0000'])('does not throw on %j', (s) => {
    expect(() => parseNumbers(s)).not.toThrow()
  })
})

describe('matches', () => {
  const [usd184] = parseNumbers('$184M')
  const [cnt184] = parseNumbers('184 million')
  it.each<[string, NumberMention, NumberMention, number | undefined, boolean]>([
    ['usd vs count compatible', usd184, cnt184, undefined, true],
    ['1.6% off', m(184e6, 'usd', 'M', ''), m(187e6, 'usd', 'M', ''), undefined, true],
    ['3.2% off', m(184e6, 'usd', 'M', ''), m(190e6, 'usd', 'M', ''), undefined, false],
    ['3.2% off with 5% tol', m(184e6, 'usd', 'M', ''), m(190e6, 'usd', 'M', ''), 0.05, true],
    ['unit mismatch', m(4.1, 'x', null, ''), m(4.1, 'pct', null, ''), undefined, false],
    ['zero vs zero', m(0, 'pct', null, ''), m(0, 'pct', null, ''), undefined, true]
  ])('%s', (_n, a, b, tol, expected) => {
    expect(matches(a, b, tol)).toBe(expected)
  })
})
