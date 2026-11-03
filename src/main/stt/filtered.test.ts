import { describe, expect, it, vi, type Mock } from 'vitest'
import type { SttPort } from '../ports'
import { filteredStt } from './filtered'

const SR = 16000
const sine = Float32Array.from(
  { length: SR },
  (_, i) => 0.5 * Math.sin((2 * Math.PI * 1000 * i) / SR)
)
const innerReturning = (
  text: string
): { inner: SttPort; transcribe: Mock<SttPort['transcribe']> } => {
  const transcribe = vi.fn<SttPort['transcribe']>(async () => ({ text }))
  return { inner: { transcribe }, transcribe }
}

describe('filteredStt', () => {
  it('given digital silence, when transcribed, then inner is never called and the result is noAnswer', async () => {
    const { inner, transcribe } = innerReturning('Thank you.')
    const r = await filteredStt(inner).transcribe(new Float32Array(SR * 3))
    expect(transcribe).not.toHaveBeenCalled()
    expect(r).toEqual({ text: '', noAnswer: true, voicedMs: 0 })
  })

  it('given voiced audio, when transcribed, then inner gets the same pcm and the prompt', async () => {
    const { inner, transcribe } = innerReturning('Retention is fine.')
    await filteredStt(inner).transcribe(sine, { prompt: 'GRR NRR' })
    expect(transcribe).toHaveBeenCalledWith(sine, { prompt: 'GRR NRR' })
  })

  it('given voiced audio and a hallucinated inner output, when transcribed, then noAnswer', async () => {
    const r = await filteredStt(innerReturning('Thank you.').inner).transcribe(sine)
    expect(r).toMatchObject({ text: '', noAnswer: true })
  })

  it('given voiced audio and real speech, when transcribed, then trimmed text with voicedMs', async () => {
    const r = await filteredStt(innerReturning(' Retention is 85%. ').inner).transcribe(sine)
    expect(r.text).toBe('Retention is 85%.')
    expect(r.noAnswer).toBe(false)
    expect(Math.abs((r.voicedMs ?? 0) - 1000)).toBeLessThanOrEqual(20)
  })

  it('given a logger, when transcribed, then it logs the voiced ms only, never the transcript', async () => {
    const info = vi.fn()
    await filteredStt(innerReturning(' Retention is 85%. ').inner, { log: { info } }).transcribe(
      sine
    )
    expect(info).toHaveBeenCalledWith('stt voiced', expect.any(Number))
    expect(JSON.stringify(info.mock.calls)).not.toContain('Retention')
  })

  it('given a custom minVoicedMs above the voiced time, when transcribed, then noAnswer without inner', async () => {
    const { inner, transcribe } = innerReturning('Retention.')
    const r = await filteredStt(inner, { minVoicedMs: 2000 }).transcribe(sine)
    expect(transcribe).not.toHaveBeenCalled()
    expect(r.noAnswer).toBe(true)
  })
})
