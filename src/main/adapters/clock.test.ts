import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createScaledClock } from './clock'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
})
afterEach(() => vi.useRealTimers())
const realNow = (): number => Date.now()

describe('createScaledClock', () => {
  it('given scale 1, when time passes, then now tracks real time and timers fire on time', () => {
    const clock = createScaledClock({ realNow })
    const t0 = clock.now()
    const cb = vi.fn()
    clock.setTimer(t0 + 1000, cb)
    vi.advanceTimersByTime(999)
    expect(cb).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(cb).toHaveBeenCalledOnce()
    expect(clock.now()).toBe(t0 + 1000)
  })

  it('given scale 600, when 1 s passes, then now advances 600 s and 45 min fires at 4.5 s', () => {
    const clock = createScaledClock({ scale: 600, realNow })
    const t0 = clock.now()
    vi.advanceTimersByTime(1000)
    expect(clock.now()).toBe(t0 + 600_000)
    const cb = vi.fn()
    clock.setTimer(clock.now() + 45 * 60_000, cb)
    vi.advanceTimersByTime(4400)
    expect(cb).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(cb).toHaveBeenCalledOnce()
  })

  it('given a past time, when set, then fires on the next tick', () => {
    const clock = createScaledClock({ realNow })
    const cb = vi.fn()
    clock.setTimer(clock.now() - 5000, cb)
    vi.advanceTimersByTime(0)
    expect(cb).toHaveBeenCalledOnce()
  })

  it('given the cancel fn, when called, then the callback never fires', () => {
    const clock = createScaledClock({ realNow })
    const cb = vi.fn()
    clock.setTimer(clock.now() + 10, cb)()
    vi.advanceTimersByTime(100)
    expect(cb).not.toHaveBeenCalled()
  })

  it('given a bad scale, when created, then scale is 1', () => {
    for (const scale of [0, -3, NaN]) expect(createScaledClock({ scale, realNow }).scale).toBe(1)
    expect(createScaledClock({ scale: 600, realNow }).scale).toBe(600)
  })
})
