import { describe, it, expect, vi } from 'vitest'
import type { LibraryView } from '../shared/ipc'
import { registerIpc, type IpcDeps, type IpcLike } from './ipc'

type Handler = (event: { senderFrame: { url: string } | null }, ...args: unknown[]) => unknown
const APP = { senderFrame: { url: 'app://bundle/index.html' } }

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- inferred harness shape
function setup(devUrl?: string, status: unknown = { hasKey: false, source: 'none' }) {
  const handlers = new Map<string, Handler>()
  const ipc: IpcLike = { handle: (ch, fn) => void handlers.set(ch, fn) }
  const store = {
    status: vi.fn(() => status),
    save: vi.fn(async () => ({ status: { hasKey: true, source: 'stored' }, result: 'valid' })),
    clear: vi.fn(async () => ({ hasKey: false, source: 'none' }))
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerIpc(ipc, { keyStore: store as any }, devUrl)
  const call = async (
    ch: string,
    event: Parameters<Handler>[0],
    ...args: unknown[]
  ): Promise<unknown> => handlers.get(ch)!(event, ...args)
  return { handlers, store, call }
}

describe('registerIpc', () => {
  it('given registration, when inspected, then exposes exactly the three key channels', () => {
    const { handlers } = setup()
    expect([...handlers.keys()].sort()).toEqual(['key:clear', 'key:save', 'key:status'])
  })

  it('given an app sender, when key:status, then returns the store status', async () => {
    const { call } = setup()
    await expect(call('key:status', APP)).resolves.toEqual({ hasKey: false, source: 'none' })
  })

  it('given a store leaking the key, when key:status, then the handler throws', async () => {
    const { call } = setup(undefined, { hasKey: true, source: 'stored', key: 'leak' })
    await expect(call('key:status', APP)).rejects.toThrow()
  })

  it('given valid save args, when key:save, then forwards to store.save', async () => {
    const { call, store } = setup()
    await expect(call('key:save', APP, 'k', {})).resolves.toEqual({
      status: { hasKey: true, source: 'stored' },
      result: 'valid'
    })
    expect(store.save).toHaveBeenCalledWith('k', {})
  })

  it.each([[['k']], [[42, {}]], [['k', { force: true, x: 1 }]]])(
    'given invalid save args %j, when key:save, then rejects without calling the store',
    async (args) => {
      const { call, store } = setup()
      await expect(call('key:save', APP, ...args)).rejects.toThrow('invalid arguments')
      expect(store.save).not.toHaveBeenCalled()
    }
  )

  it('given an app sender, when key:clear, then returns the cleared status', async () => {
    const { call, store } = setup()
    await expect(call('key:clear', APP)).resolves.toEqual({ hasKey: false, source: 'none' })
    expect(store.clear).toHaveBeenCalled()
  })

  it.each(['key:status', 'key:save', 'key:clear'])(
    'given a foreign or missing sender, when %s, then rejects forbidden sender',
    async (ch) => {
      const { call, store } = setup()
      await expect(
        call(ch, { senderFrame: { url: 'https://evil.com/' } }, 'k', {})
      ).rejects.toThrow('forbidden sender')
      await expect(call(ch, { senderFrame: null }, 'k', {})).rejects.toThrow('forbidden sender')
      expect(store.save).not.toHaveBeenCalled()
      expect(store.clear).not.toHaveBeenCalled()
    }
  )

  it('given a dev URL, when the dev server sends, then it is allowed', async () => {
    const { call } = setup('http://localhost:5173')
    await expect(
      call('key:status', { senderFrame: { url: 'http://localhost:5173/' } })
    ).resolves.toEqual({ hasKey: false, source: 'none' })
  })
})

const LIB = { cases: [], resumable: null, quarantined: 0, error: null }
const TRENDS = { status: 'insufficient', summaries: [], insights: null }

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- inferred harness shape
function full(
  o: {
    e2eSay?: boolean
    library?: unknown
    sttStatus?: () => Promise<unknown>
    trends?: () => Promise<unknown>
  } = {}
) {
  const handlers = new Map<string, Handler>()
  const ipc: IpcLike = { handle: (ch, fn) => void handlers.set(ch, fn) }
  const keyStore = { status: vi.fn(), save: vi.fn(), clear: vi.fn() }
  const runner = {
    start: vi.fn(async () => ({ sessionId: 's_1' })),
    resume: vi.fn(async () => ({ sessionId: 's_1' })),
    discard: vi.fn(),
    intent: vi.fn(async () => undefined),
    ack: vi.fn(),
    sttChunk: vi.fn(),
    started: vi.fn()
  }
  const library = vi.fn(() => o.library ?? LIB)
  const e2eSay = vi.fn()
  const trends = vi.fn(o.trends ?? (async () => TRENDS))
  const deps: IpcDeps = {
    keyStore: keyStore as unknown as IpcDeps['keyStore'],
    runner,
    library: library as unknown as () => LibraryView,
    ...(o.e2eSay === false ? {} : { e2eSay }),
    ...(o.sttStatus ? { sttStatus: o.sttStatus as IpcDeps['sttStatus'] } : {}),
    trends: trends as unknown as IpcDeps['trends']
  }
  registerIpc(ipc, deps)
  const call = async (ch: string, ...args: unknown[]): Promise<unknown> =>
    handlers.get(ch)!(APP, ...args)
  return { handlers, runner, library, e2eSay, trends, call }
}

describe('registerIpc session channels', () => {
  it('given all deps, when inspected, then registers the session, library, speak and e2e channels', () => {
    expect([...full().handlers.keys()].sort()).toEqual(
      [
        'key:clear',
        'key:save',
        'key:status',
        'library:list',
        'session:discard',
        'session:intent',
        'session:resume',
        'session:start',
        'speak:ack',
        'speak:started',
        'stt:chunk',
        'stt:status',
        'trends:get',
        'e2e:say'
      ].sort()
    )
  })

  it('given no e2eSay, when inspected, then e2e:say is not registered', () => {
    expect(full({ e2eSay: false }).handlers.has('e2e:say')).toBe(false)
  })

  it('given valid start args, when session:start, then forwards to the runner', async () => {
    const { call, runner } = full()
    await expect(call('session:start', '99', { warmup: true })).resolves.toEqual({
      sessionId: 's_1'
    })
    expect(runner.start).toHaveBeenCalledWith('99', { warmup: true })
  })

  it.each([[['../x', { warmup: true }]], [['99']], [['99', { warmup: 'y' }]]])(
    'given invalid start args %j, when session:start, then rejects without calling the runner',
    async (args) => {
      const { call, runner } = full()
      await expect(call('session:start', ...args)).rejects.toThrow('invalid arguments')
      expect(runner.start).not.toHaveBeenCalled()
    }
  )

  it('given a valid intent, when session:intent, then forwards and returns undefined', async () => {
    const { call, runner } = full()
    await expect(call('session:intent', { type: 'answer', ms: 100 })).resolves.toBeUndefined()
    expect(runner.intent).toHaveBeenCalledWith({ type: 'answer', ms: 100 })
  })

  it.each([[{ type: 'answer' }], [{ type: 'hack' }]])(
    'given invalid intent %j, when session:intent, then rejects',
    async (i) => {
      const { call, runner } = full()
      await expect(call('session:intent', i)).rejects.toThrow('invalid arguments')
      expect(runner.intent).not.toHaveBeenCalled()
    }
  )

  it('given a valid id, when resume and discard, then forward to the runner', async () => {
    const { call, runner } = full()
    await expect(call('session:resume', 's_1')).resolves.toEqual({ sessionId: 's_1' })
    await expect(call('session:discard', 's_1')).resolves.toBeUndefined()
    expect(runner.resume).toHaveBeenCalledWith('s_1')
    expect(runner.discard).toHaveBeenCalledWith('s_1')
  })

  it.each(['session:resume', 'session:discard'])(
    'given a bad id, when %s, then rejects without calling the runner',
    async (ch) => {
      const { call, runner } = full()
      await expect(call(ch, '../etc')).rejects.toThrow('invalid arguments')
      expect(runner.resume).not.toHaveBeenCalled()
      expect(runner.discard).not.toHaveBeenCalled()
    }
  )

  it('given valid ack args, when speak:ack, then forwards; a negative seq rejects', async () => {
    const { call, runner } = full()
    await expect(call('speak:ack', 't', 0)).resolves.toBeUndefined()
    expect(runner.ack).toHaveBeenCalledWith('t', 0, true)
    await expect(call('speak:ack', 't', -1)).rejects.toThrow('invalid arguments')
    expect(runner.ack).toHaveBeenCalledTimes(1)
  })

  it('given spoken=false, when speak:ack, then the runner receives spoken=false', async () => {
    const { call, runner } = full()
    await call('speak:ack', 't', 2, false)
    expect(runner.ack).toHaveBeenCalledWith('t', 2, false)
    await expect(call('speak:ack', 't', 2, 'yes')).rejects.toThrow('invalid arguments')
  })

  it('given text, when e2e:say, then forwards; over 2000 chars rejects', async () => {
    const { call, e2eSay } = full()
    await call('e2e:say', 'hello')
    expect(e2eSay).toHaveBeenCalledWith('hello')
    await expect(call('e2e:say', 'x'.repeat(2001))).rejects.toThrow('invalid arguments')
    expect(e2eSay).toHaveBeenCalledTimes(1)
  })

  it('given a library view, when library:list, then returns it parsed', async () => {
    await expect(full().call('library:list')).resolves.toEqual(LIB)
  })

  it('given a library leaking an extra field, when library:list, then rejects', async () => {
    await expect(
      full({ library: { ...LIB, brief: 'secret' } }).call('library:list')
    ).rejects.toThrow()
  })

  it.each([
    'library:list',
    'session:start',
    'session:intent',
    'session:resume',
    'session:discard',
    'speak:ack',
    'speak:started',
    'stt:chunk',
    'stt:status',
    'trends:get',
    'e2e:say'
  ])('given a foreign or missing sender, when %s, then rejects forbidden sender', async (ch) => {
    const { handlers, runner, library, e2eSay, trends } = full()
    const h = handlers.get(ch)!
    await expect(
      (async () => h({ senderFrame: { url: 'https://evil.com/' } }, '99', { warmup: true }))()
    ).rejects.toThrow('forbidden sender')
    await expect((async () => h({ senderFrame: null }, '99', { warmup: true }))()).rejects.toThrow(
      'forbidden sender'
    )
    for (const f of [
      runner.start,
      runner.intent,
      runner.resume,
      runner.discard,
      runner.ack,
      runner.sttChunk,
      runner.started,
      library,
      e2eSay,
      trends
    ])
      expect(f).not.toHaveBeenCalled()
  })

  it('given a Float32Array chunk, when stt:chunk, then the runner gets the same array; number[] rejects', async () => {
    const { call, runner } = full()
    const pcm = new Float32Array(160)
    await expect(call('stt:chunk', 'a1', 0, pcm)).resolves.toBeUndefined()
    expect(runner.sttChunk).toHaveBeenCalledWith('a1', 0, pcm)
    expect(runner.sttChunk.mock.calls[0][2]).toBe(pcm)
    await expect(call('stt:chunk', 'a1', 1, [0, 0.1])).rejects.toThrow('invalid arguments')
    expect(runner.sttChunk).toHaveBeenCalledTimes(1)
  })

  it('given turn and seq, when speak:started, then forwards to runner.started', async () => {
    const { call, runner } = full()
    await expect(call('speak:started', 't1', 2)).resolves.toBeUndefined()
    expect(runner.started).toHaveBeenCalledWith('t1', 2)
  })

  it('given an sttStatus dep, when stt:status, then returns the parsed status; a bad value rejects', async () => {
    await expect(full({ sttStatus: async () => 'metal' }).call('stt:status')).resolves.toBe('metal')
    await expect(full({ sttStatus: async () => 'gpu' }).call('stt:status')).rejects.toThrow()
  })

  it('given no sttStatus dep, when stt:status, then resolves off', async () => {
    await expect(full().call('stt:status')).resolves.toBe('off')
  })

  it('given a bargeIn intent, when session:intent, then forwards to the runner', async () => {
    const { call, runner } = full()
    await call('session:intent', { type: 'bargeIn' })
    expect(runner.intent).toHaveBeenCalledWith({ type: 'bargeIn' })
  })

  it('given a trends dep, when trends:get, then returns the parsed view; a bad view rejects', async () => {
    await expect(full().call('trends:get')).resolves.toEqual(TRENDS)
    await expect(full({ trends: async () => ({ status: 'bogus' }) }).call('trends:get')).rejects.toThrow()
  })

  it('given extra args, when trends:get, then rejects without calling trends', async () => {
    const { call, trends } = full()
    await expect(call('trends:get', 'x')).rejects.toThrow('invalid arguments')
    expect(trends).not.toHaveBeenCalled()
  })
})
