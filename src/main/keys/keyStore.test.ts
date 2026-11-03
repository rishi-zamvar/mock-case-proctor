import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { mkdtemp, readFile, writeFile, readdir, stat, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ProbeResult } from '../../shared/ipc'
import { createKeyStore, type Cipher, type KeyStoreDeps } from './keyStore'

const K1 = 'key-one-' + randomUUID()
const K2 = 'key-two-' + randomUUID()

const enc = (s: string): Buffer =>
  Buffer.from('fake:' + Buffer.from(s).toString('base64').split('').reverse().join(''))
const dec = (b: Buffer): string =>
  Buffer.from(b.toString().slice(5).split('').reverse().join(''), 'base64').toString()

let dir: string
let file: string
let avail: boolean
let reenc: boolean
let probeResult: ProbeResult
type LogFn = (...a: unknown[]) => void
let log: { info: Mock<LogFn>; warn: Mock<LogFn> }
let probe: Mock<(k: string) => Promise<ProbeResult>>
let cipher: Cipher

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'ks-'))
  file = join(dir, 'anthropic-key.enc')
  avail = true
  reenc = false
  probeResult = 'valid'
  log = { info: vi.fn<LogFn>(), warn: vi.fn<LogFn>() }
  probe = vi.fn(async () => probeResult)
  cipher = {
    available: async () => avail,
    encrypt: async (s) => enc(s),
    decrypt: async (b) => ({ value: dec(b), shouldReEncrypt: reenc })
  }
})

afterEach(async () => {
  // KEY-03: no log call ever receives a key
  const logged = JSON.stringify([log.info.mock.calls, log.warn.mock.calls])
  expect(logged).not.toContain(K1)
  expect(logged).not.toContain(K2)
  await rm(dir, { recursive: true, force: true })
})

const make = (o: Partial<KeyStoreDeps> = {}): ReturnType<typeof createKeyStore> =>
  createKeyStore({ cipher, file, env: {}, dotenvPath: null, probe, log, ...o })

const exists = (p: string): Promise<boolean> =>
  stat(p).then(
    () => true,
    () => false
  )
const stored = async (): Promise<string> => dec(await readFile(file))
const shape = (s: object): string[] => Object.keys(s).sort()

describe('KeyStore.init precedence', () => {
  it('uses a stored key and ignores env without probing', async () => {
    await writeFile(file, enc(K1))
    const ks = make({ env: { ANTHROPIC_API_KEY: K2 } })
    const s = await ks.init()
    expect(s).toEqual({ hasKey: true, source: 'stored' })
    expect(shape(s)).toEqual(['hasKey', 'source'])
    expect(probe).not.toHaveBeenCalled()
    expect(ks.getKey()).toBe(K1)
  })
  it('imports a valid env key and saves it', async () => {
    const ks = make({ env: { ANTHROPIC_API_KEY: K1 } })
    expect(await ks.init()).toEqual({ hasKey: true, source: 'env' })
    expect(await stored()).toBe(K1)
    expect(ks.getKey()).toBe(K1)
  })
  it('imports an unverified env key', async () => {
    probeResult = 'unverified'
    const ks = make({ env: { ANTHROPIC_API_KEY: K1 } })
    expect(await ks.init()).toEqual({ hasKey: true, source: 'env' })
    expect(await stored()).toBe(K1)
  })
  it('rejects an invalid env key', async () => {
    probeResult = 'invalid'
    const ks = make({ env: { ANTHROPIC_API_KEY: K1 } })
    expect(await ks.init()).toEqual({ hasKey: false, source: 'none' })
    expect(await exists(file)).toBe(false)
    expect(ks.getKey()).toBeNull()
    expect(log.warn).toHaveBeenCalled()
  })
  it('imports from .env', async () => {
    const dotenvPath = join(dir, '.env')
    await writeFile(dotenvPath, `ANTHROPIC_API_KEY=${K1}\n`)
    const ks = make({ dotenvPath })
    expect(await ks.init()).toEqual({ hasKey: true, source: 'dotenv' })
    expect(await stored()).toBe(K1)
  })
  it('treats a missing .env file as no key', async () => {
    const ks = make({ dotenvPath: join(dir, 'nope.env') })
    expect(await ks.init()).toEqual({ hasKey: false, source: 'none' })
  })
  it('treats a null dotenvPath as no key', async () => {
    expect(await make().init()).toEqual({ hasKey: false, source: 'none' })
    expect(probe).not.toHaveBeenCalled()
  })
  it('prefers env over .env', async () => {
    const dotenvPath = join(dir, '.env')
    await writeFile(dotenvPath, `ANTHROPIC_API_KEY=${K2}\n`)
    const ks = make({ env: { ANTHROPIC_API_KEY: K1 }, dotenvPath })
    expect(await ks.init()).toEqual({ hasKey: true, source: 'env' })
    expect(ks.getKey()).toBe(K1)
  })
  it('falls through to env when the stored file is corrupt', async () => {
    await writeFile(file, 'garbage')
    cipher.decrypt = async () => {
      throw new Error('bad')
    }
    const ks = make({ env: { ANTHROPIC_API_KEY: K1 } })
    expect(await ks.init()).toEqual({ hasKey: true, source: 'env' })
  })
  it('re-encrypts when the cipher asks', async () => {
    await writeFile(file, Buffer.concat([Buffer.from('old:'), enc(K1)]))
    cipher.decrypt = async (b) => ({
      value: dec(b.subarray(b.toString().startsWith('old:') ? 4 : 0)),
      shouldReEncrypt: true
    })
    const before = await readFile(file)
    const ks = make()
    expect(await ks.init()).toEqual({ hasKey: true, source: 'stored' })
    const after = await readFile(file)
    expect(after.equals(before)).toBe(false)
    expect(dec(after)).toBe(K1)
  })
  it('keeps an env key in memory when encryption is unavailable', async () => {
    avail = false
    const ks = make({ env: { ANTHROPIC_API_KEY: K1 } })
    expect(await ks.init()).toEqual({ hasKey: true, source: 'env' })
    expect(ks.getKey()).toBe(K1)
    expect(await exists(file)).toBe(false)
  })
})

