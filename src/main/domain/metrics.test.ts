import { describe, expect, it } from 'vitest'
import { brevityBand, type BrevityBand } from './metrics'

describe('brevityBand', () => {
  it.each<[number, BrevityBand]>([
    [0, 'short'],
    [14_999, 'short'],
    [15_000, 'brief'],
    [29_999, 'brief'],
    [30_000, 'ideal'],
    [60_000, 'ideal'],
    [60_001, 'long'],
    [90_000, 'long'],
    [90_001, 'flagged']
  ])('%i ms -> %s', (ms, band) => {
    expect(brevityBand(ms)).toBe(band)
  })
})
