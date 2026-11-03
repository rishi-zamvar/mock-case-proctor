// utilityProcess entry (out/main/sttWorker.js): whisper runs here so a GPU fault or slow load never takes down main.
// Never logs transcript text.
import { loadEngine, type Engine } from './engine'
import type { FromWorker, ToWorker } from './protocol'

const port = process.parentPort
const post = (m: FromWorker): void => port.postMessage(m)
let engine: Engine | null = null

port.on('message', async ({ data: m }: { data: ToWorker }) => {
  if (m.type === 'init') {
    try {
      engine = loadEngine(m.model)
      post({ type: 'ready', gpus: engine.gpus })
    } catch {
      post({ type: 'error', code: 'init_failed' })
    }
  } else {
    try {
      if (!engine) throw new Error('not initialised')
      post({ type: 'text', id: m.id, text: await engine.transcribe(m.pcm, m.prompt) })
    } catch {
      post({ type: 'error', id: m.id, code: 'transcribe_failed' })
    }
  }
})
