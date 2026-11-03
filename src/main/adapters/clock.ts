// One clock for both runs: scale 1 is the real clock, E2E_TIME_SCALE > 1 compresses app time.
import type { ClockPort } from '../ports'

export function createScaledClock({
  scale = 1,
  realNow = Date.now,
  setTimeout = globalThis.setTimeout,
  clearTimeout = globalThis.clearTimeout
}: {
  scale?: number
  realNow?: () => number
  setTimeout?: typeof globalThis.setTimeout
  clearTimeout?: typeof globalThis.clearTimeout
} = {}): ClockPort {
  const s = Number.isFinite(scale) && scale > 0 ? scale : 1
  const base = realNow()
  const now = (): number => base + (realNow() - base) * s
  return {
    now,
    scale: s,
    setTimer(at, cb) {
      const h = setTimeout(cb, Math.max(0, (at - now()) / s))
      return () => clearTimeout(h)
    }
  }
}
