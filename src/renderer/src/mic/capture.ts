// Push-to-talk capture glue: one 16 kHz AudioContext, the mic stream (AEC/NS/AGC on), mute,
// and the E2E-only window.__mic WAV injection hook.
// Never log audio data. Capture only happens while recording.
import { createAccumulator, RATE } from './accumulator'

export type MicCapture = {
  start(onCap: () => void): Promise<void>
  stop(): Promise<{ answerId: string; chunks: number; ms: number }>
  setMuted(muted: boolean): void
  close(): void
}

type Rec = {
  answerId: string
  acc: ReturnType<typeof createAccumulator>
  source: MediaStreamAudioSourceNode
  node: AudioWorkletNode
  final: Promise<void>
}

export function createMicCapture(o: {
  send(answerId: string, idx: number, pcm: Float32Array): void
  deps?: {
    getUserMedia?: (c: MediaStreamConstraints) => Promise<MediaStream>
    makeContext?: () => AudioContext
    workletUrl?: string
    newId?: () => string
  }
}): MicCapture {
  const d = o.deps ?? {}
  const getUserMedia = d.getUserMedia ?? ((c) => navigator.mediaDevices.getUserMedia(c))
  const makeContext = d.makeContext ?? (() => new AudioContext({ sampleRate: RATE }))
  const newId = d.newId ?? (() => crypto.randomUUID())

  let ctxP: Promise<AudioContext> | null = null
  let streamP: Promise<MediaStream> | null = null
  let rec: Rec | null = null
  let muted = false
  let injected: AudioBuffer | null = null
  let endedP: Promise<void> = Promise.resolve()
  let liveTracks: MediaStreamTrack[] = []

  const context = (): Promise<AudioContext> =>
    (ctxP ??= (async () => {
      const ctx = makeContext()
      if (ctx.sampleRate !== RATE) throw new Error('capture context not 16 kHz')
      await ctx.audioWorklet.addModule(
        d.workletUrl ?? new URL('pcm-capture.worklet.js', document.baseURI).href
      )
      return ctx
    })())

  const applyMute = (): void => {
    for (const t of liveTracks) t.enabled = !muted
  }

  async function inputStream(ctx: AudioContext): Promise<MediaStream> {
    if (!injected) {
      streamP ??= getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      })
      return streamP
    }
    const dest = ctx.createMediaStreamDestination()
    const src = ctx.createBufferSource()
    src.buffer = injected
    src.connect(dest)
    injected = null
    endedP = new Promise((r) => (src.onended = () => r()))
    src.start()
    return dest.stream
  }

  const mic: MicCapture = {
    async start(onCap) {
      if (rec) return
      const ctx = await context()
      await ctx.resume()
      const stream = await inputStream(ctx)
      liveTracks = stream.getAudioTracks()
      applyMute()
      const answerId = newId()
      let capped = false
      const acc = createAccumulator({ onChunk: (idx, pcm) => o.send(answerId, idx, pcm) })
      const source = ctx.createMediaStreamSource(stream)
      const node = new AudioWorkletNode(ctx, 'pcm-capture')
      let resolveFinal!: () => void
      const final = new Promise<void>((r) => (resolveFinal = r))
      const push = (block: Float32Array): void => {
        if (acc.push(block) === 'cap' && !capped) {
          capped = true
          onCap()
        }
      }
      node.port.onmessage = (e: MessageEvent) => {
        if (rec?.node !== node) return
        if (e.data instanceof Float32Array) push(e.data)
        else if (e.data?.final instanceof Float32Array) {
          push(e.data.final)
          resolveFinal()
        }
      }
      source.connect(node)
      rec = { answerId, acc, source, node, final }
    },
    async stop() {
      const r = rec
      if (!r) throw new Error('not recording')
      r.node.port.postMessage({ flush: true })
      await r.final
      rec = null
      r.source.disconnect()
      const chunks = r.acc.flush()
      return { answerId: r.answerId, chunks, ms: r.acc.ms }
    },
    setMuted(m) {
      muted = m
      applyMute()
    },
    close() {
      rec = null
      void streamP?.then((s) => s.getTracks().forEach((t) => t.stop())).catch(() => {})
      void ctxP?.then((c) => c.close()).catch(() => {})
      streamP = ctxP = null
    }
  }

  if ('__e2e' in window) {
    const probe = {
      async load(b64Wav: string): Promise<number> {
        const bytes = Uint8Array.from(atob(b64Wav), (c) => c.charCodeAt(0))
        const ctx = await context()
        injected = await ctx.decodeAudioData(bytes.buffer)
        return Math.round(injected.duration * 1000)
      },
      ended: (): Promise<void> => endedP
    }
    Object.defineProperty(window, '__mic', { value: probe, configurable: true })
  }

  return mic
}
