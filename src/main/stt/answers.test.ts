import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SttPort, SttResult } from '../ports'
import { createAnswerAssembler } from './answers'

const deferred = () => {
  let resolve!: (r: SttResult) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<SttResult>((a, b) => ((resolve = a), (reject = b)))
  return { promise, resolve, reject }
}
const pcm = (n: number) => new Float32Array([n])

function setup(arrivalTimeoutMs?: number) {
  const pending: ReturnType<typeof deferred>[] = []
  const transcribe = vi.fn<SttPort['transcribe']>(() => {
    const d = deferred()
    pending.push(d)
    return d.promise
  })
  const a = createAnswerAssembler({ stt: { transcribe }, prompt: () => 'case vocab', arrivalTimeoutMs })
  return { a, transcribe, pending }
}

afterEach(() => vi.useRealTimers())

describe('createAnswerAssembler', () => {
  it('given chunks resolving out of order, when finished, then texts join in idx order and voicedMs sums', async () => {
    const { a, pending } = setup()
    a.chunk('A', 0, pcm(0))
    a.chunk('A', 1, pcm(1))
    a.chunk('A', 2, pcm(2))
    const done = a.finish('A', 3)
    pending[1].resolve({ text: 'the churn', voicedMs: 900 })
    pending[0].resolve({ text: ' Retention is high,', voicedMs: 1000 })
    pending[2].resolve({ text: 'is low. ', voicedMs: 500 })
    expect(await done).toEqual({ text: 'Retention is high, the churn is low.', noAnswer: false, voicedMs: 2400 })
  })

  it('given a chunk, when it arrives, then transcription starts immediately with the prompt', () => {
    const { a, transcribe } = setup()
    const p = pcm(0)
    a.chunk('A', 0, p)
    expect(transcribe).toHaveBeenCalledWith(p, { prompt: 'case vocab' })
  })

  it('given finish before the last chunk arrives, when it arrives, then finish waits for it', async () => {
    const { a, pending } = setup()
    a.chunk('A', 0, pcm(0))
    const done = a.finish('A', 2)
    pending[0].resolve({ text: 'one', voicedMs: 500 })
    a.chunk('A', 1, pcm(1))
    pending[1].resolve({ text: 'two', voicedMs: 500 })
    expect(await done).toEqual({ text: 'one two', noAnswer: false, voicedMs: 1000 })
  })

  it('given a chunk that never arrives, when the arrival timeout passes, then it counts as empty', async () => {
    vi.useFakeTimers()
    const { a, pending } = setup(5000)
    a.chunk('A', 0, pcm(0))
    pending[0].resolve({ text: 'one', voicedMs: 500 })
    const done = a.finish('A', 2)
    await vi.advanceTimersByTimeAsync(5000)
    expect(await done).toEqual({ text: 'one', noAnswer: false, voicedMs: 500 })
  })

  it('given every chunk is noAnswer or empty, when finished, then noAnswer', async () => {
    const { a, pending } = setup()
    a.chunk('A', 0, pcm(0))
    a.chunk('A', 1, pcm(1))
    const done = a.finish('A', 2)
    pending[0].resolve({ text: '', noAnswer: true, voicedMs: 0 })
    pending[1].resolve({ text: '  ', voicedMs: 20 })
    expect(await done).toEqual({ text: '', noAnswer: true, voicedMs: 20 })
  })

  it('given no answer id and 0 chunks (FakeStt path), when finished, then one empty-pcm call with the prompt', async () => {
    const transcribe = vi.fn<SttPort['transcribe']>(async () => ({ text: ' Canned answer. ' }))
    const a = createAnswerAssembler({ stt: { transcribe }, prompt: () => 'case vocab' })
    expect(await a.finish(undefined, 0)).toEqual({ text: 'Canned answer.', noAnswer: false, voicedMs: 0 })
    expect(transcribe).toHaveBeenCalledTimes(1)
    expect(transcribe).toHaveBeenCalledWith(new Float32Array(0), { prompt: 'case vocab' })
  })

  it('given the FakeStt path returns empty text, when finished, then noAnswer', async () => {
    const a = createAnswerAssembler({ stt: { transcribe: async () => ({ text: '' }) }, prompt: () => undefined })
    expect(await a.finish(undefined, 0)).toMatchObject({ text: '', noAnswer: true })
  })

  it('given an inner rejection on a chunk, when finished, then finish rejects with that error', async () => {
    const { a, pending } = setup()
    a.chunk('A', 0, pcm(0))
    a.chunk('A', 1, pcm(1))
    const err = new Error('whisper died')
    pending[1].reject(err)
    pending[0].resolve({ text: 'one' })
    await expect(a.finish('A', 2)).rejects.toBe(err)
  })

  it('given a finished answer, when the same id is reused, then old chunks are gone', async () => {
    vi.useFakeTimers()
    const { a, pending } = setup(10)
    a.chunk('A', 0, pcm(0))
    pending[0].resolve({ text: 'old', voicedMs: 500 })
    await a.finish('A', 1)
    const done = a.finish('A', 1)
    await vi.advanceTimersByTimeAsync(10)
    expect(await done).toEqual({ text: '', noAnswer: true, voicedMs: 0 })
  })

  it('given reset, when a chunk for a dropped id arrives, then it starts a fresh entry', async () => {
    vi.useFakeTimers()
    const { a, pending } = setup(10)
    a.chunk('A', 0, pcm(0))
    pending[0].resolve({ text: 'stale', voicedMs: 500 })
    a.reset()
    a.chunk('A', 1, pcm(1))
    pending[1].resolve({ text: 'fresh', voicedMs: 500 })
    const done = a.finish('A', 2)
    await vi.advanceTimersByTimeAsync(10)
    expect(await done).toEqual({ text: 'fresh', noAnswer: false, voicedMs: 500 })
  })
})
