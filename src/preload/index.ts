// Sandboxed preload: may import only `electron` and relative files (bundled).
import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import {
  CH,
  type Api,
  type E2EHooks,
  type IpcTapEntry,
  type SttMode,
  type TtsMode
} from '../shared/ipc'

const E2E = process.argv.includes('--e2e')
const TTS: TtsMode = process.argv.includes('--tts=headtts') ? 'headtts' : 'fake'
const STT: SttMode = process.argv.includes('--stt=whisper') ? 'whisper' : 'fake'
// E2E redaction tap: every main->renderer payload (invoke results + pushes) is recorded under --e2e only.
const tap: IpcTapEntry[] = []
const record = (channel: string, payload: unknown): void => {
  if (E2E) tap.push({ channel, payload: structuredClone(payload) })
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- each Api method narrows the result
const inv = (ch: string, ...a: unknown[]): Promise<any> =>
  ipcRenderer.invoke(ch, ...a).then((p) => {
    record(ch, p)
    return p
  })
const subscribe =
  <T>(ch: string) =>
  (cb: (p: T) => void): (() => void) => {
    const h = (_e: IpcRendererEvent, p: T): void => cb(p)
    ipcRenderer.on(ch, h)
    return () => void ipcRenderer.removeListener(ch, h)
  }

const api: Api = {
  key: {
    status: () => inv(CH.keyStatus),
    save: (key, opts) => inv(CH.keySave, key, opts ?? {}),
    clear: () => inv(CH.keyClear)
  },
  library: { list: () => inv(CH.libraryList) },
  session: {
    start: (caseId, opts) => inv(CH.sessionStart, caseId, opts),
    intent: (i) => inv(CH.sessionIntent, i),
    resume: (id) => inv(CH.sessionResume, id),
    discard: (id) => inv(CH.sessionDiscard, id)
  },
  config: { tts: TTS, stt: STT },
  stt: {
    // Not via inv: the E2E tap must never hold audio.
    chunk: (id, idx, pcm) => ipcRenderer.invoke(CH.sttChunk, id, idx, pcm),
    status: () => inv(CH.sttStatus)
  },
  speak: {
    ack: (turnId, seq, spoken) => inv(CH.speakAck, turnId, seq, spoken ?? true),
    started: (t, s) => inv(CH.speakStarted, t, s)
  },
  onView: subscribe(CH.view),
  onSpeak: subscribe(CH.speak),
  onSpeakCancel: subscribe(CH.speakCancel)
}

contextBridge.exposeInMainWorld('api', api)

if (E2E) {
  // Permanent listeners so the tap sees pushes even when no screen is subscribed.
  for (const ch of [CH.view, CH.speak, CH.speakCancel]) ipcRenderer.on(ch, (_e, p) => record(ch, p))
  const hooks: E2EHooks = {
    say: (text) => inv(CH.e2eSay, text),
    ipcLog: () => structuredClone(tap),
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
