import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMicCapture } from './capture'
import { RATE } from './accumulator'

type Msg = { data: unknown }

class FakeNode {
  static last: FakeNode | null = null
  partial = new Float32Array(100)
  port = {
    onmessage: null as ((e: Msg) => void) | null,
    postMessage: (m: { flush?: boolean }) => {
      if (m.flush) queueMicrotask(() => this.port.onmessage?.({ data: { final: this.partial } }))
    }
  }
  constructor(
    public ctx: unknown,
    public name: string
  ) {
    FakeNode.last = this
  }
  emit(block: Float32Array): void {
    this.port.onmessage?.({ data: block })
  }
}

function fakeTrack(): { enabled: boolean; stop: () => void } {
  return { enabled: true, stop: vi.fn() }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function setup(sampleRate = RATE) {
  const tracks = [fakeTrack(), fakeTrack()]
  const stream = { getAudioTracks: () => tracks, getTracks: () => tracks } as unknown as MediaStream
  const getUserMedia = vi.fn(async () => stream)
  const source = { connect: vi.fn(), disconnect: vi.fn() }
  const ctx = {
    sampleRate,
    audioWorklet: { addModule: vi.fn(async () => {}) },
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    createMediaStreamSource: vi.fn(() => source),
    createMediaStreamDestination: vi.fn(() => ({ stream })),
    createBufferSource: vi.fn(() => ({
      buffer: null,
      connect: vi.fn(),
      start: vi.fn(),
      onended: null as null | (() => void)
    })),
    decodeAudioData: vi.fn(async () => ({ duration: 1.234 }))
  }
  const sent: { id: string; idx: number; n: number }[] = []
  let n = 0
  const mic = createMicCapture({
    send: (id, idx, pcm) => sent.push({ id, idx, n: pcm.length }),
    deps: {
      getUserMedia,
      makeContext: () => ctx as unknown as AudioContext,
      workletUrl: 'app://bundle/pcm-capture.worklet.js',
      newId: () => `a${++n}`
    }
  })
  return { mic, getUserMedia, tracks, ctx, source, sent }
}

beforeEach(() => {
  vi.stubGlobal('AudioWorkletNode', FakeNode)
})
afterEach(() => {
  vi.unstubAllGlobals()
  delete (window as { __e2e?: unknown }).__e2e
  delete (window as { __mic?: unknown }).__mic
})

describe('createMicCapture', () => {
  it('given two cycles, when started, then getUserMedia is called once with AEC/NS/AGC and the worklet is added once', async () => {
    const { mic, getUserMedia, ctx } = setup()
    await mic.start(() => {})
    await mic.stop()
    await mic.start(() => {})
    await mic.stop()
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    })
    expect(ctx.audioWorklet.addModule).toHaveBeenCalledTimes(1)
    expect(ctx.audioWorklet.addModule).toHaveBeenCalledWith('app://bundle/pcm-capture.worklet.js')
  })

  it('given blocks while recording, when stopped, then the final partial is flushed and every chunk shares one answerId', async () => {
    const { mic, sent, source } = setup()
    await mic.start(() => {})
    const node = FakeNode.last!
    for (let i = 0; i < 25 * 4; i++) node.emit(new Float32Array(RATE / 4).fill(0.3))
    const r = await mic.stop()
    expect(r.answerId).toBe('a1')
    expect(r.chunks).toBe(2)
    expect(r.ms).toBe(25_000 + 100 / 16)
    expect(sent.map((s) => [s.id, s.idx])).toEqual([
      ['a1', 0],
      ['a1', 1]
    ])
    expect(sent.reduce((a, s) => a + s.n, 0)).toBe(25 * RATE + 100)
    expect(source.disconnect).toHaveBeenCalled()
  })

  it('given two recordings, when each starts, then each gets a new answerId', async () => {
    const { mic } = setup()
    await mic.start(() => {})
    const a = await mic.stop()
    await mic.start(() => {})
    const b = await mic.stop()
    expect(a.answerId).not.toBe(b.answerId)
  })

  it('given blocks after stop, when they arrive, then they are ignored', async () => {
    const { mic, sent } = setup()
    await mic.start(() => {})
    const node = FakeNode.last!
    await mic.stop()
    node.emit(new Float32Array(RATE))
    await mic.start(() => {})
    const r = await mic.stop()
    expect(r.ms).toBe(100 / 16)
    expect(sent.filter((s) => s.id === 'a2').map((s) => s.n)).toEqual([100])
  })

  it('given setMuted, when toggled, then every audio track enabled flips', async () => {
    const { mic, tracks } = setup()
    await mic.start(() => {})
    mic.setMuted(true)
    expect(tracks.every((t) => !t.enabled)).toBe(true)
    mic.setMuted(false)
    expect(tracks.every((t) => t.enabled)).toBe(true)
  })

  it('given the 5-minute cap, when reached, then onCap fires once', async () => {
    const { mic } = setup()
    const onCap = vi.fn()
    await mic.start(onCap)
    const node = FakeNode.last!
    for (let i = 0; i < 302; i++) node.emit(new Float32Array(RATE))
    expect(onCap).toHaveBeenCalledTimes(1)
    const r = await mic.stop()
    expect(r.ms).toBe(300_000)
  })

  it('given a context not at 16 kHz, when started, then it rejects', async () => {
    const { mic } = setup(48000)
    await expect(mic.start(() => {})).rejects.toThrow('capture context not 16 kHz')
  })

  it('given no __e2e, when created, then window.__mic is absent', () => {
    setup()
    expect('__mic' in window).toBe(false)
  })

  it('given __e2e and a loaded WAV, when the next recording starts, then it captures the WAV instead of the mic', async () => {
    ;(window as { __e2e?: unknown }).__e2e = true
    const { mic, ctx, getUserMedia } = setup()
    const probe = (
      window as unknown as { __mic: { load(b: string): Promise<number>; ended(): Promise<void> } }
    ).__mic
    expect(await probe.load(btoa('RIFF'))).toBe(1234)
    await mic.start(() => {})
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(1)
    const src = ctx.createBufferSource.mock.results[0].value
    expect(src.start).toHaveBeenCalled()
    expect(getUserMedia).not.toHaveBeenCalled()
    const ended = probe.ended()
    src.onended()
    await ended
    await mic.stop()
    await mic.start(() => {})
    expect(ctx.createBufferSource).toHaveBeenCalledTimes(1)
    expect(getUserMedia).toHaveBeenCalledTimes(1)
  })
})
