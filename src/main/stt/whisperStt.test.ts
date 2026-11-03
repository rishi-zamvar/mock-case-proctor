import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FromWorker, ToWorker } from './protocol'
import { createWhisperStt, SttCrashed, type ChildLike } from './whisperStt'

type Fake = ChildLike & {
  sent: ToWorker[]
  killed: boolean
  emit(ev: 'message', m: FromWorker): void
  emit(ev: 'exit', code: number): void
}

function fakeChild(): Fake {
  const subs: Record<string, ((x: never) => void)[]> = { message: [], exit: [] }
  const c = {
    sent: [] as ToWorker[],
    killed: false,
    postMessage: (m: ToWorker) => void c.sent.push(m),
    on: (ev: string, cb: (x: never) => void) => subs[ev].push(cb),
    kill: () => (c.killed = true),
    emit: (ev: string, x: unknown) => subs[ev].forEach((cb) => cb(x as never))
  }
  return c as unknown as Fake
}

const tick = (): Promise<void> => new Promise((r) => setImmediate(r))
const lastTranscribe = (c: Fake): Extract<ToWorker, { type: 'transcribe' }> =>
  c.sent.filter((m) => m.type === 'transcribe').at(-1) as Extract<ToWorker, { type: 'transcribe' }>

function setup(timeoutMs?: number) {
  const children: Fake[] = []
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const stt = createWhisperStt({
    fork: () => {
      const c = fakeChild()
      children.push(c)
      return c
    },
    model: '/m/ggml.bin',
    log,
    timeoutMs
  })
  return { stt, children, log }
}
const METAL = [{ name: 'MTL0', description: 'Apple M', type: 'gpu' }]

afterEach(() => vi.useRealTimers())

