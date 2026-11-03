import { describe, it, expect, vi, afterEach } from 'vitest'
import { createAvatarCore, type CoreHead } from './avatarCore'

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function fakeHead() {
  const head = {
    start: vi.fn(),
    stop: vi.fn(),
    onResize: vi.fn(),
    makeEyeContact: vi.fn(),
    lookAhead: vi.fn(),
    animQueue: [] as unknown[],
    animFactory: vi.fn((t: unknown) => ({ anim: t })),
    animEmojis: { yes: 'YES', '🤔': 'THINK' } as Record<string, unknown>
  } satisfies CoreHead
  return head
}

afterEach(() => vi.useRealTimers())

describe('avatarCore run gating', () => {
  it('given not ready, when visibility changes, then the head is not started or stopped', () => {
    const head = fakeHead()
    const core = createAvatarCore(head, { raf: (f) => f() })
    core.setVisible(true)
    expect(head.start).not.toHaveBeenCalled()
    expect(head.stop).not.toHaveBeenCalled()
  })

  it('given hidden and not playing, when ready (showAvatar started it), then it is stopped again', () => {
    const head = fakeHead()
    const core = createAvatarCore(head, { raf: (f) => f() })
    core.onReady()
    expect(head.stop).toHaveBeenCalledTimes(1)
  })

  it('given visible before ready, when ready, then it keeps running and is not stopped', () => {
    const head = fakeHead()
    const core = createAvatarCore(head, { raf: (f) => f() })
    core.setVisible(true)
    core.onReady()
    expect(head.stop).not.toHaveBeenCalled()
    expect(head.start).not.toHaveBeenCalled()
  })

  it('given ready and hidden, when playing toggles, then it wakes once and sleeps once (only on change)', () => {
    const head = fakeHead()
    const core = createAvatarCore(head, { raf: (f) => f() })
    core.onReady()
    head.stop.mockClear()
    core.setPlaying(true)
    core.setPlaying(true)
    expect(head.start).toHaveBeenCalledTimes(1)
    core.setPlaying(false)
    core.setPlaying(false)
    expect(head.stop).toHaveBeenCalledTimes(1)
  })

  it('given ready and playing, when visibility toggles, then the head keeps running', () => {
    const head = fakeHead()
    const core = createAvatarCore(head, { raf: (f) => f() })
    core.onReady()
    core.setPlaying(true)
    head.start.mockClear()
    head.stop.mockClear()
    core.setVisible(true)
    core.setVisible(false)
    expect(head.start).not.toHaveBeenCalled()
    expect(head.stop).not.toHaveBeenCalled()
  })

  it('given ready, when becoming visible, then onResize runs on the next frame', () => {
    const head = fakeHead()
    const frames: (() => void)[] = []
    const core = createAvatarCore(head, { raf: (f) => frames.push(f) })
    core.onReady()
    core.setVisible(true)
    expect(head.start).toHaveBeenCalledTimes(1)
    expect(head.onResize).not.toHaveBeenCalled()
    frames.forEach((f) => f())
    expect(head.onResize).toHaveBeenCalledTimes(1)
  })
})

describe('avatarCore states', () => {
  it('given idle, when states change, then stateLog records each distinct transition in order', () => {
    const core = createAvatarCore(fakeHead(), { raf: (f) => f() })
    expect(core.state()).toBe('idle')
    expect(core.stateLog()).toEqual([])
    core.setState('thinking')
    core.setState('thinking')
    core.setState('speaking')
    core.setState('idle')
    expect(core.stateLog()).toEqual(['thinking', 'speaking', 'idle'])
    expect(core.state()).toBe('idle')
  })

  it('given listening, when time passes, then it makes eye contact and nods via animQueue until left', () => {
    vi.useFakeTimers()
    const head = fakeHead()
    const core = createAvatarCore(head, { raf: (f) => f(), random: () => 0 })
    core.setState('listening')
    expect(head.makeEyeContact).toHaveBeenCalledWith(2000)
    vi.advanceTimersByTime(4000 * 2)
    expect(head.animFactory).toHaveBeenCalledWith('YES')
    expect(head.animQueue).toHaveLength(2)
    core.setState('idle')
    vi.advanceTimersByTime(60_000)
    expect(head.animQueue).toHaveLength(2)
  })

  it('given thinking, when entered, then it looks aside and queues the thinking emoji without eye contact', () => {
    const head = fakeHead()
    const core = createAvatarCore(head, { raf: (f) => f() })
    core.setState('thinking')
    expect(head.lookAhead).toHaveBeenCalled()
    expect(head.animFactory).toHaveBeenCalledWith('THINK')
    expect(head.makeEyeContact).not.toHaveBeenCalled()
  })

  it('given speaking, when entered, then the core leaves the head alone (TalkingHead drives it)', () => {
    const head = fakeHead()
    const core = createAvatarCore(head, { raf: (f) => f() })
    core.setState('speaking')
    expect(head.makeEyeContact).not.toHaveBeenCalled()
    expect(head.lookAhead).not.toHaveBeenCalled()
    expect(head.animQueue).toHaveLength(0)
  })
})
