// KEY-01 (live): one real probe with Rishi's key from .env. Runs only with LIVE=1. Never prints the key.
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { parseDotenv } from './dotenv'
import { probeKey } from './probe'

describe.skipIf(!process.env.LIVE)('probeKey against the real Anthropic API', () => {
  test('given the real .env key, when probed live, then it is valid; a junk key is invalid', async (ctx) => {
    const path = join(process.cwd(), '.env')
    if (!existsSync(path)) ctx.skip()
    const key = parseDotenv(readFileSync(path, 'utf8')).ANTHROPIC_API_KEY
    if (!key) ctx.skip()
    delete process.env.ANTHROPIC_BASE_URL
    expect(await probeKey(key)).toBe('valid')
    expect(await probeKey('invalid-key-live')).toBe('invalid')
  }, 30_000)
})
