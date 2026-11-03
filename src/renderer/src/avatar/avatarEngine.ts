import { TalkingHead } from '@met4citizen/talkinghead'
import { LipsyncEn } from '@met4citizen/talkinghead/modules/lipsync-en.mjs'
import type { AvatarState } from './behaviour'
import { createAvatarCore, type CoreHead } from './avatarCore'

export type TalkingHeadLike = CoreHead & {
  audioCtx: AudioContext
  isSpeaking: boolean
  renderer: { domElement: HTMLCanvasElement }
  speakAudio(d: unknown): void
  speakMarker(fn: () => void): void
  stopSpeaking(): void
  render(): void
}
export type AvatarEngine = {
  host: HTMLDivElement
  head: TalkingHeadLike
  ready: Promise<void> // showAvatar resolved
  setVisible(v: boolean): void
  setPlaying(p: boolean): void // run gating: shouldRun({visible, playing})
  setState(s: AvatarState): void
  state(): AvatarState
  stateLog(): AvatarState[]
  opaqueFraction(): number
}

let constructed = 0
export const avatarInstances = (): number => constructed

// WebGL glue only, covered by the T2 E2E (05-08); the logic lives in avatarCore (unit-tested).
export function createAvatarEngine(o: { glbUrl: string }): AvatarEngine {
  const host = document.createElement('div')
  host.className = 'avatar-host'
  host.style.width = '100%' // CSSOM is CSP-safe; setAttribute('style') is not
  host.style.height = '100%'

  const head = new TalkingHead(host, {
    ttsEndpoint: null,
    lipsyncModules: [], // [] = the constructor never runs its computed import()
    lipsyncLang: 'en',
    cameraView: 'upper',
    modelFPS: 30,
    avatarMood: 'neutral',
    avatarIdleEyeContact: 0.4,
    avatarSpeakingEyeContact: 0.7,
    lightAmbientIntensity: 2,
    lightDirectIntensity: 15,
    lightDirectColor: 0xffe8d6, // soft warm key; tune from the T2 screenshot
    lightSpotIntensity: 0
  }) as unknown as TalkingHeadLike & { lipsync: Record<string, unknown> }
  constructed++
  head.lipsync.en = new LipsyncEn()

  const core = createAvatarCore(head)
  const ready = (head as unknown as { showAvatar(a: Record<string, unknown>): Promise<void> })
    .showAvatar({
      url: o.glbUrl,
      body: 'M',
      avatarMood: 'neutral',
      lipsyncLang: 'en',
      retarget: {
        Neck: { z: -0.01, rx: -0.15 },
        Neck1: { z: -0.01, rx: -0.15 },
        Neck2: { z: -0.01, rx: -0.15 },
        LeftShoulder: { rz: -0.3 },
        RightShoulder: { rz: 0.3 },
        scaleToEyesLevel: 1.0,
        origin: { y: -0.1 }
      },
      baseline: { headRotateX: -0.04, eyeBlinkLeft: 0.05, eyeBlinkRight: 0.05 }
    })
    .then(() => core.onReady())

  return {
    host,
    head,
    ready,
    setVisible: core.setVisible,
    setPlaying: core.setPlaying,
    setState: core.setState,
    state: core.state,
    stateLog: core.stateLog,
    opaqueFraction() {
      // one synchronous task: preserveDrawingBuffer is false (Pitfall 5)
      head.render()
      const c = head.renderer.domElement
      if (!c.width || !c.height) return 0
      const g = new OffscreenCanvas(c.width, c.height).getContext('2d')
      if (!g) return 0
      g.drawImage(c, 0, 0)
      const d = g.getImageData(0, 0, c.width, c.height).data
      let n = 0
      let k = 0
      for (let i = 3; i < d.length; i += 64) {
        k++
        if (d[i] > 0) n++
      }
      return k ? n / k : 0
    }
  }
}