describe('KeyStore.save', () => {
  it('saves a trimmed valid key atomically with mode 0600', async () => {
    const ks = make()
    await ks.init()
    const r = await ks.save(`  ${K1}  `)
    expect(r).toEqual({ status: { hasKey: true, source: 'stored' }, result: 'valid' })
    expect(shape(r)).toEqual(['result', 'status'])
    expect(await stored()).toBe(K1)
    expect((await stat(file)).mode & 0o777).toBe(0o600)
    expect(await readdir(dir)).toEqual(['anthropic-key.enc'])
    expect((await readFile(file)).includes(K1)).toBe(false)
  })
  it('never saves an invalid key', async () => {
    probeResult = 'invalid'
    const ks = make()
    await ks.init()
    const r = await ks.save(K1)
    expect(r).toEqual({ status: { hasKey: false, source: 'none' }, result: 'invalid' })
    expect(await exists(file)).toBe(false)
  })
  it('does not save an unverified key without force', async () => {
    probeResult = 'unverified'
    const ks = make()
    await ks.init()
    expect((await ks.save(K1)).result).toBe('unverified')
    expect(await exists(file)).toBe(false)
    expect(ks.status()).toEqual({ hasKey: false, source: 'none' })
  })
  it('saves with force without probing', async () => {
    const ks = make()
    await ks.init()
    const r = await ks.save(K1, { force: true })
    expect(probe).not.toHaveBeenCalled()
    expect(r).toEqual({ status: { hasKey: true, source: 'stored' }, result: 'unverified' })
    expect(await stored()).toBe(K1)
  })
  it('returns empty for a blank key without probing', async () => {
    const ks = make()
    await ks.init()
    expect((await ks.save('   ')).result).toBe('empty')
    expect(probe).not.toHaveBeenCalled()
  })
  it('returns unavailable when encryption is unavailable', async () => {
    avail = false
    const ks = make()
    await ks.init()
    expect((await ks.save(K1)).result).toBe('unavailable')
    expect(await exists(file)).toBe(false)
    expect(ks.getKey()).toBeNull()
  })
  it('replaces an existing key', async () => {
    const ks = make()
    await ks.init()
    await ks.save(K1)
    await ks.save(K2)
    expect(await stored()).toBe(K2)
    expect(ks.getKey()).toBe(K2)
    expect((await readFile(file)).includes(K2)).toBe(false)
  })
})

describe('KeyStore.clear', () => {
  it('removes the stored key and does not re-import env', async () => {
    const ks = make({ env: { ANTHROPIC_API_KEY: K1 } })
    await ks.init()
    const s = await ks.clear()
    expect(s).toEqual({ hasKey: false, source: 'none' })
    expect(shape(s)).toEqual(['hasKey', 'source'])
    expect(await exists(file)).toBe(false)
    expect(ks.getKey()).toBeNull()
    expect(ks.status()).toEqual({ hasKey: false, source: 'none' })
  })
  it('does not throw when nothing is stored', async () => {
    const ks = make()
    await ks.init()
    await expect(ks.clear()).resolves.toEqual({ hasKey: false, source: 'none' })
  })
})
