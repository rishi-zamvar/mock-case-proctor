import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

const BANNED = /MediaRecorder|captureStream|createWriteStream/
const ROOTS = ['src/renderer', 'src/preload']

describe('no recording', () => {
  test('given the renderer and preload sources, when scanned, then nothing can record or write media', () => {
    const files = ROOTS.flatMap((root) =>
      readdirSync(root, { recursive: true, encoding: 'utf8' })
        .filter((f) => /\.tsx?$/.test(f))
        .map((f) => join(root, f))
    )
    expect(files.length).toBeGreaterThan(0)
    const hits = files.filter((f) => BANNED.test(readFileSync(f, 'utf8')))
    expect(hits).toEqual([])
  })
})
