import type {} from '../../src/preload/index.d' // Window.__voice global
// @audition: renders every candidate voice on finance lines to WAV (gitignored) for Rishi to judge.
import { expect, test } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { speakable } from '../../src/main/domain/text/speakable'
import { AUDITION_VOICES } from '../../src/renderer/src/speech/voice'
import { ROOT } from './launch'
import { launchLibrary } from './session'

const OUT = join(ROOT, '.planning', 'phases', '05-voice-out-avatar', 'audition')
const RATE = 24_000
const LINES = [
  'Walk me through how you got from $184M of ARR to the 4.1x multiple.',
  'NRR is 128% but GRR is only 86%. What does that tell you about the base?',
  'Margins expanded 450 bps in two years. Is that durable?',
  'If CAC payback is 26 months, would you still lead the round?',
  'Fair enough. What would make you walk away from this deal at $2.1B?'
]

function wav(pcm: Buffer): Buffer {
  const h = Buffer.alloc(44)
  h.write('RIFF', 0)
  h.writeUInt32LE(36 + pcm.length, 4)
  h.write('WAVEfmt ', 8)
  h.writeUInt32LE(16, 16) // fmt chunk size
  h.writeUInt16LE(1, 20) // PCM
  h.writeUInt16LE(1, 22) // mono
  h.writeUInt32LE(RATE, 24)
  h.writeUInt32LE(RATE * 2, 28) // byte rate
  h.writeUInt16LE(2, 32) // block align
  h.writeUInt16LE(16, 34) // bits per sample
  h.write('data', 36)
  h.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([h, pcm])
}

test('generates audition WAVs @audition', async () => {
  test.setTimeout(300_000)
  const { app, page } = await launchLibrary({ env: { TTS: 'headtts' } })
  try {
    await expect
      .poll(() => page.evaluate(() => window.__voice?.ready), { timeout: 60_000 })
      .toBe(true)
    mkdirSync(OUT, { recursive: true })
    for (const v of AUDITION_VOICES)
      for (const [i, line] of LINES.entries()) {
        const b64 = await page.evaluate(([v, t]) => window.__voice!.audition(v, t), [
          v,
          speakable(line)
        ] as const)
        const pcm = Buffer.from(b64, 'base64')
        let peak = 0
        for (let k = 0; k + 1 < pcm.length; k += 2)
          peak = Math.max(peak, Math.abs(pcm.readInt16LE(k)))
        expect(pcm.length / 2 / RATE, `${v}-${i + 1} seconds`).toBeGreaterThanOrEqual(0.5)
        expect(peak, `${v}-${i + 1} peak`).toBeGreaterThan(1000)
        writeFileSync(join(OUT, `${v}-${i + 1}.wav`), wav(pcm))
      }
  } finally {
    await app.close()
  }
})
