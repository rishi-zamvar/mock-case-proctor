// Pure PCM accumulator: cuts ~chunkMs chunks at the quietest FRAME in the last searchMs,
// caps the recording at capMs and flushes the tail. Emitted chunks are always fresh copies.
export const RATE = 16000
export const FRAME = 320 // 20 ms at 16 kHz

const perMs = RATE / 1000

/** Start index of the min-energy FRAME in [from, to), FRAME-aligned relative to `from`. */
export function quietestCut(pcm: Float32Array, from: number, to: number): number {
  let best = from
  let bestE = Infinity
  for (let s = from; s + FRAME <= to; s += FRAME) {
    let e = 0
    for (let i = s; i < s + FRAME; i++) e += pcm[i] * pcm[i]
    if (e < bestE) {
      bestE = e
      best = s
    }
  }
  return best
}

export function createAccumulator(o: {
  onChunk(idx: number, pcm: Float32Array): void
  chunkMs?: number
  searchMs?: number
  capMs?: number
}): { push(block: Float32Array): 'ok' | 'cap'; flush(): number; readonly ms: number } {
  const chunkN = (o.chunkMs ?? 20_000) * perMs
  const searchN = (o.searchMs ?? 2_000) * perMs
  const capN = (o.capMs ?? 300_000) * perMs
  let blocks: Float32Array[] = []
  let buffered = 0
  let total = 0
  let idx = 0

  const concat = (): Float32Array => {
    const out = new Float32Array(buffered)
    let off = 0
    for (const b of blocks) {
      out.set(b, off)
      off += b.length
    }
    return out
  }

  return {
    push(block) {
      const take = Math.min(block.length, capN - total)
      if (take > 0) {
        blocks.push(block.slice(0, take))
        buffered += take
        total += take
        while (buffered >= chunkN) {
          const buf = concat()
          // Align the search start to the absolute FRAME grid (buffer starts are always grid-aligned).
          const from = Math.floor((buffered - searchN) / FRAME) * FRAME
          const cut = quietestCut(buf, from, buffered)
          o.onChunk(idx++, buf.slice(0, cut))
          blocks = [buf.slice(cut)]
          buffered -= cut
        }
      }
      return total >= capN ? 'cap' : 'ok'
    },
    flush() {
      if (buffered > 0) o.onChunk(idx++, concat())
      blocks = []
      buffered = 0
      return idx
    },
    get ms() {
      return total / perMs
    }
  }
}
