export type BrevityBand = 'short' | 'brief' | 'ideal' | 'long' | 'flagged'

/** Answer-length band. Over 90 s is 'flagged', matching the grilling interrupt rule. */
export function brevityBand(ms: number): BrevityBand {
  if (ms < 15_000) return 'short'
  if (ms < 30_000) return 'brief'
  if (ms <= 60_000) return 'ideal'
  if (ms <= 90_000) return 'long'
  return 'flagged'
}
