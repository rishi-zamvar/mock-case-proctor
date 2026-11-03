export const SILENCE_RMS = 0.01
export const SILENCE_MS = 3000

export function measure(buf: ArrayLike<number>): { rms: number; peak: number } {
  let sum = 0
  let peak = 0
  for (let i = 0; i < buf.length; i++) {
    const v = buf[i]
    sum += v * v
    peak = Math.max(peak, Math.abs(v))
  }
  return { rms: buf.length ? Math.sqrt(sum / buf.length) : 0, peak }
}

/** Returns (rms, now) => true once rms has stayed below threshold for >= ms. */
export function createSilenceWatch(o: {
  threshold: number
  ms: number
}): (rms: number, now: number) => boolean {
  let since: number | null = null
  return (rms, now) => {
    if (rms >= o.threshold) {
      since = null
      return false
    }
    if (since === null) since = now
    return now - since >= o.ms
  }
}
