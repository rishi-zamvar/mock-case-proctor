// Chunked answers: transcribe ~20 s chunks as they arrive, join them in idx order on finish.
import type { SttPort, SttResult } from '../ports'

export type AnswerResult = { text: string; noAnswer: boolean; voicedMs: number }

type Entry = {
  parts: Map<number, Promise<SttResult>>
  waiters: Map<number, (p: Promise<SttResult>) => void>
}

const EMPTY: SttResult = { text: '', noAnswer: true, voicedMs: 0 }

function combine(rs: SttResult[]): AnswerResult {
  const text = rs
    .filter((r) => !r.noAnswer)
    .map((r) => r.text.trim())
    .filter(Boolean)
    .join(' ')
  return { text, noAnswer: text === '', voicedMs: rs.reduce((s, r) => s + (r.voicedMs ?? 0), 0) }
}

export function createAnswerAssembler(o: {
  stt: SttPort
  prompt(): string | undefined
  arrivalTimeoutMs?: number
}) {
  const timeoutMs = o.arrivalTimeoutMs ?? 5000
  let answers = new Map<string, Entry>()
  const entry = (id: string): Entry => {
    let e = answers.get(id)
    if (!e) answers.set(id, (e = { parts: new Map(), waiters: new Map() }))
    return e
  }
  const arrival = (e: Entry, idx: number): Promise<SttResult> =>
    e.parts.get(idx) ??
    new Promise<SttResult>((resolve) => {
      const t = setTimeout(() => resolve(EMPTY), timeoutMs)
      e.waiters.set(idx, (p) => {
        clearTimeout(t)
        resolve(p) // adopts p, rejection included
      })
    })

  return {
    chunk(answerId: string, idx: number, pcm: Float32Array): void {
      const e = entry(answerId)
      const p = o.stt.transcribe(pcm, { prompt: o.prompt() })
      p.catch(() => {}) // surfaced by finish; avoid an unhandled rejection before then
      e.parts.set(idx, p)
      e.waiters.get(idx)?.(p)
      e.waiters.delete(idx)
    },
    async finish(answerId: string | undefined, chunks: number): Promise<AnswerResult> {
      if (answerId === undefined || chunks === 0) {
        const r = await o.stt.transcribe(new Float32Array(0), { prompt: o.prompt() })
        const text = r.text.trim()
        return { text, noAnswer: text === '', voicedMs: r.voicedMs ?? 0 }
      }
      const e = entry(answerId)
      try {
        return combine(await Promise.all(Array.from({ length: chunks }, (_, i) => arrival(e, i))))
      } finally {
        if (answers.get(answerId) === e) answers.delete(answerId)
      }
    },
    reset(): void {
      answers = new Map()
    }
  }
}
