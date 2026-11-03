// WAV fixture generation + replay server lifecycle for the whole E2E run.
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_LIBRARY_ROOT } from '../../src/main/domain/cases/library'
import { startReplayServer } from '../replay/server'
import { ROOT } from './launch'
import { VOICE_FIXTURES } from './voiceFixtures'

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

// 2 s of 16-bit mono 48 kHz zeros: the "can't hear you" mic fixture.
function writeSilence(path: string): void {
  const data = 48_000 * 2 * 2
  const b = Buffer.alloc(44 + data)
  b.write('RIFF', 0)
  b.writeUInt32LE(36 + data, 4)
  b.write('WAVE', 8)
  b.write('fmt ', 12)
  b.writeUInt32LE(16, 16)
  b.writeUInt16LE(1, 20) // PCM
  b.writeUInt16LE(1, 22) // mono
  b.writeUInt32LE(48_000, 24)
  b.writeUInt32LE(48_000 * 2, 28)
  b.writeUInt16LE(2, 32)
  b.writeUInt16LE(16, 34)
  b.write('data', 36)
  b.writeUInt32LE(data, 40)
  writeFileSync(path, b)
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  const cases = buildCasesRoot()
  process.env.E2E_CASES_ROOT = cases.root
  process.env.E2E_REAL_LIBRARY = cases.real ? '1' : '0'
  const audio = join(ROOT, 'tests', 'fixtures', 'audio')
  mkdirSync(audio, { recursive: true })
  const speech: Record<string, string> = {
    tone: 'The gross revenue retention is ninety two percent and the company grew forty eight percent last year',
    ...VOICE_FIXTURES
  }
  for (const [name, text] of Object.entries(speech)) {
    const wav = join(audio, `${name}.wav`)
    if (existsSync(wav)) continue
    const aiff = join(audio, `${name}.aiff`)
    execFileSync('say', ['-o', aiff, text])
    execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@48000', aiff, wav])
    rmSync(aiff, { force: true })
  }
  const silence = join(audio, 'silence.wav')
  if (!existsSync(silence)) writeSilence(silence)
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
