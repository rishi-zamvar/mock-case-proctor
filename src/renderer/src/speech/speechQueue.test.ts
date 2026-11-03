import { describe, it, expect, vi } from 'vitest'
import { createSpeechQueue, type HeadLike, type SynthData, type SynthResult } from './speechQueue'

// Mirrors TalkingHead 1.8.2: one FIFO of markers and audio; idle markers fire synchronously;
// audio keeps it busy until endAudio(); stopSpeaking() clears everything so pending markers never fire.
type Mocked<T> = { [K in keyof T]: T[K] & ReturnType<typeof vi.fn> }
type FakeHead = {
  head: Mocked<HeadLike>
  played: SynthData[]
  readonly isSpeaking: boolean
  endAudio(): void
}
function fakeHead(): FakeHead {
  type Item = { marker: () => void } | { audio: SynthData }
  let fifo: Item[] = []
  let busy = false
  const played: SynthData[] = []
  const pump = (): void => {
    while (!busy && fifo.length) {
      const it = fifo.shift()!
      if ('marker' in it) it.marker()
      else {
        busy = true
        played.push(it.audio)
      }
    }
  }
  const head: Mocked<HeadLike> = {
    speakAudio: vi.fn((data: SynthData) => {
      fifo.push({ audio: data })
      pump()
    }),
    speakMarker: vi.fn((fn: () => void) => {
      fifo.push({ marker: fn })
      pump()
    }),
    stopSpeaking: vi.fn(() => {
      fifo = []
      busy = false
    })
  }
  return {
    head,
    played,
    get isSpeaking() {
      return busy
    },
    endAudio() {
      busy = false
      pump()
    }
  }
}

type Deferred<T> = { promise: Promise<T>; resolve(v: T): void; reject(e: unknown): void }
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

const data = (seq: number, visemes = seq + 1): SynthData => ({
  seq,
  visemes: Array(visemes).fill(0)
})
const ok = (seq: number, visemes?: number): SynthResult => ({ ok: true, data: data(seq, visemes) })

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- test harness, inferred shape
function setup(opts: { ready?: Promise<void> } = {}) {
  const h = fakeHead()
  const synth = new Map<string, Deferred<SynthResult>>()
  const tts = {
    synthesize: vi.fn((text: string) => {
      const d = deferred<SynthResult>()
      synth.set(text, d)
      return d.promise
    })
  }
  const events: string[] = []
  const ack = vi.fn((turnId: string, seq: number, spoken: boolean) => {
    events.push(`ack:${turnId}:${seq}:${spoken}`)
  })
  const onPlaying = vi.fn((p: boolean) => events.push(`playing:${p}`))
  let t = 0
  const enqueued: string[] = []
  const q = createSpeechQueue({
    tts,
    head: h.head,
    ready: opts.ready ?? Promise.resolve(),
    ack,
    onPlaying,
    now: () => ++t
  })
  const enqueue = (turnId: string, seq: number): void => {
    enqueued.push(`${turnId}:${seq}`)
    q.enqueue({ turnId, seq, text: `${turnId}-${seq}` })
  }
  const resolve = (turnId: string, seq: number, r: SynthResult = ok(seq)): void =>
    synth.get(`${turnId}-${seq}`)!.resolve(r)
  const reject = (turnId: string, seq: number): void =>
    synth.get(`${turnId}-${seq}`)!.reject(new Error('worker died'))
  const playedSeqs = (): number[] => h.played.map((d) => d.seq as number)
  // every enqueued seq acked exactly once
  const assertExactlyOnce = (): void => {
    const keys = ack.mock.calls.map(([tid, s]) => `${tid}:${s}`)
    expect(new Set(keys).size).toBe(keys.length)
    expect([...keys].sort()).toEqual([...enqueued].sort())
  }
  return {
    h,
    tts,
    ack,
    onPlaying,
    events,
    q,
    enqueue,
    resolve,
    reject,
    playedSeqs,
    assertExactlyOnce
  }
}

