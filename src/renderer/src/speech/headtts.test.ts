import { describe, it, expect, vi, afterEach } from 'vitest'
import { connectTts, synthTimeoutMs, type HeadTtsLike } from './headtts'

type Script = {
  connect?: (s?: { endpoints: string[] } | null) => Promise<unknown>
  synthesize?: (o: { input: string }) => Promise<{ type: string; data: any }[]>
}

function fakeTts(script: Script = {}) {
  const tts = {
    connect: vi.fn(script.connect ?? (async () => undefined)),
    synthesize: vi.fn(script.synthesize ?? (async () => [{ type: 'audio', data: { visemes: [] } }])),
    setup: vi.fn(async () => undefined)
  } satisfies HeadTtsLike
  return tts
}

const adapterGpu = { requestAdapter: async () => ({}) }
const nullGpu = { requestAdapter: async () => null }

function opts(tts: HeadTtsLike, gpu: { requestAdapter(): Promise<unknown | null> } | undefined) {
  const load = vi.fn(async () => tts)
  return {
    load,
    o: {
      load,
      gpu,
      audioCtx: { tag: 'ctx' },
      voice: 'am_michael',
      voices: ['am_michael', 'bm_george'] as const,
      origin: 'app://bundle/index.html'
    }
  }
}

afterEach(() => vi.useRealTimers())

describe('synthTimeoutMs', () => {
  it('given short and long text, when computed, then floors at 10 s and scales 40 ms/char', () => {
    expect(synthTimeoutMs('a')).toBe(10_000)
    expect(synthTimeoutMs('x'.repeat(500))).toBe(20_000)
  })
})

describe('connectTts device detection', () => {
  it('given no navigator.gpu, when connecting, then loads once and connects wasm only', async () => {
    const tts = fakeTts()
    const { load, o } = opts(tts, undefined)
    const t = await connectTts(o)
    expect(load).toHaveBeenCalledTimes(1)
    expect(tts.connect.mock.calls).toEqual([[{ endpoints: ['wasm'] }]])
    expect(t.device).toBe('wasm')
  })

  it('given a null adapter, when connecting, then skips webgpu and uses wasm', async () => {
    const tts = fakeTts()
    const { load, o } = opts(tts, nullGpu)
    const t = await connectTts(o)
    expect(load.mock.calls[0][0].endpoints).toEqual(['wasm'])
    expect(tts.connect.mock.calls).toEqual([[{ endpoints: ['wasm'] }]])
    expect(t.device).toBe('wasm')
  })

  it('given an adapter and a successful webgpu connect, when connecting, then device is webgpu with no wasm attempt', async () => {
    const tts = fakeTts()
    const { load, o } = opts(tts, adapterGpu)
    const t = await connectTts(o)
    expect(load.mock.calls[0][0].endpoints).toEqual(['webgpu'])
    expect(tts.connect).toHaveBeenCalledTimes(1)
    expect(tts.connect.mock.calls[0][0]).not.toEqual({ endpoints: ['wasm'] })
    expect(t.device).toBe('webgpu')
  })

  it('given webgpu connect rejects, when connecting, then reconnects on wasm', async () => {
    let n = 0
    const tts = fakeTts({
      connect: async () => {
        if (n++ === 0) throw new Error('HeadTTS connection failed')
      }
    })
    const { o } = opts(tts, adapterGpu)
    const t = await connectTts(o)
    expect(tts.connect.mock.calls[1]).toEqual([{ endpoints: ['wasm'] }])
    expect(t.device).toBe('wasm')
  })

  it('given wasm also rejects, when synthesizing, then device none and ok:false without calling HeadTTS', async () => {
    const tts = fakeTts({
      connect: async () => {
        throw new Error('nope')
      }
    })
    const { o } = opts(tts, adapterGpu)
    const t = await connectTts(o)
    expect(t.device).toBe('none')
    expect((await t.synthesize('hello')).ok).toBe(false)
    expect(await t.synthPcm('hello', 'am_michael')).toBeNull()
    expect(tts.synthesize).not.toHaveBeenCalled()
  })

  it('given load rejects, when connecting, then device none', async () => {
    const { o } = opts(fakeTts(), undefined)
    const t = await connectTts({ ...o, load: async () => Promise.reject(new Error('404')) })
    expect(t.device).toBe('none')
    expect((await t.synthesize('x')).ok).toBe(false)
  })

  it('given any device, when loading, then passes absolute local URLs and fallback-safe settings', async () => {
    const { load, o } = opts(fakeTts(), adapterGpu)
    await connectTts(o)
    expect(load.mock.calls[0][0]).toMatchObject({
      endpoints: ['webgpu'],
      audioCtx: { tag: 'ctx' },
      transformersModule: 'app://bundle/vendor/headtts/tf-shim.mjs',
      voiceURL: 'app://bundle/res/models/voices',
      voices: ['am_michael', 'bm_george'],
      defaultVoice: 'am_michael',
      splitSentences: false,
      dtypeWasm: 'fp32'
    })
  })
})

