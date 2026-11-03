// HeadTTS transformersModule shim: re-export transformers.js, then point ORT + models at app:// (no CDN).
export * from '../tf/transformers.min.js'
import { env } from '../tf/transformers.min.js'
// Set after import: transformers defaults wasmPaths to jsDelivr at module init.
env.backends.onnx.wasm.wasmPaths = new URL('../ort/', import.meta.url).href
// Else the ORT glue is re-imported from a blob: URL, which script-src blocks.
env.useWasmCache = false
env.allowLocalModels = true
env.localModelPath = new URL('/res/models/', import.meta.url).href
// Local only: a missing model fails loudly instead of silently pulling 326 MB from HF.
env.allowRemoteModels = false
