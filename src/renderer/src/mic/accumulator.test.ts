import { describe, expect, it } from 'vitest'
import { createAccumulator, FRAME, quietestCut, RATE } from './accumulator'

function loud(n: number): Float32Array {
  const a = new Float32Array(n)
  for (let i = 0; i < n; i++) a[i] = 0.5 * Math.sin(i / 3)
  return a
}

function pushAll(
  acc: ReturnType<typeof createAccumulator>,
  pcm: Float32Array,
  block = 4096
): string[] {
  const out: string[] = []
  for (let i = 0; i < pcm.length; i += block) out.push(acc.push(pcm.slice(i, i + block)))
  return out
}

type Chunk = { idx: number; pcm: Float32Array }

describe('quietestCut', () => {
  it('given a zeroed frame inside loud audio, when searched, then returns its start', () => {
    const from = 1000
    const pcm = loud(from + 3200)
    pcm.fill(0, from + 640, from + 960)
    expect(quietestCut(pcm, from, from + 3200)).toBe(from + 640)
  })
})

describe('createAccumulator', () => {
  it('given 25 s with a silent frame at 19.5 s, when pushed, then one chunk is cut there as a copy', () => {
    const chunks: Chunk[] = []
    const acc = createAccumulator({ onChunk: (idx, pcm) => chunks.push({ idx, pcm }) })
    const pcm = loud(25 * RATE)
    const silent = 19.5 * RATE
    pcm.fill(0, silent, silent + FRAME)
    pushAll(acc, pcm)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].idx).toBe(0)
    expect(chunks[0].pcm.length).toBe(silent)
    expect(chunks[0].pcm.buffer.byteLength).toBe(chunks[0].pcm.length * 4)
  })

  it('given no silent frame, when 20 s is crossed, then the cut lands in [18 s, 20 s] on a frame boundary', () => {
    const chunks: Chunk[] = []
    const acc = createAccumulator({ onChunk: (idx, pcm) => chunks.push({ idx, pcm }) })
    pushAll(acc, loud(21 * RATE))
    expect(chunks).toHaveLength(1)
    const len = chunks[0].pcm.length
    expect(len).toBeGreaterThanOrEqual(18 * RATE)
    expect(len).toBeLessThanOrEqual(20 * RATE)
  })

  it('given 25 s pushed, when flushed, then the tail is idx 1, returns 2 and nothing is lost', () => {
    const chunks: Chunk[] = []
    const acc = createAccumulator({ onChunk: (idx, pcm) => chunks.push({ idx, pcm }) })
    const pcm = loud(25 * RATE)
    pushAll(acc, pcm)
    expect(acc.flush()).toBe(2)
    expect(chunks.map((c) => c.idx)).toEqual([0, 1])
    expect(chunks.reduce((a, c) => a + c.pcm.length, 0)).toBe(pcm.length)
  })

  it('given nothing pushed, when flushed, then nothing is emitted and returns 0', () => {
    const chunks: Chunk[] = []
    const acc = createAccumulator({ onChunk: (idx, pcm) => chunks.push({ idx, pcm }) })
    expect(acc.flush()).toBe(0)
    expect(chunks).toHaveLength(0)
  })

  it('given 3 s pushed, when flushed, then one chunk idx 0 and returns 1', () => {
    const chunks: Chunk[] = []
    const acc = createAccumulator({ onChunk: (idx, pcm) => chunks.push({ idx, pcm }) })
    pushAll(acc, loud(3 * RATE))
    expect(acc.flush()).toBe(1)
    expect(chunks.map((c) => [c.idx, c.pcm.length])).toEqual([[0, 3 * RATE]])
  })

  it('given capMs 1000, when 1.5 s is pushed, then cap fires on the crossing block and only 16000 samples survive', () => {
    const chunks: Chunk[] = []
    const acc = createAccumulator({ onChunk: (idx, pcm) => chunks.push({ idx, pcm }), capMs: 1000 })
    const results = pushAll(acc, loud(1.5 * RATE))
    // blocks of 4096: cumulative 4096, 8192, 12288, 16384 -> 4th block crosses
    expect(results.slice(0, 3)).toEqual(['ok', 'ok', 'ok'])
    expect(results[3]).toBe('cap')
    expect(results.slice(4).every((r) => r === 'cap')).toBe(true)
    acc.flush()
    expect(chunks.reduce((a, c) => a + c.pcm.length, 0)).toBe(16000)
  })

  it('given 2 s pushed, when ms is read, then it reports samples / 16', () => {
    const acc = createAccumulator({ onChunk: () => {} })
    pushAll(acc, loud(2 * RATE))
    expect(acc.ms).toBe(2000)
  })
})
