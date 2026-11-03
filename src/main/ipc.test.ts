import { describe, it, expect, vi } from 'vitest'
import { registerIpc, type IpcLike } from './ipc'

type Handler = (event: { senderFrame: { url: string } | null }, ...args: unknown[]) => unknown
const APP = { senderFrame: { url: 'app://bundle/index.html' } }

function setup(devUrl?: string, status: unknown = { hasKey: false, source: 'none' }) {
  const handlers = new Map<string, Handler>()
  const ipc: IpcLike = { handle: (ch, fn) => void handlers.set(ch, fn) }
  const store = {
    status: vi.fn(() => status),
    save: vi.fn(async () => ({ status: { hasKey: true, source: 'stored' }, result: 'valid' })),
    clear: vi.fn(async () => ({ hasKey: false, source: 'none' }))
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  registerIpc(ipc, store as any, devUrl)
  const call = async (ch: string, event: Parameters<Handler>[0], ...args: unknown[]) =>
    handlers.get(ch)!(event, ...args)
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
      await expect(call(ch, { senderFrame: { url: 'https://evil.com/' } }, 'k', {})).rejects.toThrow(
        'forbidden sender'
      )
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
