import type {} from '../../src/preload/index.d' // Window.api globals
// KEY-03: a canary key reaches the API boundary and nothing else the renderer or disk can see.
import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { launch } from './launch'

async function* walk(dir: string): AsyncGenerator<string> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* walk(p)
    else if (e.isFile()) yield p
  }
}

test('canary key never leaves main', async () => {
  const canary = 'canary-' + randomUUID()
  const logs: string[] = []
  const { app, page, userData, scenarioKey, stdio } = await launch({
    scenario: 'probe-ok',
    env: { ANTHROPIC_API_KEY: canary }
  })
  page.on('console', (m) => logs.push(m.text()))
  try {
    await expect(page.locator('main[data-screen="home"]')).toBeVisible({ timeout: 15_000 })
    await page.getByTestId('open-settings').click()
    await expect(page.locator('main[data-screen="settings"]')).toBeVisible()

    const log = (await (
      await fetch(
        `${process.env.REPLAY_URL}/__log/${encodeURIComponent(scenarioKey)}?canary=${encodeURIComponent(canary)}`
      )
    ).json()) as { sawCanary: boolean }
    expect(log.sawCanary, 'canary reached the API (test is live)').toBe(true)

    expect((await page.content()).includes(canary), 'DOM').toBe(false)
    const status = await page.evaluate(() => window.api.key.status())
    expect(JSON.stringify(status).includes(canary), 'IPC status').toBe(false)
    expect(Object.keys(status).sort()).toEqual(['hasKey', 'source'])
    const storage = await page.evaluate(
      () => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage })
    )
    expect(storage.includes(canary), 'localStorage/sessionStorage').toBe(false)
    expect(logs.join('\n').includes(canary), 'renderer console').toBe(false)
  } finally {
    await app.close()
  }

  expect(stdio().includes(canary), 'main stdio()').toBe(false)
  const needle = Buffer.from(canary)
  const leaked: string[] = []
  for await (const f of walk(userData)) {
    if ((await stat(f)).size > 50 * 1024 * 1024) continue
    if ((await readFile(f)).includes(needle)) leaked.push(f)
  }
  expect(leaked, 'userData files containing the plaintext key').toEqual([])
})
