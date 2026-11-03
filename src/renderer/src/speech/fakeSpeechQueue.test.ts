import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createFakeSpeechQueue } from './fakeSpeechQueue'

describe('fake speech queue', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('given three words, when enqueued, then acks after exactly 180 ms', () => {
    const ack = vi.fn()
    createFakeSpeechQueue({ ack }).enqueue({ turnId: 't', seq: 0, text: 'one two three' })
    vi.advanceTimersByTime(179)
    expect(ack).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(ack).toHaveBeenCalledWith('t', 0)
  })

  it('given two sentences, when enqueued together, then acks sequentially in order', () => {
    const ack = vi.fn()
    const q = createFakeSpeechQueue({ ack })
    q.enqueue({ turnId: 't', seq: 0, text: 'a b c d e' })
    q.enqueue({ turnId: 't', seq: 1, text: 'f' })
    vi.advanceTimersByTime(300)
    expect(ack.mock.calls).toEqual([['t', 0]])
    vi.advanceTimersByTime(59)
    expect(ack).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1)
    expect(ack.mock.calls).toEqual([
      ['t', 0],
      ['t', 1]
    ])
  })

  it('given pending items, when cleared, then no further acks fire', () => {
    const ack = vi.fn()
    const q = createFakeSpeechQueue({ ack })
    q.enqueue({ turnId: 't', seq: 0, text: 'a b' })
    q.enqueue({ turnId: 't', seq: 1, text: 'c' })
    q.clear()
    vi.advanceTimersByTime(10_000)
    expect(ack).not.toHaveBeenCalled()
  })

  it('given msPerWord 10, when three words enqueued, then acks at 30 ms', () => {
    const ack = vi.fn()
    createFakeSpeechQueue({ ack, msPerWord: 10 }).enqueue({ turnId: 't', seq: 0, text: 'x y z' })
    vi.advanceTimersByTime(29)
    expect(ack).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(ack).toHaveBeenCalledWith('t', 0)
  })

  it('given empty text, when enqueued, then acks after 0 ms', () => {
    const ack = vi.fn()
    createFakeSpeechQueue({ ack }).enqueue({ turnId: 't', seq: 2, text: '   ' })
    vi.advanceTimersByTime(0)
    expect(ack).toHaveBeenCalledWith('t', 2)
  })
})
