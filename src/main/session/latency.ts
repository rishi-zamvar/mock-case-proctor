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

// Nearest-rank p90 over a sorted copy.
export function p90(xs: number[]): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.ceil(0.9 * s.length) - 1]
}

export type LatencyStages = {
  stt: number[]
  ttft: number[]
  tokenToAudio: number[]
  total: number[]
}

// Per-stage breakdown: stop->transcript, transcript->first token, first token->first audio, total.
export function latencyStages(timings: SessionFile['timings']): LatencyStages {
  const ls = timings.flatMap((t) => (t.latency ? [t.latency] : []))
  return {
    stt: ls.map((l) => l.transcriptAt - l.stopAt),
    ttft: ls.flatMap((l) =>
      l.firstDeltaAt === undefined ? [] : [l.firstDeltaAt - l.transcriptAt]
    ),
    tokenToAudio: ls.flatMap((l) =>
      l.firstDeltaAt === undefined || l.firstAudioAt === undefined
        ? []
        : [l.firstAudioAt - l.firstDeltaAt]
    ),
    total: stopToFirstAudio(timings)
  }
}
