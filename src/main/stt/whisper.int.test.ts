// Real whisper-cpp-node on Metal. One engine per model (Pitfall 9); turbo only under SLOW=1.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadEngine, type Engine } from './engine'
import { matches, parseNumbers } from '../domain/text/numbers'
import { FINANCE_VOCAB } from '../domain/cases/sttPrompt'

const MODELS = join(__dirname, '../../../resources/assets/models/whisper')
const PROMPT = 'Acme, ' + FINANCE_VOCAB.join(', ')
const FINANCE =
  "I'd pass at five hundred forty million; gross retention is eighty seven percent, so the back solve needs forty eight percent CAGR"
const EXPECTED = parseNumbers('540 million 87% 48%')

function wavToF32(b: Buffer): Float32Array {
  let o = 12
  while (b.toString('ascii', o, o + 4) !== 'data') o += 8 + b.readUInt32LE(o + 4)
  const n = b.readUInt32LE(o + 4) / 2
  const a = new Float32Array(n)
  for (let i = 0; i < n; i++) a[i] = b.readInt16LE(o + 8 + 2 * i) / 32768
  return a
}

let dir: string
let finance: Float32Array

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'stt-'))
  const f = join(dir, 'finance.wav')
  execFileSync('say', ['-o', f, '--data-format=LEI16@16000', FINANCE])
  finance = wavToF32(readFileSync(f))
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

function open(file: string): Engine {
  const p = join(MODELS, file)
  if (!existsSync(p)) throw new Error(`missing ${p}: run npm run fetch:voice`)
  return loadEngine(p)
}

function expectFinanceNumbers(text: string): void {
  const got = parseNumbers(text)
  for (const want of EXPECTED) expect(got.some((g) => matches(g, want))).toBe(true)
}

describe('whisper base.en', () => {
  let engine: Engine
  beforeAll(() => {
    engine = open('ggml-base.en.bin')
  }, 60_000)
  afterAll(() => engine?.free())

  it('runs on Metal', () => {
    expect(engine.gpus.length).toBeGreaterThan(0)
    expect(engine.gpus[0].name).toMatch(/^MTL/)
  })

  it('transcribes the finance fixture to the right numbers, twice on one context', async () => {
    expectFinanceNumbers(await engine.transcribe(finance, PROMPT))
    expect((await engine.transcribe(finance, PROMPT)).trim()).not.toBe('')
  }, 60_000)

  it('throws on a missing model', () => {
    expect(() => loadEngine(join(dir, 'nope.bin'))).toThrow()
  })
})

describe.skipIf(!process.env.SLOW)('whisper turbo q5_0', () => {
  let engine: Engine
  beforeAll(() => {
    engine = open('ggml-large-v3-turbo-q5_0.bin')
  }, 300_000)
  afterAll(() => engine?.free())

  it('turbo transcribes the finance fixture and reports latency', async () => {
    expectFinanceNumbers(await engine.transcribe(finance, PROMPT))
    const long = new Float32Array(16000 * 120)
    for (let o = 0; o < long.length; o += finance.length)
      long.set(finance.subarray(0, long.length - o), o)
    for (const secs of [10, 30, 60, 120]) {
      const t = Date.now()
      await engine.transcribe(long.slice(0, 16000 * secs), PROMPT)
      console.log(`turbo ${secs}s ${Date.now() - t}ms`)
    }
  }, 300_000)
})
