import { describe, it, expect, vi } from 'vitest'
import { createSpeechQueue, type HeadLike, type SynthData, type SynthResult } from './speechQueue'

// Minimal TalkingHead FIFO: markers fire when idle, audio blocks until endAudio().
function fakeHead(): { head: HeadLike; endAudio(): void } {
  type It = { marker: () => void } | { audio: SynthData }
  let fifo: It[] = []
  let busy = false
  const pump = (): void => {
    while (!busy && fifo.length) {
      const it = fifo.shift()!
      if ('marker' in it) it.marker()
      else busy = true
    }
  }
  return {
    head: {
      speakAudio: (d) => (fifo.push({ audio: d }), pump()),
      speakMarker: (fn) => (fifo.push({ marker: fn }), pump()),
      stopSpeaking: () => ((fifo = []), (busy = false))
    },
    endAudio: () => ((busy = false), pump())
  }
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}
const ok: SynthResult = { ok: true, data: { visemes: [0] } }

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- test harness
function setup(synth: (text: string) => Promise<SynthResult> = async () => ok) {
  const h = fakeHead()
  const onStarted = vi.fn()
  const q = createSpeechQueue({
    tts: { synthesize: vi.fn(synth) },
    head: h.head,
    ready: Promise.resolve(),
    ack: vi.fn(),
    onStarted
  })
  return { h, q, onStarted }
}

describe('speech queue onStarted', () => {
  it('given two sentences, when each starts playing, then onStarted fires once per seq in order at the start marker', async () => {
    const s = setup()
    s.q.enqueue({ turnId: 't', seq: 0, text: 'a' })
    s.q.enqueue({ turnId: 't', seq: 1, text: 'b' })
    expect(s.onStarted).not.toHaveBeenCalled() // not at enqueue
    await flush()
    expect(s.onStarted.mock.calls).toEqual([['t', 0]])
    s.h.endAudio()
    await flush()
    expect(s.onStarted.mock.calls).toEqual([
      ['t', 0],
      ['t', 1]
    ])
    s.h.endAudio()
    await flush()
    expect(s.onStarted).toHaveBeenCalledTimes(2)
  })

  it('given a failed synth, when it is reached, then onStarted is never called for it', async () => {
    const s = setup(async () => ({ ok: false, error: 'x' }))
    s.q.enqueue({ turnId: 't', seq: 0, text: 'a' })
    await flush()
    expect(s.onStarted).not.toHaveBeenCalled()
  })

  it('given a queued sentence cancelled before it starts, when the turn is cancelled, then onStarted is not called for it', async () => {
    const s = setup()
    s.q.enqueue({ turnId: 't', seq: 0, text: 'a' })
    s.q.enqueue({ turnId: 't', seq: 1, text: 'b' })
    await flush()
    s.q.cancel('t')
    s.h.endAudio()
    await flush()
    expect(s.onStarted.mock.calls).toEqual([['t', 0]])
  })
})
