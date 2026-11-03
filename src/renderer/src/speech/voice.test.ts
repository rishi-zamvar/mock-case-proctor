import { describe, it, expect, vi, afterEach } from 'vitest'
import { createVoice, getVoice, WARMUP_TEXT, VOICE, type EngineLike, type VoiceDeps } from './voice'
import type { Tts, TtsDevice } from './headtts'
import type { SynthData } from './speechQueue'
import type { SpeakEvent } from '../../../shared/ipc'

// TalkingHead-faithful head: one FIFO; idle markers fire synchronously; audio is busy until endAudio().
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function fakeEngine() {
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
  let readyResolve!: () => void
  const ready = new Promise<void>((r) => (readyResolve = r))
  const engine = {
    host: document.createElement('div'),
    ready,
    head: {
      audioCtx: { resume: vi.fn(async () => undefined) },
      get isSpeaking() {
        return busy
      },
      speakAudio: vi.fn((d: SynthData) => {
        fifo.push({ audio: d })
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
    },
    setVisible: vi.fn(),
    setPlaying: vi.fn(),
    setState: vi.fn(),
    state: vi.fn(() => 'idle' as const),
    stateLog: vi.fn(() => ['thinking' as const]),
    opaqueFraction: vi.fn(() => 0.42)
  } satisfies EngineLike
  return {
    engine,
    played,
    readyResolve,
    endAudio(): void {
      busy = false
      pump()
    }
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function fakeTts(device: TtsDevice = 'webgpu') {
  return {
    device,
    synthesize: vi.fn(async (text: string) => ({
      ok: true as const,
      data: { visemes: [1, 2, 3], text }
    })),
    synthPcm: vi.fn(async () => 'UENN')
  } satisfies Tts
}

const flush = async (): Promise<void> => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function setup(o: { device?: TtsDevice; makeEngine?: VoiceDeps['makeEngine'] } = {}) {
  const fe = fakeEngine()
  fe.readyResolve()
  const tts = fakeTts(o.device)
  const deps = {
    makeEngine: vi.fn(o.makeEngine ?? (async () => fe.engine)),
    connect: vi.fn(async () => tts),
    instances: () => 1
  }
  const ack = vi.fn()
  const voice = createVoice({ ack, deps })
  return { fe, tts, deps, ack, voice }
}

const ev = (turnId: string, seq: number, text = `line ${seq}`): SpeakEvent => ({
  turnId,
  seq,
  text
})

afterEach(() => {
  delete (window as { __e2e?: unknown }).__e2e
  delete (window as { __voice?: unknown }).__voice
})

describe('voice warm-up', () => {
  it('given warm() twice, when awaited, then engine and tts are made once and the same promise returns', async () => {
    const { voice, deps } = setup()
    const a = voice.warm()
    const b = voice.warm()
    expect(a).toBe(b)
    await a
    expect(deps.makeEngine).toHaveBeenCalledTimes(1)
    expect(deps.connect).toHaveBeenCalledTimes(1)
  })

  it('given warm(), when done, then WARMUP_TEXT is synthesised once and never played', async () => {
    const { voice, tts, fe } = setup()
    await voice.warm()
    expect(tts.synthesize).toHaveBeenCalledTimes(1)
    expect(tts.synthesize).toHaveBeenCalledWith(WARMUP_TEXT)
    expect(fe.engine.head.speakAudio).not.toHaveBeenCalled()
  })

  it('given warm(), when done, then the engine host is inside the stable voice host', async () => {
    const { voice, fe } = setup()
    const host = voice.host
    await voice.warm()
    expect(voice.host).toBe(host)
    expect(host.contains(fe.engine.host)).toBe(true)
  })

  it('given device listeners, when warm resolves, then device() and onDevice report it once', async () => {
    const { voice } = setup({ device: 'wasm' })
    const cb = vi.fn()
    voice.onDevice(cb)
    expect(voice.device()).toBeNull()
    await voice.warm()
    await voice.warm()
    expect(voice.device()).toBe('wasm')
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledWith('wasm')
    const late = vi.fn()
    voice.onDevice(late)
    expect(late).toHaveBeenCalledWith('wasm')
  })

  it('given makeEngine rejects, when warming, then device is none and enqueued seqs ack false', async () => {
    const { voice, ack } = setup({ makeEngine: async () => Promise.reject(new Error('gl')) })
    voice.enqueue(ev('t1', 0))
    await voice.warm()
    await flush()
    expect(voice.device()).toBe('none')
    expect(ack).toHaveBeenCalledWith('t1', 0, false)
  })

  it('given setVisible/setState before the engine exists, when it arrives, then the latest values are replayed', async () => {
    const { voice, fe } = setup()
    voice.setVisible(true)
    voice.setState('thinking')
    await voice.warm()
    expect(fe.engine.setVisible).toHaveBeenLastCalledWith(true)
    expect(fe.engine.setState).toHaveBeenLastCalledWith('thinking')
    voice.setVisible(false)
    expect(fe.engine.setVisible).toHaveBeenLastCalledWith(false)
  })

  it('given resume(), when the engine exists, then the shared AudioContext resumes', async () => {
    const { voice, fe } = setup()
    voice.resume()
    await voice.warm()
    voice.resume()
    expect(fe.engine.head.audioCtx.resume).toHaveBeenCalledTimes(1)
  })
})

describe('voice playback', () => {
  it('given enqueue before warm, when ready, then warm starts, audio plays and the end marker acks true', async () => {
    const { voice, deps, fe, ack } = setup()
    voice.enqueue(ev('t1', 0))
    expect(deps.makeEngine).toHaveBeenCalledTimes(1)
    await flush()
    expect(fe.engine.head.speakAudio).toHaveBeenCalledTimes(1)
    expect(fe.engine.setPlaying).toHaveBeenCalledWith(true)
    expect(ack).not.toHaveBeenCalled()
    fe.endAudio()
    expect(ack).toHaveBeenCalledWith('t1', 0, true)
  })

  it('given the engine is not ready, when enqueued, then nothing plays until engine.ready', async () => {
    const fe = fakeEngine()
    const tts = fakeTts()
    const voice = createVoice({
      ack: vi.fn(),
      deps: { makeEngine: async () => fe.engine, connect: async () => tts }
    })
    voice.enqueue(ev('t1', 0))
    await flush()
    expect(fe.engine.head.speakAudio).not.toHaveBeenCalled()
    fe.readyResolve()
    await flush()
    expect(fe.engine.head.speakAudio).toHaveBeenCalledTimes(1)
  })

  it('given playback, when the queue drains, then engine sleeps and onPlaying listeners hear true then false', async () => {
    const { voice, fe } = setup()
    const heard: boolean[] = []
    voice.onPlaying((p) => heard.push(p))
    voice.enqueue(ev('t1', 0))
    await flush()
    expect(voice.isPlaying()).toBe(true)
    const order = fe.engine.setPlaying.mock.invocationCallOrder[0]
    expect(order).toBeLessThan(fe.engine.head.speakAudio.mock.invocationCallOrder[0])
    fe.endAudio()
    expect(heard).toEqual([true, false])
    expect(fe.engine.setPlaying).toHaveBeenLastCalledWith(false)
    expect(voice.isPlaying()).toBe(false)
  })

  it('given a playing turn, when cancelled, then stopSpeaking runs and unplayed seqs ack false', async () => {
    const { voice, fe, ack } = setup()
    voice.enqueue(ev('t1', 0))
    voice.enqueue(ev('t1', 1))
    await flush()
    voice.cancel('t1')
    expect(fe.engine.head.stopSpeaking).toHaveBeenCalledTimes(1)
    expect(ack).toHaveBeenCalledWith('t1', 0, false)
    expect(ack).toHaveBeenCalledWith('t1', 1, false)
  })

  it('given device none, when enqueued, then seqs ack false promptly without playing', async () => {
    const { voice, fe, ack } = setup({ device: 'none' })
    voice.enqueue(ev('t1', 0))
    voice.enqueue(ev('t1', 1))
    await flush()
    expect(ack).toHaveBeenCalledWith('t1', 0, false)
    expect(ack).toHaveBeenCalledWith('t1', 1, false)
    expect(fe.engine.head.speakAudio).not.toHaveBeenCalled()
  })
})

describe('window.__voice probe', () => {
  it('given no __e2e, when created, then window.__voice is absent', () => {
    setup()
    expect('__voice' in window).toBe(false)
  })

  it('given __e2e, when created and warmed, then the probe exposes the VoiceProbe fields', async () => {
    ;(window as { __e2e?: unknown }).__e2e = {}
    const { voice, fe, tts } = setup()
    const p = window.__voice!
    expect(p.ttsDevice).toBeNull()
    expect(p.ready).toBe(false)
    expect(p.instances).toBe(1)
    expect(p.avatarState).toBe('idle')
    expect(p.stateLog).toEqual([])
    expect(p.opaqueFraction()).toBe(0)
    await voice.warm()
    expect(p.ttsDevice).toBe('webgpu')
    expect(p.ready).toBe(true)
    expect(p.stateLog).toEqual(['thinking'])
    expect(p.opaqueFraction()).toBe(0.42)
    voice.enqueue(ev('t1', 0))
    await flush()
    expect(p.isSpeaking).toBe(true)
    fe.endAudio()
    expect(p.isSpeaking).toBe(false)
    expect(p.visemeCount).toBe(3)
    expect(p.spokenSeqs.map((s) => s.seq)).toEqual([0])
    await expect(p.audition('bm_lewis', 'hi')).resolves.toBe('UENN')
    expect(tts.synthPcm).toHaveBeenCalledWith('hi', 'bm_lewis')
  })

  it('given no tts, when auditioning, then it rejects', async () => {
    ;(window as { __e2e?: unknown }).__e2e = {}
    setup({ makeEngine: async () => Promise.reject(new Error('gl')) })
    await expect(window.__voice!.audition('bm_lewis', 'hi')).rejects.toThrow()
  })
})

describe('getVoice', () => {
  it('given repeated calls, when called, then the same voice returns and VOICE is the locked default', () => {
    const a = getVoice({ ack: vi.fn() })
    expect(getVoice({ ack: vi.fn() })).toBe(a)
    expect(VOICE).toBe('bm_george')
  })
})
