import { describe, expect, it } from 'vitest'
import { bandOf, verifyQuotes } from './evidence'

const lines = [
  { id: 't1', text: 'GRR is 85% — tenured customers only' },
  { id: 't2', text: 'grr is 85 percent tenured only' },
  { id: 't3', text: 'I would pass at this price.' }
]

describe('verifyQuotes', () => {
  it.each([
    ['grr is 85 tenured', 't1'],
    ['GRR is 85%, tenured', 't1'],
    ['I WOULD PASS', 't3'],
    ['percent tenured only', 't2']
  ])('given quote %j, when verified, then it maps to %s', (quote, turnId) => {
    expect(verifyQuotes([quote], lines)).toEqual({ verified: [{ quote, turnId }], dropped: 0 })
  })

  it.each([
    'GRR is 85%, tenured only', // not contiguous in t1 or t2
    'pass at',
    '',
    '— !',
    'he never said this'
  ])('given quote %j, when verified, then it is dropped', (quote) => {
    expect(verifyQuotes([quote], lines)).toEqual({ verified: [], dropped: 1 })
  })

  it('given duplicate quotes, when verified, then each verifies independently', () => {
    const r = verifyQuotes(['would pass at', 'would pass at', 'nope nope nope'], lines)
    expect(r.verified).toHaveLength(2)
    expect(r.dropped).toBe(1)
  })
})

describe('bandOf', () => {
  it.each([
    [30, 'ready'],
    [26, 'ready'],
    [25, 'close'],
    [20, 'close'],
    [19, 'another'],
    [0, 'another']
  ] as const)('given total %d, when banded, then %s', (total, band) => {
    expect(bandOf(total)).toBe(band)
  })
})
