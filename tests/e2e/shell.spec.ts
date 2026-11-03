import type {} from '../../src/preload/index.d' // Window.api / __e2e globals
// FND-01 / FND-03 / FND-05: the built shell is sandboxed, CSP-locked, app://-safe, replay-wired and mic-fed.
import { expect, test } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { CSP } from '../../src/shared/csp'
import { launch } from './launch'

test('launches the built app to Settings on a fresh profile', async () => {
  const { app, page } = await launch()
  try {
    await expect(page.locator('main[data-screen="settings"]')).toBeVisible({ timeout: 15_000 })
    expect(await app.evaluate(({ app }) => app.getName())).toBe('Mock Case Proctor')
  } finally {
    await app.close()
  }
})

test('renderer has no Node and a minimal api', async () => {
  const { app, page } = await launch()
  try {
    await page.waitForSelector('main[data-screen]')
    expect(await page.evaluate(() => [typeof require, typeof process, typeof module])).toEqual([
      'undefined',
      'undefined',
      'undefined'
    ])
    expect(await page.evaluate(() => Object.keys(window.api).sort())).toEqual([
      'config',
      'key',
      'library',
      'onSpeak',
      'onSpeakCancel',
      'onView',
      'session',
      'speak',
      'stt'
    ])
    expect(await page.evaluate(() => window.api.config)).toEqual({ tts: 'fake', stt: 'fake' })
    expect(await page.evaluate(() => Object.keys(window.api.stt!).sort())).toEqual([
      'chunk',
      'status'
    ])
    expect(await page.evaluate(() => Object.keys(window.api.session).sort())).toEqual([
      'discard',
      'intent',
      'resume',
      'start'
    ])
    expect(await page.evaluate(() => Object.keys(window.api.key).sort())).toEqual([
      'clear',
      'save',
      'status'
    ])
    expect(
      await page.evaluate(() => typeof (window as unknown as { electron?: unknown }).electron)
    ).toBe('undefined')
  } finally {
    await app.close()
  }
})

test('webPreferences are locked', async () => {
  const { app, page } = await launch()
  try {
    await page.waitForSelector('main[data-screen]')
    const p = await app.evaluate(({ BrowserWindow }) => {
      // getLastWebPreferences exists at runtime but is missing from electron.d.ts.
      const wc = BrowserWindow.getAllWindows()[0].webContents as unknown as {
        getLastWebPreferences(): Record<string, unknown> | null
      }
      const w = wc.getLastWebPreferences()
      return { s: w?.sandbox, c: w?.contextIsolation, n: w?.nodeIntegration, w: w?.webSecurity }
    })
    expect(p).toEqual({ s: true, c: true, n: false, w: true })
    expect(page.url().startsWith('app://bundle/')).toBe(true)
  } finally {
    await app.close()
  }
})

test('CSP meta and header equal the constant', async () => {
  const { app, page } = await launch()
  try {
    await page.waitForSelector('main[data-screen]')
    const meta = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content')
    // The meta drops frame-ancestors (ignored in <meta>, see 01-06); the header carries the full constant.
    const metaCsp = CSP.split('; ')
      .filter((d) => !d.startsWith('frame-ancestors'))
      .join('; ')
    expect(meta).toBe(metaCsp)
    const header = await page.evaluate(() =>
      fetch(location.href).then((r) => r.headers.get('content-security-policy'))
    )
    expect(header).toBe(CSP)
  } finally {
    await app.close()
  }
})

test('app:// refuses traversal and unknown hosts', async () => {
  const { app, page } = await launch()
  try {
    await page.waitForSelector('main[data-screen]')
    // Same-origin traversal attempts: the renderer itself gets a 404.
    for (const u of ['app://bundle/%2e%2e/main/index.js', 'app://bundle/..%2fmain%2findex.js']) {
      expect(await page.evaluate((url) => fetch(url).then((r) => r.status), u), u).toBe(404)
    }
    // app://evil is cross-origin (no corsEnabled, by design), so the renderer cannot read it at all;
    // main's net.fetch goes through the same handler and proves it answers 404.
    expect(
      await page.evaluate(() =>
        fetch('app://evil/index.html').then(
          () => 'read',
          () => 'blocked'
        )
      )
    ).toBe('blocked')
    for (const u of ['app://evil/index.html', 'app://bundle/%2e%2e/main/index.js']) {
      expect(await app.evaluate(({ net }, url) => net.fetch(url).then((r) => r.status), u), u).toBe(
        404
      )
    }
  } finally {
    await app.close()
  }
})

test('window.open is denied', async () => {
  const { app, page } = await launch()
  try {
    await page.waitForSelector('main[data-screen]')
    expect(await page.evaluate(() => window.open('https://example.com') === null)).toBe(true)
    expect(app.windows().length).toBe(1)
  } finally {
    await app.close()
  }
})

test('fake audio reaches the page', async () => {
  const { app, page } = await launch()
  try {
    await page.waitForSelector('main[data-screen]')
    const peak = await page.evaluate(() => window.__e2e!.micPeak(2500))
    expect(peak).toBeGreaterThan(0.1)
  } finally {
    await app.close()
  }
})

test('replay server answers through ANTHROPIC_BASE_URL', async () => {
  const { app, page, scenarioKey } = await launch({
    scenario: 'probe-ok',
    env: { ANTHROPIC_API_KEY: 'shell-replay-' + randomUUID() }
  })
  try {
    await expect(page.locator('main[data-screen="home"]')).toBeVisible({ timeout: 15_000 })
    const log = (await (await fetch(`${process.env.REPLAY_URL}/__log/${scenarioKey}`)).json()) as {
      requests: { path: string; body: { model: string } }[]
    }
    expect(log.requests[0].path).toBe('/v1/messages')
    expect(log.requests[0].body.model).toBe('claude-haiku-5-5')
  } finally {
    await app.close()
  }
})
