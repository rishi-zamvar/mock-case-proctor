// Stop-to-first-audio latency (VOUT-04). Stamps are real-clock ms.
import type { SessionFile } from '../store/sessionSchema'

export function stopToFirstAudio(timings: SessionFile['timings']): number[] {
  return timings.flatMap((t) =>
    t.latency?.firstAudioAt === undefined ? [] : [t.latency.firstAudioAt - t.latency.stopAt]
  )
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
