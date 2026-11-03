// Copies the HeadTTS/transformers/ORT runtime into the renderer public dir so app:// serves it offline.
import { cpSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const readJson = (p: string): Record<string, unknown> => JSON.parse(readFileSync(p, 'utf8'))

export function copyVoiceVendor(o: { nodeModules: string; out: string; shim: string }): void {
  const nm = o.nodeModules
  const tf = join(nm, '@huggingface/transformers')
  const nested = join(tf, 'node_modules/onnxruntime-web')
  const ort = existsSync(nested) ? nested : join(nm, 'onnxruntime-web')
  // transformers.min.js bundles its own ORT glue; the wasm must be the exact same build.
  const want = (readJson(join(tf, 'package.json')).dependencies as Record<string, string>)[
    'onnxruntime-web'
  ]
  const have = readJson(join(ort, 'package.json')).version
  if (have !== want) throw new Error(`onnxruntime-web version mismatch: want ${want}, have ${have}`)

  const headtts = join(nm, '@met4citizen/headtts')
  cpSync(join(headtts, 'modules'), join(o.out, 'headtts/modules'), {
    recursive: true,
    filter: (f) => !f.endsWith('headtts-node.mjs')
  })
  cpSync(join(headtts, 'dictionaries/en-us.txt'), join(o.out, 'headtts/dictionaries/en-us.txt'))
  cpSync(o.shim, join(o.out, 'headtts/tf-shim.mjs'))
  cpSync(join(tf, 'dist/transformers.min.js'), join(o.out, 'tf/transformers.min.js'))
  for (const f of ['ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm'])
    cpSync(join(ort, 'dist', f), join(o.out, 'ort', f))
}
