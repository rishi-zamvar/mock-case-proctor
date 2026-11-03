// RECORD=1 captures the real probe fixtures once. Never put the key in an expect or message.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { parseDotenv } from '../../src/main/keys/dotenv'
import { probeKey } from '../../src/main/keys/probe'
import { startReplayServer } from './server'

const ROOT = join(__dirname, '..', '..')
const FIXTURES = join(ROOT, 'tests', 'fixtures', 'claude')
const DOTENV = join(ROOT, '.env')

const fixtureFiles = (): string[] =>
  readdirSync(FIXTURES, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => join(d.parentPath, d.name))

const realKey = (): string | undefined =>
  existsSync(DOTENV) ? parseDotenv(readFileSync(DOTENV, 'utf8')).ANTHROPIC_API_KEY : undefined

describe.skipIf(process.env.RECORD !== '1')('record probe fixtures (RECORD=1)', () => {
  test('given the real key, when probing through the record proxy, then probe-ok is valid and probe-401 invalid, and fixtures are key-free', async () => {
    const key = realKey() ?? ''
    expect(Boolean(key)).toBe(true)
    const { url, close } = await startReplayServer({
      fixturesDir: FIXTURES,
      logDir: join(ROOT, 'test-results', 'replay'),
      record: true
    })
    try {
      expect(await probeKey(key, { baseURL: url + '/s/probe-ok' })).toBe('valid')
      expect(await probeKey('invalid-key-e2e', { baseURL: url + '/s/probe-401' })).toBe('invalid')
    } finally {
      await close()
    }
    for (const f of fixtureFiles()) {
      const text = readFileSync(f, 'utf8')
      expect(text.includes(key)).toBe(false)
      expect(/authorization/i.test(text)).toBe(false)
    }
  }, 30_000)
})

describe('recorded fixtures vs the real dev key', () => {
  test('given a local .env, when scanning fixtures, then none contain its ANTHROPIC_API_KEY', () => {
    const key = realKey()
    if (!key) return
    const leaked = fixtureFiles().filter((f) => readFileSync(f, 'utf8').includes(key))
    expect(leaked.length).toBe(0)
  })
})
