// main <-> stt utilityProcess messages (types only).
export type ToWorker =
  | { type: 'init'; model: string }
  | { type: 'transcribe'; id: number; pcm: Float32Array; prompt?: string }
export type FromWorker =
  | { type: 'ready'; gpus: { name: string; description: string; type: string }[] }
  | { type: 'text'; id: number; text: string }
  | { type: 'error'; id?: number; code: 'init_failed' | 'transcribe_failed' }
