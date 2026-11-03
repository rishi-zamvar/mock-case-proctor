import type {} from '../../src/preload/index.d' // Window.api globals
// KEY-01 / KEY-02 / KEY-04: API-key onboarding end to end in the built app, real safeStorage (mock keychain).
import { expect, test, type Locator, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch } from './launch'

const newKey = (): string => 'e2e-' + randomUUID()
const status = (page: Page): Promise<unknown> => page.evaluate(() => window.api.key.status())
const settings = (page: Page): Locator => page.locator('main[data-screen="settings"]')
const home = (page: Page): Locator => page.locator('main[data-screen="home"]')

type Log = { requests: { path: string; body: { max_tokens: number } }[] }
const replayLog = async (scenarioKey: string): Promise<Log> =>
  (await (
    await fetch(`${process.env.REPLAY_URL}/__log/${encodeURIComponent(scenarioKey)}`)
  ).json()) as Log

async function pasteAndSave(page: Page, key: string): Promise<void> {
  await page.getByTestId('key-input').fill(key)
  await page.getByTestId('save-btn').click()
}

// First: proves safeStorage persists across a relaunch under use-mock-keychain with no dialog.
test('paste → verify → Home, and relaunch is stored with no prompt', async () => {
  const first = await launch({ scenario: 'probe-ok' })
  try {
    await expect(settings(first.page)).toBeVisible({ timeout: 15_000 })
    await pasteAndSave(first.page, newKey())
    await expect(home(first.page)).toBeVisible()
    expect((await replayLog(first.scenarioKey)).requests[0].body.max_tokens).toBe(1)
  } finally {
    await first.app.close()
  }
  const second = await launch({ userData: first.userData })
  try {
    await expect(home(second.page)).toBeVisible({ timeout: 10_000 })
    expect(await status(second.page)).toEqual({ hasKey: true, source: 'stored' })
    expect((await replayLog(second.scenarioKey)).requests).toHaveLength(0)
  } finally {
    await second.app.close()
  }
})

test('invalid key stays on Settings', async () => {
  const { app, page } = await launch({ scenario: 'probe-401' })
  try {
    await pasteAndSave(page, newKey())
    await expect(page.getByTestId('key-message')).toHaveText('Anthropic rejected that key.')
    await expect(settings(page)).toBeVisible()
    expect(await status(page)).toEqual({ hasKey: false, source: 'none' })
  } finally {
    await app.close()
  }
})

test("offline → couldn't verify → Save anyway", async () => {
  const { app, page } = await launch({ env: { ANTHROPIC_BASE_URL: 'http://127.0.0.1:9' } })
  try {
    await pasteAndSave(page, newKey())
    await expect(page.getByTestId('key-message')).toHaveText(
      "Couldn't verify the key. Check your connection."
    )
    await page.getByTestId('save-anyway-btn').click()
    await expect(home(page)).toBeVisible()
    expect(await status(page)).toEqual({ hasKey: true, source: 'stored' })
  } finally {
    await app.close()
  }
})

test('auto-fill from env skips Settings', async () => {
  const first = await launch({ scenario: 'probe-ok', env: { ANTHROPIC_API_KEY: newKey() } })
  try {
    await expect(home(first.page)).toBeVisible({ timeout: 15_000 })
    expect(await status(first.page)).toEqual({ hasKey: true, source: 'env' })
  } finally {
    await first.app.close()
  }
  const second = await launch({ userData: first.userData })
  try {
    await expect(home(second.page)).toBeVisible({ timeout: 10_000 })
    expect(await status(second.page)).toEqual({ hasKey: true, source: 'stored' })
  } finally {
    await second.app.close()
  }
})

test('auto-fill from .env skips Settings', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mcp-e2e-dotenv-'))
  const path = join(dir, 'fixture.env')
  await writeFile(path, `ANTHROPIC_API_KEY=${newKey()}\n`)
  const { app, page } = await launch({ scenario: 'probe-ok', env: { E2E_DOTENV_PATH: path } })
  try {
    await expect(home(page)).toBeVisible({ timeout: 15_000 })
    expect(await status(page)).toEqual({ hasKey: true, source: 'dotenv' })
  } finally {
    await app.close()
  }
})

test('rejected env key falls back to Settings', async () => {
  const { app, page } = await launch({
    scenario: 'probe-401',
    env: { ANTHROPIC_API_KEY: newKey() }
  })
  try {
    await expect(settings(page)).toBeVisible({ timeout: 15_000 })
    expect(await status(page)).toEqual({ hasKey: false, source: 'none' })
  } finally {
    await app.close()
  }
})

test('Replace and Clear', async () => {
  const first = await launch({ scenario: 'probe-ok' })
  try {
    await pasteAndSave(first.page, newKey())
    await expect(home(first.page)).toBeVisible()
  } finally {
    await first.app.close()
  }
  const userData = first.userData
  // Fresh scenarioKey: each fixture has only 0.res.json and the counter is per key.
  const second = await launch({ scenario: 'probe-ok', userData })
  try {
    const { page } = second
    await expect(home(page)).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('open-settings').click()
    await expect(page.getByTestId('key-status')).toHaveText('Key saved ✓')
    await expect(page.getByTestId('key-source')).toHaveText('Stored encrypted in macOS Keychain')
    await expect(page.getByTestId('key-input')).toHaveCount(0)
    await page.getByTestId('replace-btn').click()
    await pasteAndSave(page, newKey())
    await expect(home(page)).toBeVisible()
    expect((await replayLog(second.scenarioKey)).requests).toHaveLength(1)

    await page.getByTestId('open-settings').click()
    await page.getByTestId('clear-btn').click()
    await expect(page.getByTestId('key-status')).toHaveText('No key saved')
    await expect(page.getByTestId('key-input')).toBeVisible()
    expect(await status(page)).toEqual({ hasKey: false, source: 'none' })
    expect(existsSync(join(userData, 'anthropic-key.enc'))).toBe(false)
  } finally {
    await second.app.close()
  }
  const third = await launch({ userData })
  try {
    await expect(settings(third.page)).toBeVisible({ timeout: 10_000 })
  } finally {
    await third.app.close()
  }
})
