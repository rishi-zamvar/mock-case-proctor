import { describe, it, expect } from 'vitest'
import { measure, createSilenceWatch, SILENCE_RMS, SILENCE_MS } from './level'

describe('measure', () => {
  it('given a square wave at 0.5, when measured, then rms and peak are 0.5', () => {
    const r = measure(new Float32Array([0.5, -0.5, 0.5, -0.5]))
    expect(r.rms).toBeCloseTo(0.5)
    expect(r.peak).toBeCloseTo(0.5)
  })

  it('given zeros, when measured, then rms and peak are 0', () => {
    expect(measure(new Float32Array(8))).toEqual({ rms: 0, peak: 0 })
  })
})

describe('createSilenceWatch', () => {
  it('given the defaults, when read, then threshold 0.01 and 3000 ms', () => {
    expect(SILENCE_RMS).toBe(0.01)
    expect(SILENCE_MS).toBe(3000)
  })

  it('given continuous silence, when 3000 ms pass, then it reports silent', () => {
    const w = createSilenceWatch({ threshold: 0.01, ms: 3000 })
    expect(w(0, 0)).toBe(false)
    expect(w(0, 2999)).toBe(false)
    expect(w(0, 3000)).toBe(true)
  })

  it('given a loud sample mid-silence, when watched, then silence must last another 3000 ms', () => {
    const w = createSilenceWatch({ threshold: 0.01, ms: 3000 })
    w(0, 0)
    expect(w(0.2, 2000)).toBe(false)
    expect(w(0, 2100)).toBe(false)
    expect(w(0, 5099)).toBe(false)
    expect(w(0, 5100)).toBe(true)
  })
})
