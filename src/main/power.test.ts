import { describe, it, expect, vi, type Mock } from 'vitest'
import { createAwake, type Blocker } from './power'

type FakeLog = { info: Mock; warn: Mock; error: Mock }
type Fake = {
  b: {
    start: Mock<Blocker['start']>
    stop: Mock<Blocker['stop']>
    isStarted: Mock<Blocker['isStarted']>
  }
  log: FakeLog
  started: Set<number>
}

function fake(): Fake {
  const started = new Set<number>()
  let next = 1
  const b = {
    start: vi.fn<Blocker['start']>(() => {
      const id = next++
      started.add(id)
      return id
    }),
    stop: vi.fn((id: number) => {
      started.delete(id)
    }),
    isStarted: vi.fn((id: number) => started.has(id))
  } satisfies Blocker
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  return { b, log, started }
}

describe('createAwake', () => {
  it('given idle, when hold, then starts prevent-display-sleep once and logs awake hold', () => {
    const { b, log } = fake()
    createAwake(b, log).hold()
    expect(b.start).toHaveBeenCalledTimes(1)
    expect(b.start).toHaveBeenCalledWith('prevent-display-sleep')
    expect(log.info).toHaveBeenCalledWith('awake hold')
  })

  it('given held, when hold again, then start is called once', () => {
    const { b, log } = fake()
    const a = createAwake(b, log)
    a.hold()
    a.hold()
    expect(b.start).toHaveBeenCalledTimes(1)
  })

  it('given blocker stopped externally, when hold, then starts again', () => {
    const { b, log, started } = fake()
    const a = createAwake(b, log)
    a.hold()
    started.clear()
    a.hold()
    expect(b.start).toHaveBeenCalledTimes(2)
  })

  it('given held, when release twice, then stops the held id once and logs once', () => {
    const { b, log } = fake()
    const a = createAwake(b, log)
    a.hold()
    a.release()
    a.release()
    expect(b.stop).toHaveBeenCalledTimes(1)
    expect(b.stop).toHaveBeenCalledWith(1)
    expect(log.info.mock.calls.filter((c) => c[0] === 'awake release')).toHaveLength(1)
  })

  it('given never held, when release, then no stop and no log', () => {
    const { b, log } = fake()
    createAwake(b, log).release()
    expect(b.stop).not.toHaveBeenCalled()
    expect(log.info).not.toHaveBeenCalled()
  })

  it('given hold, release, hold, then start is called twice', () => {
    const { b, log } = fake()
    const a = createAwake(b, log)
    a.hold()
    a.release()
    a.hold()
    expect(b.start).toHaveBeenCalledTimes(2)
  })
})
