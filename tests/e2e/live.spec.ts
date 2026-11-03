import type {} from '../../src/preload/index.d' // Window.api globals
// KEY-01 / KEY-02 (live): the built app reads the real key from .env and probes api.anthropic.com.
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseDotenv } from '../../src/main/keys/dotenv'
import { launch, ROOT } from './launch'

test(
  'built app auto-fills the real key from .env and probes the live API',
  { tag: '@live' },
  async () => {
    const dotenv = join(ROOT, '.env')
    const key = parseDotenv(readFileSync(dotenv, 'utf8')).ANTHROPIC_API_KEY ?? ''
    expect(key.length > 0).toBe(true)
    const { app, page, stdio } = await launch({ live: true, env: { E2E_DOTENV_PATH: dotenv } })
    try {
      await expect(page.locator('main[data-screen="home"]')).toBeVisible({ timeout: 30_000 })
      expect(await page.evaluate(() => window.api.key.status())).toEqual({
        hasKey: true,
        source: 'dotenv'
      })
      expect(stdio().includes(key)).toBe(false) // boolean only: never print the key
    } finally {
      await app.close()
    }
  }
)