describe('speech queue', () => {
  it('given three sentences, when enqueued, then all are synthesised immediately in order (pre-synthesis)', async () => {
    const s = setup()
    s.enqueue('t', 0)
    s.enqueue('t', 1)
    s.enqueue('t', 2)
    expect(s.tts.synthesize.mock.calls.map((c) => c[0])).toEqual(['t-0', 't-1', 't-2'])
    s.resolve('t', 0)
    await flush()
    expect(s.ack).not.toHaveBeenCalled()
    expect(s.tts.synthesize).toHaveBeenCalledTimes(3)
  })

  it('given results resolved out of order, when played, then speakAudio still receives s0, s1, s2', async () => {
    const s = setup()
    s.enqueue('t', 0)
    s.enqueue('t', 1)
    s.enqueue('t', 2)
    s.resolve('t', 2)
    s.resolve('t', 1)
    await flush()
    expect(s.h.head.speakAudio).not.toHaveBeenCalled()
    s.resolve('t', 0)
    await flush()
    expect(s.h.head.speakAudio.mock.calls.map((c) => c[0].seq)).toEqual([0, 1, 2])
    expect(s.playedSeqs()).toEqual([0])
  })

  it('given s0 playing, when its audio ends, then ack(t,0,true) once, s1 plays, acks in seq order', async () => {
    const s = setup()
    s.enqueue('t', 0)
    s.enqueue('t', 1)
    s.enqueue('t', 2)
    s.resolve('t', 0)
    s.resolve('t', 1)
    s.resolve('t', 2)
    await flush()
    s.h.endAudio()
    expect(s.ack.mock.calls).toEqual([['t', 0, true]])
    expect(s.playedSeqs()).toEqual([0, 1])
    s.h.endAudio()
    s.h.endAudio()
    expect(s.ack.mock.calls).toEqual([
      ['t', 0, true],
      ['t', 1, true],
      ['t', 2, true]
    ])
    s.assertExactlyOnce()
  })

  it('given s1 still synthesising, when s0 ends, then playing stays true until the last ack', async () => {
    const s = setup()
    s.enqueue('t', 0)
    s.enqueue('t', 1)
    s.resolve('t', 0)
    await flush()
    expect(s.onPlaying.mock.calls).toEqual([[true]])
    expect(s.q.isPlaying()).toBe(true)
    s.h.endAudio()
    expect(s.onPlaying.mock.calls).toEqual([[true]])
    s.resolve('t', 1)
    await flush()
    s.h.endAudio()
    expect(s.events).toEqual(['playing:true', 'ack:t:0:true', 'ack:t:1:true', 'playing:false'])
    expect(s.q.isPlaying()).toBe(false)
    s.assertExactlyOnce()
  })

  it('given sentences that started, when stats read, then spoken lists timings and visemeCount sums only started ones', async () => {
    const s = setup()
    s.enqueue('t', 0)
    s.enqueue('t', 1)
    s.enqueue('t', 2)
    s.resolve('t', 0, ok(0, 4))
    s.resolve('t', 1, ok(1, 7))
    await flush()
    s.h.endAudio() // s0 ends, s1 starts
    const st = s.q.stats()
    expect(st.spoken.map(({ turnId, seq, visemes }) => ({ turnId, seq, visemes }))).toEqual([
      { turnId: 't', seq: 0, visemes: 4 },
      { turnId: 't', seq: 1, visemes: 7 }
    ])
    expect(st.spoken[0].endedAt).toBeGreaterThan(st.spoken[0].startedAt)
    expect(st.spoken[1].endedAt).toBeNull()
    expect(st.visemeCount).toBe(11)
    s.q.cancel('t')
  })

  it('given s0 playing and s1/s2 queued, when cancel(t), then stop once, all acked false, no stale audio', async () => {
    const s = setup()
    s.enqueue('t', 0)
    s.enqueue('t', 1)
    s.enqueue('t', 2)
    s.resolve('t', 0)
    s.resolve('t', 1)
    await flush()
    s.q.cancel('t')
    expect(s.h.head.stopSpeaking).toHaveBeenCalledTimes(1)
    expect(s.ack.mock.calls).toEqual([
      ['t', 0, false],
      ['t', 1, false],
      ['t', 2, false]
    ])
    expect(s.q.isPlaying()).toBe(false)
    expect(s.onPlaying.mock.calls).toEqual([[true], [false]])
    s.resolve('t', 2)
    await flush()
    s.h.endAudio()
    expect(s.h.head.speakAudio.mock.calls.map((c) => c[0].seq)).toEqual([0, 1])
    expect(s.ack.mock.calls.some((c) => c[2] === true)).toBe(false)
    s.assertExactlyOnce()
  })

  it('given only unsynthesised items of t remain, when cancel(t), then no stopSpeaking and those seqs acked false', async () => {
    const s = setup()
    s.enqueue('t', 0)
    s.enqueue('t', 1)
    s.resolve('t', 0)
    await flush()
    s.h.endAudio()
    s.q.cancel('t')
    expect(s.h.head.stopSpeaking).not.toHaveBeenCalled()
    expect(s.ack.mock.calls).toEqual([
      ['t', 0, true],
      ['t', 1, false]
    ])
    expect(s.q.isPlaying()).toBe(false)
    s.assertExactlyOnce()
  })

  it('given turn t playing, when cancel(other), then t is untouched', async () => {
    const s = setup()
    s.enqueue('t', 0)
    s.enqueue('t', 1)
    s.resolve('t', 0)
    s.resolve('t', 1)
    await flush()
    s.q.cancel('other')
    expect(s.h.head.stopSpeaking).not.toHaveBeenCalled()
    expect(s.ack).not.toHaveBeenCalled()
    s.h.endAudio()
    s.h.endAudio()
    expect(s.ack.mock.calls).toEqual([
      ['t', 0, true],
      ['t', 1, true]
    ])
    s.assertExactlyOnce()
  })

  it('given t cancelled with a synth still pending, when turn u enqueued, then u plays normally', async () => {
    const s = setup()
    s.enqueue('t', 0)
    s.enqueue('t', 1)
    s.resolve('t', 0)
    await flush()
    s.q.cancel('t') // t-1 synth never resolves
    s.enqueue('u', 0)
    s.resolve('u', 0)
    await flush()
    expect(s.h.head.speakAudio.mock.calls.map((c) => c[0].seq)).toEqual([0, 0])
    expect(s.q.isPlaying()).toBe(true)
    s.h.endAudio()
    expect(s.ack).toHaveBeenLastCalledWith('u', 0, true)
    expect(s.onPlaying.mock.calls).toEqual([[true], [false], [true], [false]])
    s.assertExactlyOnce()
  })

  it('given synth fails for s1, when played, then ack(t,1,false) in order and s2 still plays', async () => {
    const s = setup()
    s.enqueue('t', 0)
    s.enqueue('t', 1)
    s.enqueue('t', 2)
    s.resolve('t', 0)
    s.resolve('t', 1, { ok: false, error: 'timeout' })
    s.resolve('t', 2)
    await flush()
    expect(s.ack).not.toHaveBeenCalled()
    s.h.endAudio()
    expect(s.playedSeqs()).toEqual([0, 2])
    s.h.endAudio()
    expect(s.ack.mock.calls).toEqual([
      ['t', 0, true],
      ['t', 1, false],
      ['t', 2, true]
    ])
    s.assertExactlyOnce()
  })

  it('given synth rejects, when played, then that seq acked false and the queue continues', async () => {
    const s = setup()
    s.enqueue('t', 0)
    s.enqueue('t', 1)
    s.reject('t', 0)
    s.resolve('t', 1)
    await flush()
    expect(s.ack.mock.calls).toEqual([['t', 0, false]])
    expect(s.playedSeqs()).toEqual([1])
    s.h.endAudio()
    expect(s.ack).toHaveBeenLastCalledWith('t', 1, true)
    s.assertExactlyOnce()
  })

  it('given ready pending, when items enqueued, then nothing reaches the head until ready', async () => {
    const r = deferred<void>()
    const s = setup({ ready: r.promise })
    s.enqueue('t', 0)
    s.resolve('t', 0)
    await flush()
    expect(s.h.head.speakAudio).not.toHaveBeenCalled()
    expect(s.h.head.speakMarker).not.toHaveBeenCalled()
    r.resolve()
    await flush()
    expect(s.playedSeqs()).toEqual([0])
    s.h.endAudio()
    s.assertExactlyOnce()
  })

  it('given ready rejects, when items queued, then every seq acked false and no speakAudio', async () => {
    const r = deferred<void>()
    const s = setup({ ready: r.promise })
    s.enqueue('t', 0)
    s.enqueue('t', 1)
    s.resolve('t', 0)
    r.reject(new Error('avatar failed'))
    await flush()
    expect(s.h.head.speakAudio).not.toHaveBeenCalled()
    expect(s.ack.mock.calls).toEqual([
      ['t', 0, false],
      ['t', 1, false]
    ])
    s.assertExactlyOnce()
  })

  it('given two turns queued, when clear(), then behaves as cancel of every turn', async () => {
    const s = setup()
    s.enqueue('t', 0)
    s.enqueue('u', 0)
    s.enqueue('u', 1)
    s.resolve('t', 0)
    s.resolve('u', 0)
    await flush()
    s.q.clear()
    expect(s.h.head.stopSpeaking).toHaveBeenCalledTimes(1)
    expect(s.ack.mock.calls.every((c) => c[2] === false)).toBe(true)
    expect(s.q.isPlaying()).toBe(false)
    s.resolve('u', 1)
    await flush()
    expect(s.h.head.speakAudio).toHaveBeenCalledTimes(2)
    s.assertExactlyOnce()
  })
})