describe('createWhisperStt', () => {
  it('given a first transcribe, when ready arrives, then it forks lazily, inits, then posts transcribe and resolves text', async () => {
    const { stt, children } = setup()
    expect(children).toHaveLength(0)
    const pcm = new Float32Array(10)
    const p = stt.transcribe(pcm, { prompt: 'ARR, CAGR' })
    await tick()
    const c = children[0]
    expect(c.sent).toEqual([{ type: 'init', model: '/m/ggml.bin' }])
    c.emit('message', { type: 'ready', gpus: METAL })
    await tick()
    const t = lastTranscribe(c)
    expect(t.pcm).toBe(pcm)
    expect(t.prompt).toBe('ARR, CAGR')
    c.emit('message', { type: 'text', id: t.id, text: ' hello' })
    await expect(p).resolves.toEqual({ text: ' hello' })
  })

  it('given two concurrent calls, when the first is pending, then the second is posted only after it resolves with a new id', async () => {
    const { stt, children } = setup()
    const a = stt.transcribe(new Float32Array(1))
    const b = stt.transcribe(new Float32Array(2))
    await tick()
    const c = children[0]
    c.emit('message', { type: 'ready', gpus: METAL })
    await tick()
    expect(c.sent.filter((m) => m.type === 'transcribe')).toHaveLength(1)
    const first = lastTranscribe(c)
    c.emit('message', { type: 'text', id: first.id, text: 'one' })
    await expect(a).resolves.toEqual({ text: 'one' })
    await tick()
    const second = lastTranscribe(c)
    expect(second.id).not.toBe(first.id)
    c.emit('message', { type: 'text', id: second.id, text: 'two' })
    await expect(b).resolves.toEqual({ text: 'two' })
  })

  it('given a worker exit mid-request, when it crashes, then the request rejects SttCrashed and the next call forks a new child', async () => {
    const { stt, children, log } = setup()
    const p = stt.transcribe(new Float32Array(1))
    await tick()
    children[0].emit('message', { type: 'ready', gpus: METAL })
    await tick()
    children[0].emit('exit', 11)
    await expect(p).rejects.toBeInstanceOf(SttCrashed)
    expect(log.error).toHaveBeenCalledWith('stt worker exit', 11)
    const q = stt.transcribe(new Float32Array(1))
    await tick()
    expect(children).toHaveLength(2)
    children[1].emit('message', { type: 'ready', gpus: METAL })
    await tick()
    children[1].emit('message', { type: 'text', id: lastTranscribe(children[1]).id, text: 'ok' })
    await expect(q).resolves.toEqual({ text: 'ok' })
  })

  it('given transcribe_failed for one id, when it arrives, then only that request rejects and the worker stays alive', async () => {
    const { stt, children } = setup()
    const p = stt.transcribe(new Float32Array(1))
    await tick()
    const c = children[0]
    c.emit('message', { type: 'ready', gpus: METAL })
    await tick()
    c.emit('message', { type: 'error', id: lastTranscribe(c).id, code: 'transcribe_failed' })
    await expect(p).rejects.toThrow(new SttCrashed('transcribe_failed'))
    expect(c.killed).toBe(false)
    const q = stt.transcribe(new Float32Array(1))
    await tick()
    expect(children).toHaveLength(1)
    c.emit('message', { type: 'text', id: lastTranscribe(c).id, text: 'again' })
    await expect(q).resolves.toEqual({ text: 'again' })
  })

  it('given init_failed, when it arrives, then status is failed and pending requests reject', async () => {
    const { stt, children } = setup()
    const p = stt.transcribe(new Float32Array(1))
    await tick()
    children[0].emit('message', { type: 'error', code: 'init_failed' })
    await expect(p).rejects.toBeInstanceOf(SttCrashed)
    await expect(stt.status()).resolves.toBe('failed')
  })

  it('given ready with no gpus, when status is read, then cpu and a warning; with MTL0 then metal', async () => {
    const a = setup()
    const s = a.stt.status()
    await tick()
    a.children[0].emit('message', { type: 'ready', gpus: [] })
    await expect(s).resolves.toBe('cpu')
    expect(a.log.warn).toHaveBeenCalledWith('stt cpu only')
    const b = setup()
    const t = b.stt.status()
    await tick()
    b.children[0].emit('message', { type: 'ready', gpus: METAL })
    await expect(t).resolves.toBe('metal')
  })

  it('given no reply by timeoutMs, when the timer fires, then the request rejects SttCrashed and the child is killed', async () => {
    vi.useFakeTimers()
    const { stt, children } = setup(1000)
    const p = stt.transcribe(new Float32Array(1))
    const caught = p.catch((e) => e)
    await vi.advanceTimersByTimeAsync(0)
    children[0].emit('message', { type: 'ready', gpus: METAL })
    await vi.advanceTimersByTimeAsync(1001)
    expect(await caught).toBeInstanceOf(SttCrashed)
    expect(children[0].killed).toBe(true)
  })

  it('given warm, when called, then it inits, transcribes 1 s of zeros, resolves after text, and status awaits it', async () => {
    const { stt, children } = setup()
    let warmed = false
    const w = stt.warm().then(() => (warmed = true))
    const s = stt.status()
    await tick()
    const c = children[0]
    expect(c.sent[0]).toEqual({ type: 'init', model: '/m/ggml.bin' })
    c.emit('message', { type: 'ready', gpus: METAL })
    await tick()
    const t = lastTranscribe(c)
    expect(t.pcm).toEqual(new Float32Array(16000))
    expect(warmed).toBe(false)
    c.emit('message', { type: 'text', id: t.id, text: '' })
    await w
    await expect(s).resolves.toBe('metal')
  })

  it('given warm fails, when the worker crashes, then warm still resolves', async () => {
    const { stt, children } = setup()
    const w = stt.warm()
    await tick()
    children[0].emit('exit', 6)
    await expect(w).resolves.toBeUndefined()
  })

  it('given dispose, when called, then the child is killed', async () => {
    const { stt, children } = setup()
    void stt.status()
    await tick()
    stt.dispose()
    expect(children[0].killed).toBe(true)
  })

  it('given transcript text, when anything logs, then no log argument contains it', async () => {
    const { stt, children, log } = setup()
    const p = stt.transcribe(new Float32Array(1))
    await tick()
    const c = children[0]
    c.emit('message', { type: 'ready', gpus: [] })
    await tick()
    c.emit('message', { type: 'text', id: lastTranscribe(c).id, text: 'SECRET-WORDS' })
    await p
    c.emit('exit', 1)
    const all = [...log.info.mock.calls, ...log.warn.mock.calls, ...log.error.mock.calls]
    expect(JSON.stringify(all)).not.toContain('SECRET-WORDS')
  })
})
