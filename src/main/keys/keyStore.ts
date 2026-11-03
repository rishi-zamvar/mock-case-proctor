import { readFile, writeFile, rename, rm } from 'node:fs/promises'
import type { KeySource, KeyStatus, ProbeResult, SaveOptions, SaveResult } from '../../shared/ipc'
import { parseDotenv } from './dotenv'

export interface Cipher {
  available(): Promise<boolean>
  encrypt(plain: string): Promise<Buffer>
  decrypt(buf: Buffer): Promise<{ value: string; shouldReEncrypt: boolean }>
}

export interface KeyStoreDeps {
  cipher: Cipher
  file: string
  env: Record<string, string | undefined>
  dotenvPath: string | null
  probe: (key: string) => Promise<ProbeResult>
  log: { info(...a: unknown[]): void; warn(...a: unknown[]): void }
}

export interface KeyStore {
  init(): Promise<KeyStatus>
  status(): KeyStatus
  save(key: string, opts?: SaveOptions): Promise<SaveResult>
  clear(): Promise<KeyStatus>
  /** MAIN ONLY — never wire to IPC. */
  getKey(): string | null
}

/** Precedence: stored → env → .env. Never logs the key; never writes plaintext. */
export function createKeyStore(deps: KeyStoreDeps): KeyStore {
  const { cipher, file, env, dotenvPath, probe, log } = deps
  let key: string | null = null
  let source: KeySource = 'none'

  const status = (): KeyStatus => ({ hasKey: key !== null, source })

  async function persist(k: string): Promise<boolean> {
    if (!(await cipher.available())) return false
    const buf = await cipher.encrypt(k)
    const tmp = `${file}.${process.pid}.tmp`
    await writeFile(tmp, buf, { mode: 0o600 })
    await rename(tmp, file)
    return true
  }

  async function readStored(): Promise<boolean> {
    let buf: Buffer
    try {
      buf = await readFile(file)
    } catch {
      return false // no stored key
    }
    try {
      const { value, shouldReEncrypt } = await cipher.decrypt(buf)
      key = value
      source = 'stored'
      if (shouldReEncrypt) await persist(value)
      return true
    } catch {
      log.warn('stored key unreadable; ignoring')
      return false
    }
  }

  async function dotenvKey(): Promise<string | undefined> {
    if (!dotenvPath) return undefined
    try {
      return parseDotenv(await readFile(dotenvPath, 'utf8')).ANTHROPIC_API_KEY?.trim() || undefined
    } catch {
      return undefined
    }
  }

  return {
    async init() {
      if (await readStored()) return status()
      const fromEnv = env.ANTHROPIC_API_KEY?.trim() || undefined
      const candidate = fromEnv ?? (await dotenvKey())
      if (!candidate) return status()
      const from: KeySource = fromEnv ? 'env' : 'dotenv'
      if ((await probe(candidate)) === 'invalid') {
        log.warn(`auto-fill key from ${from} rejected`)
        return status()
      }
      key = candidate
      source = from
      if (!(await persist(candidate))) log.warn(`encryption unavailable; key from ${from} kept in memory only`)
      return status()
    },
    status,
    async save(raw, opts) {
      const k = raw.trim()
      if (!k) return { status: status(), result: 'empty' }
      if (!(await cipher.available())) return { status: status(), result: 'unavailable' }
      const result: ProbeResult = opts?.force ? 'unverified' : await probe(k)
      if (result === 'invalid' || (result === 'unverified' && !opts?.force)) return { status: status(), result }
      if (!(await persist(k))) return { status: status(), result: 'unavailable' }
      key = k
      source = 'stored'
      return { status: status(), result }
    },
    async clear() {
      await rm(file, { force: true })
      key = null
      source = 'none'
      return status()
    },
    getKey: () => key
  }
}
