// Thin whisper-cpp-node wrapper. Loads the native addon: import only from stt/worker.ts and tests,
// never from main/compose.
import { createRequire } from 'node:module'

// 0.2.12's "import" export points at a dist/index.mjs that isn't published; require the CJS build.
const { createWhisperContext, getGpuDevices, transcribeAsync } = createRequire(import.meta.url)(
  'whisper-cpp-node'
) as typeof import('whisper-cpp-node')

export type GpuInfo = { name: string; description: string; type: string }
export type Engine = {
  transcribe(pcm16k: Float32Array, prompt?: string): Promise<string>
  readonly gpus: GpuInfo[]
  free(): void
}

export function loadEngine(model: string): Engine {
  const ctx = createWhisperContext({ model, use_gpu: true, flash_attn: true, no_prints: true })
  const gpus = getGpuDevices()
  return {
    gpus,
    // Never pass no_timestamps (truncates multi-window audio) or audio_ctx (broken on turbo).
    async transcribe(pcm, prompt) {
      const r = await transcribeAsync(ctx, {
        pcmf32: pcm,
        language: 'en',
        ...(prompt ? { prompt } : {})
      })
      return r.segments.map((s) => s.text).join('')
    },
    free: () => ctx.free()
  }
}
