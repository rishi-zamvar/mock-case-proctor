// WAV fixture generation + replay server lifecycle for the whole E2E run.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_LIBRARY_ROOT } from '../../src/main/domain/cases/library'
import { startReplayServer } from '../replay/server'
import { ROOT } from './launch'

// Combined cases root: real case dirs (readdir+isDirectory skips symlinked dirs) holding
// symlinks to the real files, so private case data is never copied into the repo or test-results.
function linkCase(src: string, dst: string, name: string): void {
  mkdirSync(join(dst, name))
  for (const f of readdirSync(join(src, name))) symlinkSync(join(src, name, f), join(dst, name, f))
  const id = name.slice(5, 7)
  symlinkSync(
    join(src, '_work/data', `case_${id}.json`),
    join(dst, '_work/data', `case_${id}.json`)
  )
}

function buildCasesRoot(): { root: string; real: boolean } {
  const root = mkdtempSync(join(tmpdir(), 'mcp-cases-'))
  mkdirSync(join(root, '_work/data'), { recursive: true })
  const real = existsSync(join(DEFAULT_LIBRARY_ROOT, '_work/data/case_01.json'))
  if (real)
    for (const n of readdirSync(DEFAULT_LIBRARY_ROOT))
      if (/^case_\d{2}_[a-z0-9]+$/.test(n)) linkCase(DEFAULT_LIBRARY_ROOT, root, n)
  linkCase(join(ROOT, 'tests', 'fixtures', 'cases'), root, 'case_99_fixture')
  return { root, real }
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  const cases = buildCasesRoot()
  process.env.E2E_CASES_ROOT = cases.root
  process.env.E2E_REAL_LIBRARY = cases.real ? '1' : '0'
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
  return async () => {
    await server.close()
    rmSync(cases.root, { recursive: true, force: true })
  }
}
