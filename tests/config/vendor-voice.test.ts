import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, test } from 'vitest'
import { copyVoiceVendor } from '../../scripts/vendorVoice'

const shim = resolve('src/renderer/vendor/tf-shim.mjs')

describe('copyVoiceVendor', () => {
  test('given the real node_modules, when vendoring, then the voice runtime lands in out without the node entry', () => {
    const out = mkdtempSync(join(tmpdir(), 'vendor-'))
    copyVoiceVendor({ nodeModules: resolve('node_modules'), out, shim })
    for (const f of [
      'headtts/modules/headtts.mjs',
      'headtts/modules/worker-tts.mjs',
      'headtts/dictionaries/en-us.txt',
      'headtts/tf-shim.mjs',
      'tf/transformers.min.js',
      'ort/ort-wasm-simd-threaded.asyncify.mjs',
      'ort/ort-wasm-simd-threaded.asyncify.wasm'
    ])
      expect(existsSync(join(out, f)), f).toBe(true)
    expect(existsSync(join(out, 'headtts/modules/headtts-node.mjs'))).toBe(false)
  })

  test('given an onnxruntime-web that differs from the transformers pin, when vendoring, then it throws', () => {
    const nm = mkdtempSync(join(tmpdir(), 'fake-nm-'))
    const pkg = (dir: string, json: object): void => {
      mkdirSync(join(nm, dir), { recursive: true })
      writeFileSync(join(nm, dir, 'package.json'), JSON.stringify(json))
    }
    pkg('@met4citizen/headtts/modules', {})
    writeFileSync(join(nm, '@met4citizen/headtts/modules/headtts.mjs'), '')
    mkdirSync(join(nm, '@met4citizen/headtts/dictionaries'))
    writeFileSync(join(nm, '@met4citizen/headtts/dictionaries/en-us.txt'), '')
    pkg('@huggingface/transformers', { dependencies: { 'onnxruntime-web': '1.2.3' } })
    mkdirSync(join(nm, '@huggingface/transformers/dist'))
    writeFileSync(join(nm, '@huggingface/transformers/dist/transformers.min.js'), '')
    pkg('onnxruntime-web', { version: '9.9.9' })
    const out = mkdtempSync(join(tmpdir(), 'vendor-'))
    expect(() => copyVoiceVendor({ nodeModules: nm, out, shim })).toThrow(
      'onnxruntime-web version mismatch'
    )
  })
})
