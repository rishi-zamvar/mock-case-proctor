// Launches the BUILT app (out/) with a minimal explicit env. Never spread process.env: it would
// leak the developer's real ANTHROPIC_API_KEY into the app under test.
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const ROOT = join(__dirname, '..', '..')

export async function launch(
  o: {
    scenario?: string
    env?: Record<string, string>
    userData?: string
    executablePath?: string
    live?: boolean
  } = {}
): Promise<{
  app: ElectronApplication
  page: Page
  userData: string
  scenarioKey: string
  stdio: () => string
}> {
  const scenarioKey = `${o.scenario ?? 'none'}~${randomUUID()}`
  const userData = o.userData ?? (await mkdtemp(join(tmpdir(), 'mcp-e2e-')))
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    E2E: '1',
    USER_DATA_DIR: userData,
    FAKE_AUDIO_WAV: join(ROOT, 'tests', 'fixtures', 'audio', 'tone.wav'),
    ...(o.live ? {} : { ANTHROPIC_BASE_URL: `${process.env.REPLAY_URL}/s/${scenarioKey}` }),
    ...o.env
  }
  const app = await electron.launch({
    ...(o.executablePath
      ? { executablePath: o.executablePath, args: [] }
      : { args: ['.'], cwd: ROOT }),
    env
  })
  let out = ''
  app.process().stdout?.on('data', (d) => (out += String(d)))
  app.process().stderr?.on('data', (d) => (out += String(d)))
  const page = await app.firstWindow()
  return { app, page, userData, scenarioKey, stdio: () => out }
}
