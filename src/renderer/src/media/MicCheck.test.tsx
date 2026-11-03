import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import MicCheck from './MicCheck'
import type { Meter } from './MicCheck'

function fakeStream(): { stream: MediaStream; stop: ReturnType<typeof vi.fn> } {
  const stop = vi.fn()
  const stream = { getTracks: () => [{ stop }, { stop }] } as unknown as MediaStream
  return { stream, stop }
}

function fakeMeter(sample: { rms: number; peak: number }): Meter & { sample: typeof sample; close: ReturnType<typeof vi.fn> } {
  const m = { sample, read: () => m.sample, close: vi.fn() }
  return m
}

const flush = (): Promise<void> => act(async () => {})

afterEach(() => vi.useRealTimers())

describe('MicCheck', () => {
  it('given mount, when it opens the mic, then it asks once for processed audio only', async () => {
    const { stream } = fakeStream()
    const gum = vi.fn().mockResolvedValue(stream)
    render(<MicCheck getUserMedia={gum} createMeter={() => fakeMeter({ rms: 0, peak: 0 })} />)
    await flush()
    expect(gum).toHaveBeenCalledTimes(1)
    expect(gum).toHaveBeenCalledWith({ audio: { echoCancellation: true, noiseSuppression: true } })
    expect((screen.getByTestId('mic-check')).textContent).toContain('Say something to test your mic')
  })

  it('given a loud meter, when one poll runs, then level and running peak are shown', async () => {
    vi.useFakeTimers()
    const { stream } = fakeStream()
    const meter = fakeMeter({ rms: 0.2, peak: 0.6 })
    render(<MicCheck getUserMedia={() => Promise.resolve(stream)} createMeter={() => meter} now={() => 0} />)
    await flush()
    await act(async () => vi.advanceTimersByTime(50))
    const el = screen.getByTestId('mic-level')
    expect(el.tagName).toBe('METER')
    expect((el).getAttribute('data-level')).toBe('0.20')
    expect((el).getAttribute('data-peak')).toBe('0.60')
    meter.sample = { rms: 0.05, peak: 0.1 }
    await act(async () => vi.advanceTimersByTime(50))
    expect((el).getAttribute('data-level')).toBe('0.05')
    expect((el).getAttribute('data-peak')).toBe('0.60')
  })

  it('given 3 s of silence, when polled, then the silent warning shows and clears on sound', async () => {
    vi.useFakeTimers()
    let t = 0
    const { stream } = fakeStream()
    const meter = fakeMeter({ rms: 0, peak: 0 })
    render(<MicCheck getUserMedia={() => Promise.resolve(stream)} createMeter={() => meter} now={() => t} />)
    await flush()
    for (let i = 0; i < 59; i++) {
      t += 50
      await act(async () => vi.advanceTimersByTime(50))
    }
    expect(screen.queryByTestId('mic-silent')).toBeNull()
    t += 100
    await act(async () => vi.advanceTimersByTime(100))
    const silent = screen.getByTestId('mic-silent')
    expect((silent).getAttribute('role')).toBe('status')
    expect((silent).textContent).toContain("We can't hear you — check your mic")
    meter.sample = { rms: 0.2, peak: 0.4 }
    t += 50
    await act(async () => vi.advanceTimersByTime(50))
    expect(screen.queryByTestId('mic-silent')).toBeNull()
  })

  it('given no getUserMedia, when mounted, then it shows unavailable without throwing', async () => {
    render(<MicCheck getUserMedia={undefined} />)
    await flush()
    expect((screen.getByTestId('mic-unavailable')).textContent).toContain(
      'Microphone unavailable — check System Settings › Privacy & Security'
    )
  })

  it('given a rejecting getUserMedia, when mounted, then it shows unavailable', async () => {
    render(<MicCheck getUserMedia={() => Promise.reject(new DOMException('no', 'NotAllowedError'))} />)
    await flush()
    expect((screen.getByTestId('mic-unavailable')).getAttribute('role')).toBe('status')
  })

  it('given a live mic, when unmounted, then every track stops and the meter closes', async () => {
    const { stream, stop } = fakeStream()
    const meter = fakeMeter({ rms: 0, peak: 0 })
    const { unmount } = render(<MicCheck getUserMedia={() => Promise.resolve(stream)} createMeter={() => meter} />)
    await flush()
    unmount()
    expect(stop).toHaveBeenCalledTimes(2)
    expect(meter.close).toHaveBeenCalledTimes(1)
  })

  it('given unmount before getUserMedia resolves, when it resolves, then the late tracks stop', async () => {
    const { stream, stop } = fakeStream()
    let resolve!: (s: MediaStream) => void
    const createMeter = vi.fn()
    const { unmount } = render(
      <MicCheck getUserMedia={() => new Promise((r) => (resolve = r))} createMeter={createMeter} />
    )
    unmount()
    await act(async () => resolve(stream))
    expect(stop).toHaveBeenCalledTimes(2)
    expect(createMeter).not.toHaveBeenCalled()
  })
})
