// FND-01 / FND-04: one smoke test on the packaged, ad-hoc-signed arm64 .app (not out/).
import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { launch, ROOT } from './launch'

const APP_BIN = join(
  ROOT,
  'release/mac-arm64/Mock Case Proctor.app/Contents/MacOS/Mock Case Proctor'
)

test('packaged app launches and loads the SDK', { tag: '@packaged' }, async () => {
  const { app, page, scenarioKey } = await launch({
    executablePath: APP_BIN,
    scenario: 'probe-ok',
    env: { ANTHROPIC_API_KEY: 'pkg-' + randomUUID() }
  })
  try {
    // Reaching Home means the env key was probed through the SDK + zod loaded from the asar.
    await expect(page.locator('main[data-screen="home"]')).toBeVisible({ timeout: 30_000 })
    expect(page.url().startsWith('app://bundle/')).toBe(true)
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1)
    const log = (await (
      await fetch(`${process.env.REPLAY_URL}/__log/${encodeURIComponent(scenarioKey)}`)
    ).json()) as { requests: { path: string }[] }
    expect(log.requests).toHaveLength(1)
    expect(log.requests[0].path).toContain('/v1/messages')
  } finally {
    await app.close()
  }
})
