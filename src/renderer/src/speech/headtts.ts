export type TtsDevice = 'webgpu' | 'wasm' | 'none'
export type SynthResult =
  { ok: true; data: { visemes: unknown[]; [k: string]: unknown } } | { ok: false; error: string }
export type HeadTtsLike = {
  connect(settings?: { endpoints: string[] } | null): Promise<unknown>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  synthesize(o: { input: string }): Promise<{ type: string; data: any }[]>
  setup(o: { voice?: string; audioEncoding?: 'wav' | 'pcm' }): Promise<unknown> | void
}
export type LoadTts = (settings: Record<string, unknown>) => Promise<HeadTtsLike>
export type Tts = {
  device: TtsDevice
  synthesize(text: string): Promise<SynthResult>
  synthPcm(text: string, voice: string): Promise<string | null> // base64 PCM16 LE 24 kHz mono
}

/** Worker death leaves HeadTTS promises pending forever (Pitfall 7), so every synth is bounded. */
export function synthTimeoutMs(text: string): number {
  return Math.max(10_000, text.length * 40)
}

// Exercised by the T2 E2E only: never bundled, so HeadTTS keeps its relative worker/dictionary URLs.
export const loadHeadTts: LoadTts = async (settings) => {
  const url = '/vendor/headtts/modules/headtts.mjs' // a variable, so Vite's import analysis leaves it alone
  const { HeadTTS } = await import(/* @vite-ignore */ url)
  return new HeadTTS(settings)
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

const none: Tts = {
  device: 'none',
  synthesize: async () => ({ ok: false, error: 'tts unavailable' }),
  synthPcm: async () => null
}

export async function connectTts(o: {
  load: LoadTts
  gpu: { requestAdapter(): Promise<unknown | null> } | undefined
  audioCtx: unknown
  voice: string
  voices: readonly string[]
  origin: string
  setTimeout?: typeof setTimeout
}): Promise<Tts> {
  const timer = o.setTimeout ?? setTimeout
  const adapter = o.gpu ? await o.gpu.requestAdapter().catch(() => null) : null
  let endpoint: 'webgpu' | 'wasm' = adapter ? 'webgpu' : 'wasm'

  let tts: HeadTtsLike
  try {
    tts = await o.load({
      endpoints: [endpoint],
      audioCtx: o.audioCtx,
      transformersModule: new URL('/vendor/headtts/tf-shim.mjs', o.origin).href,
      voiceURL: new URL('/res/models/voices', o.origin).href,
      voices: [...o.voices],
      defaultVoice: o.voice,
      splitSentences: false,
      dtypeWasm: 'fp32' // same local model.onnx as webgpu, so the fallback needs no extra download
    })
  } catch (err) {
    console.error('[voice] headtts load failed', err)
    return none
  }

  try {
    await (endpoint === 'webgpu' ? tts.connect() : tts.connect({ endpoints: ['wasm'] }))
  } catch (err) {
    console.error(`[voice] headtts connect (${endpoint}) failed`, err)
    if (endpoint === 'wasm') return none
    endpoint = 'wasm'
    try {
      await tts.connect({ endpoints: ['wasm'] })
    } catch (err2) {
      console.error('[voice] headtts connect (wasm) failed', err2)
      return none
    }
  }

  const synthesize = (text: string): Promise<SynthResult> =>
    new Promise<SynthResult>((resolve) => {
      let done = false
      const finish = (r: SynthResult): void => {
        if (!done) {
          done = true
          resolve(r)
        }
      }
      timer(() => {
        if (done) return
        finish({ ok: false, error: 'timeout' })
        tts.connect({ endpoints: [endpoint] }).catch(() => undefined) // a fresh worker for the next line
      }, synthTimeoutMs(text))
      tts.synthesize({ input: text }).then(
        (results) => {
          const audio = results?.find((m) => m.type === 'audio')
          if (audio) return finish({ ok: true, data: audio.data })
          const err = results?.find((m) => m.type === 'error')
          finish({ ok: false, error: String(err?.data?.error ?? 'no audio') })
        },
        (e: unknown) =>
          finish({ ok: false, error: e instanceof Error ? e.message : 'synth failed' })
      )
    })

  return {
    device: endpoint,
    synthesize,
    async synthPcm(text, voice) {
      try {
        await tts.setup({ voice, audioEncoding: 'pcm' })
        const r = await synthesize(text)
        // pcm mode: HeadTTS leaves data.audio as the raw Int16 LE ArrayBuffer (no decodeAudioData)
        return r.ok && r.data.audio instanceof ArrayBuffer ? toBase64(r.data.audio) : null
      } catch {
        return null
      } finally {
        await Promise.resolve(tts.setup({ voice: o.voice, audioEncoding: 'wav' })).catch(
          () => undefined
        )
      }
    }
  }
}
