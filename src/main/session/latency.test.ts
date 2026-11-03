import { describe, expect, it } from 'vitest'
import type { SessionFile } from '../store/sessionSchema'
import { latencyStages, median, p90, stopToFirstAudio } from './latency'

const t = (latency?: Record<string, number>): SessionFile['timings'][number] =>
  ({
    turnId: 't',
    kind: 'grill',
    startedAt: 0,
    doneAt: 1,
    ...(latency ? { latency } : {})
  }) as SessionFile['timings'][number]

describe('latency helpers', () => {
  it('given lists, when median taken, then empty is null and even lengths average', () => {
    expect(median([])).toBeNull()
    expect(median([3, 1, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })

  it('given timings, when stopToFirstAudio, then entries without latency or firstAudioAt are skipped', () => {
    expect(
      stopToFirstAudio([
        t(),
        t({ stopAt: 100, transcriptAt: 200, requestAt: 300 }),
        t({ stopAt: 100, transcriptAt: 200, requestAt: 300, firstAudioAt: 1600 }),
        t({ stopAt: 0, transcriptAt: 1, requestAt: 2, firstAudioAt: 2500 })
      ])
    ).toEqual([1500, 2500])
  })

  it('given lists, when p90 taken, then nearest-rank is used, empty is null and input is not mutated', () => {
    expect(p90([])).toBeNull()
    expect(p90([5])).toBe(5)
    const xs = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1]
    expect(p90(xs)).toBe(9)
    expect(xs).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1])
  })

  it('given full latency stamps, when latencyStages, then every stage has one entry per timing', () => {
    expect(
      latencyStages([
        t({ stopAt: 0, transcriptAt: 400, requestAt: 410, firstDeltaAt: 1400, firstAudioAt: 2100 })
      ])
    ).toEqual({ stt: [400], ttft: [1000], tokenToAudio: [700], total: [2100] })
  })

  it('given partial stamps and a timing without latency, when latencyStages, then only computable stages get entries', () => {
    expect(
      latencyStages([
        t(),
        t({ stopAt: 100, transcriptAt: 300, requestAt: 310 }),
        t({ stopAt: 0, transcriptAt: 200, requestAt: 210, firstDeltaAt: 900 }),
        t({ stopAt: 0, transcriptAt: 100, requestAt: 110, firstAudioAt: 1800 })
      ])
    ).toEqual({ stt: [200, 200, 100], ttft: [700], tokenToAudio: [], total: [1800] })
  })
})
