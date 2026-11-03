import { describe, expect, it } from 'vitest'
import { BANNED_TERMS } from '../domain/text/leakGuard'
import { createFakeStt } from './fakeStt'

const pcm = new Float32Array(0)

describe('createFakeStt', () => {
  it('given the default canned list, when called four times, then answers cycle by index', async () => {
    const stt = createFakeStt()
    const got = [] as string[]
    for (let i = 0; i < 4; i++) got.push((await stt.transcribe(pcm)).text)
    expect(new Set(got.slice(0, 3)).size).toBe(3)
    expect(got[3]).toBe(got[0])
    for (const t of got) for (const b of BANNED_TERMS) expect(t.toLowerCase()).not.toContain(b)
  })

  it('given two injections, when called, then injected first and canned resumes at the next index', async () => {
    const stt = createFakeStt(['c0', 'c1', 'c2'])
    stt.inject('A')
    stt.inject('B')
    const got = [] as string[]
    for (let i = 0; i < 3; i++) got.push((await stt.transcribe(pcm)).text)
    expect(got).toEqual(['A', 'B', 'c2'])
  })
})
