import type { SpeakEvent, VoiceProbe } from '../../../shared/ipc'
import type { AvatarBinding, AvatarState } from '../avatar/behaviour'
import { connectTts, loadHeadTts, type Tts, type TtsDevice } from './headtts'
import { createSpeechQueue, type SynthData, type SynthResult } from './speechQueue'

export const VOICE = 'bm_george' // THE single voice config value
export const AUDITION_VOICES = [
  'bm_george',
  'bm_lewis',
  'am_michael',
  'am_fenrir',
  'af_heart'
] as const
export const WARMUP_TEXT = 'Warm up.'
const GLB_URL = '/res/models/avatars/avatarsdk.glb'

// The subset of AvatarEngine voice.ts uses (kept local so tests fake it without three).
export type EngineLike = {
  host: HTMLElement
  ready: Promise<void>
  head: {
    audioCtx: { resume(): Promise<unknown> }
    isSpeaking: boolean
    speakAudio(d: SynthData): void
    speakMarker(fn: () => void): void
    stopSpeaking(): void
  }
  setVisible(v: boolean): void
  setPlaying(p: boolean): void
  setState(s: AvatarState): void
  state(): AvatarState
  stateLog(): AvatarState[]
  opaqueFraction(): number
}

export type VoiceDeps = {
  makeEngine(): Promise<EngineLike>
  connect(engine: EngineLike): Promise<Tts>
  instances?(): number
}

export type Voice = AvatarBinding & {
  enqueue(s: SpeakEvent): void
  cancel(turnId: string): void
  clear(): void
  warm(): Promise<void> // idempotent; resolves when ready (or device 'none')
  resume(): void // head.audioCtx.resume() on the Start gesture
  device(): TtsDevice | null
  onDevice(cb: (d: TtsDevice) => void): () => void
}

function defaultDeps(): VoiceDeps {
  let mod: typeof import('../avatar/avatarEngine') | null = null
  return {
    async makeEngine() {
      mod = await import('../avatar/avatarEngine') // dynamic: keeps three out of jsdom and fake mode
      return mod.createAvatarEngine({ glbUrl: GLB_URL }) as unknown as EngineLike
    },
    connect: (engine) =>
      connectTts({
        load: loadHeadTts,
        gpu: (navigator as { gpu?: { requestAdapter(): Promise<unknown | null> } }).gpu,
        audioCtx: engine.head.audioCtx,
        voice: VOICE,
        voices: AUDITION_VOICES,
        origin: location.href
      }),
    instances: () => mod?.avatarInstances() ?? 0
  }
}

export function createVoice(o: {
  ack(turnId: string, seq: number, spoken: boolean): void
  started?(turnId: string, seq: number): void
  deps?: VoiceDeps
}): Voice {
  const deps = o.deps ?? defaultDeps()
  const host = document.createElement('div')
  host.style.width = '100%'
  host.style.height = '100%'

  let engine: EngineLike | null = null
  let tts: Tts | null = null
  let dev: TtsDevice | null = null
  let visible = false
  let avatarState: AvatarState = 'idle'
  const deviceCbs = new Set<(d: TtsDevice) => void>()
  const playingCbs = new Set<(p: boolean) => void>()

  let readyOk!: () => void
  let readyFail!: (e: Error) => void
  const ready = new Promise<void>((res, rej) => {
    readyOk = res
    readyFail = rej
  })
  ready.catch(() => undefined) // the queue observes it; no unhandled rejection when idle

  const setDevice = (d: TtsDevice): void => {
    dev = d
    deviceCbs.forEach((cb) => cb(d))
  }

  let warming: Promise<void> | null = null
  const warm = (): Promise<void> =>
    (warming ??= (async () => {
      try {
        const e = await deps.makeEngine()
        host.appendChild(e.host)
        await e.ready
        engine = e
        e.setVisible(visible)
        e.setState(avatarState)
        tts = await deps.connect(e)
        setDevice(tts.device)
        // shader compile happens here, not on the first real line (Pitfall 10); the result is discarded
        if (tts.device !== 'none') await tts.synthesize(WARMUP_TEXT)
      } catch {
        if (dev === null) setDevice('none')
      }
      if (dev === 'none') readyFail(new Error('tts unavailable'))
      else readyOk()
    })())

  const queue = createSpeechQueue({
    tts: {
      synthesize: (t): Promise<SynthResult> =>
        warm().then(() => tts?.synthesize(t) ?? { ok: false, error: 'tts unavailable' })
    },
    head: {
      speakAudio(d) {
        engine!.setPlaying(true) // wake the engine even when the stage is hidden
        engine!.head.speakAudio(d)
      },
      speakMarker: (fn) => engine!.head.speakMarker(fn),
      stopSpeaking: () => engine?.head.stopSpeaking()
    },
    ready,
    ack: o.ack,
    onStarted: o.started,
    onPlaying(p) {
      if (!p) engine?.setPlaying(false)
      playingCbs.forEach((cb) => cb(p))
    }
  })

  const voice: Voice = {
    host,
    setVisible(v) {
      visible = v
      engine?.setVisible(v)
    },
    setState(s) {
      avatarState = s
      engine?.setState(s)
    },
    isPlaying: () => queue.isPlaying(),
    onPlaying(cb) {
      playingCbs.add(cb)
      return () => playingCbs.delete(cb)
    },
    enqueue(s) {
      void warm()
      queue.enqueue(s)
    },
    cancel: (t) => queue.cancel(t),
    clear: () => queue.clear(),
    warm,
    resume() {
      engine?.head.audioCtx.resume().catch(() => undefined)
    },
    device: () => dev,
    onDevice(cb) {
      deviceCbs.add(cb)
      if (dev !== null) cb(dev)
      return () => deviceCbs.delete(cb)
    }
  }

  if ('__e2e' in window) {
    const probe: VoiceProbe = {
      get ttsDevice() {
        return dev
      },
      get ready() {
        return engine !== null && dev !== null && dev !== 'none'
      },
      get isSpeaking() {
        return engine?.head.isSpeaking ?? false
      },
      get visemeCount() {
        return queue.stats().visemeCount
      },
      get spokenSeqs() {
        return queue.stats().spoken
      },
      get avatarState() {
        return engine?.state() ?? 'idle'
      },
      get stateLog() {
        return engine?.stateLog() ?? []
      },
      get instances() {
        return deps.instances?.() ?? 0
      },
      opaqueFraction: () => engine?.opaqueFraction() ?? 0,
      async audition(v, text) {
        await warm()
        const pcm = tts && tts.device !== 'none' ? await tts.synthPcm(text, v) : null
        if (pcm === null) throw new Error('audition failed')
        return pcm
      }
    }
    Object.defineProperty(window, '__voice', { value: probe, configurable: true })
  }
  return voice
}

let singleton: Voice | null = null
/** One voice runtime (and so one TalkingHead) per app lifetime. */
export function getVoice(o: {
  ack(turnId: string, seq: number, spoken: boolean): void
  started?(turnId: string, seq: number): void
}): Voice {
  return (singleton ??= createVoice(o))
}
