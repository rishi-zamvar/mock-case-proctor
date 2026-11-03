import { describe, expect, it } from 'vitest'
import { FRAME, MIN_VOICED_MS, voicedMs } from './gate'

const SR = 16000
const sine = (ms: number, amp = 0.5) =>
  Float32Array.from({ length: (SR * ms) / 1000 }, (_, i) => amp * Math.sin((2 * Math.PI * 1000 * i) / SR))

describe('voicedMs', () => {
  it('given 3 s of digital silence, when gated, then 0 ms voiced', () => {
    expect(voicedMs(new Float32Array(SR * 3))).toBe(0)
  })

  it('given 1 s of a 0.5 sine, when gated, then about 1000 ms voiced', () => {
    expect(Math.abs(voicedMs(sine(1000)) - 1000)).toBeLessThanOrEqual(20)
  })

  it('given 2 s of seeded uniform noise at rms ~0.018, when gated, then under MIN_VOICED_MS', () => {
    let s = 12345
    const amp = 0.018 * Math.sqrt(3) // uniform [-a,a] has rms a/sqrt(3)
    const p = Float32Array.from({ length: SR * 2 }, () => {
      s = (s * 1664525 + 1013904223) >>> 0
      return (s / 2 ** 32) * 2 * amp - amp
    })
    expect(voicedMs(p)).toBeLessThan(MIN_VOICED_MS)
  })

  it('given 300 ms of sine inside 3 s of zeros, when gated, then about 300 ms, below MIN_VOICED_MS', () => {
    const p = new Float32Array(SR * 3)
    p.set(sine(300), SR)
    const v = voicedMs(p)
    expect(Math.abs(v - 300)).toBeLessThanOrEqual(20)
    expect(v).toBeLessThan(MIN_VOICED_MS)
  })

  it('given a loud partial trailing frame, when gated, then it is ignored', () => {
    const p = new Float32Array(FRAME * 2 + FRAME - 1)
    p.fill(0.5, FRAME * 2)
    expect(voicedMs(p)).toBe(0)
  })

  it('given an overridden rms threshold, when gated, then that threshold applies', () => {
    expect(voicedMs(sine(1000, 0.01))).toBe(0)
    expect(voicedMs(sine(1000, 0.01), 0.005)).toBeGreaterThan(900)
  })
})
