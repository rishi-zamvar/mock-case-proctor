import { describe, expect, it } from 'vitest'
import type { SessionFile } from '../store/sessionSchema'
import { median, stopToFirstAudio } from './latency'

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
})
