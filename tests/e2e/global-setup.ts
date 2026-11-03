// WAV fixture generation + replay server lifecycle for the whole E2E run.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { startReplayServer } from '../replay/server'
import { ROOT } from './launch'

export default async function globalSetup(): Promise<() => Promise<void>> {
  const audio = join(ROOT, 'tests', 'fixtures', 'audio')
  mkdirSync(audio, { recursive: true })
  const wav = join(audio, 'tone.wav')
  if (!existsSync(wav)) {
    const aiff = join(audio, 'tone.aiff')
    execFileSync('say', [
      '-o',
      aiff,
      'The gross revenue retention is ninety two percent and the company grew forty eight percent last year'
    ])
    execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@48000', aiff, wav])
  }
  const server = await startReplayServer({
    fixturesDir: join(ROOT, 'tests', 'fixtures', 'claude'),
    logDir: join(ROOT, 'test-results', 'replay'),
    record: process.env.RECORD === '1'
  })
  process.env.REPLAY_URL = server.url
  return () => server.close()
}
