// Sandboxed preload: may import only `electron` and relative files (bundled).
import { contextBridge, ipcRenderer } from 'electron'
import { CH, type Api, type E2EHooks } from '../shared/ipc'

// ponytail: Pick until 03-10 wires the session API; then back to full Api.
const api: Pick<Api, 'key'> = {
  key: {
    status: () => ipcRenderer.invoke(CH.keyStatus),
    save: (key, opts) => ipcRenderer.invoke(CH.keySave, key, opts ?? {}),
    clear: () => ipcRenderer.invoke(CH.keyClear)
  }
}

contextBridge.exposeInMainWorld('api', api)

if (process.argv.includes('--e2e')) {
  const hooks: Pick<E2EHooks, 'micPeak'> = {
    micPeak: async (ms) => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      })
      const ctx = new AudioContext()
      try {
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 2048
        ctx.createMediaStreamSource(stream).connect(analyser)
        const buf = new Float32Array(analyser.fftSize)
        let peak = 0
        const t0 = performance.now()
        while (performance.now() - t0 < ms) {
          analyser.getFloatTimeDomainData(buf)
          for (const v of buf) peak = Math.max(peak, Math.abs(v))
          await new Promise((r) => setTimeout(r, 50))
        }
        return peak
      } finally {
        stream.getTracks().forEach((t) => t.stop())
        await ctx.close()
      }
    }
  }
  contextBridge.exposeInMainWorld('__e2e', hooks)
}