describe('Tts.synthesize', () => {
  it('given an audio result, when synthesizing, then ok:true with its data', async () => {
    const data = { visemes: ['aa'], audio: {} }
    const tts = fakeTts({ synthesize: async () => [{ type: 'audio', data }] })
    const t = await connectTts(opts(tts, adapterGpu).o)
    expect(await t.synthesize('hi')).toEqual({ ok: true, data })
    expect(tts.synthesize).toHaveBeenCalledWith({ input: 'hi' })
  })

  it('given an error result, when synthesizing, then ok:false with the message', async () => {
    const tts = fakeTts({ synthesize: async () => [{ type: 'error', data: { error: 'x' } }] })
    const t = await connectTts(opts(tts, adapterGpu).o)
    expect(await t.synthesize('hi')).toEqual({ ok: false, error: 'x' })
  })

  it('given a rejection, when synthesizing, then ok:false', async () => {
    const tts = fakeTts({ synthesize: async () => Promise.reject(new Error('boom')) })
    const t = await connectTts(opts(tts, adapterGpu).o)
    expect((await t.synthesize('hi')).ok).toBe(false)
  })

  it('given a synth that never settles, when the timeout elapses, then ok:false timeout and a reconnect on the current endpoint', async () => {
    vi.useFakeTimers()
    let n = 0
    const tts = fakeTts({
      connect: async () => {
        if (n++ === 0) throw new Error('no webgpu')
      },
      synthesize: () => new Promise(() => {})
    })
    const t = await connectTts(opts(tts, adapterGpu).o)
    expect(t.device).toBe('wasm')
    const p = t.synthesize('hello')
    await vi.advanceTimersByTimeAsync(synthTimeoutMs('hello') - 1)
    let settled = false
    void p.then(() => (settled = true))
    await Promise.resolve()
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(await p).toEqual({ ok: false, error: 'timeout' })
    expect(tts.connect).toHaveBeenCalledTimes(3)
    expect(tts.connect.mock.calls[2]).toEqual([{ endpoints: ['wasm'] }])
  })
})

describe('Tts.synthPcm', () => {
  it('given a pcm result, when auditioning, then sets pcm voice, returns base64 bytes and restores wav default', async () => {
    const pcm = new Int16Array([1, -1, 300]).buffer
    const tts = fakeTts({ synthesize: async () => [{ type: 'audio', data: { visemes: [], audio: pcm } }] })
    const t = await connectTts(opts(tts, adapterGpu).o)
    const b64 = await t.synthPcm('sample', 'bm_george')
    expect(tts.setup.mock.calls).toEqual([
      [{ voice: 'bm_george', audioEncoding: 'pcm' }],
      [{ voice: 'am_michael', audioEncoding: 'wav' }]
    ])
    const back = Uint8Array.from(atob(b64!), (c) => c.charCodeAt(0))
    expect(Array.from(new Int16Array(back.buffer))).toEqual([1, -1, 300])
  })

  it('given the synth fails, when auditioning, then returns null and still restores wav default', async () => {
    const tts = fakeTts({ synthesize: async () => Promise.reject(new Error('boom')) })
    const t = await connectTts(opts(tts, adapterGpu).o)
    expect(await t.synthPcm('sample', 'bm_george')).toBeNull()
    expect(tts.setup.mock.calls.at(-1)).toEqual([{ voice: 'am_michael', audioEncoding: 'wav' }])
  })

  it('given a large buffer, when auditioning, then base64 round-trips without stack overflow', async () => {
    const bytes = new Uint8Array(300_000).map((_, i) => i % 256)
    const tts = fakeTts({ synthesize: async () => [{ type: 'audio', data: { visemes: [], audio: bytes.buffer } }] })
    const t = await connectTts(opts(tts, adapterGpu).o)
    const back = Uint8Array.from(atob((await t.synthPcm('s', 'am_michael'))!), (c) => c.charCodeAt(0))
    expect(back.length).toBe(300_000)
    expect(back[257]).toBe(1)
  })
})
