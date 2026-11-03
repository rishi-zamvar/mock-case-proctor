import type { Api, E2EHooks, VoiceProbe } from '../shared/ipc'

declare global {
  interface Window {
    api: Api
    __e2e?: E2EHooks
    __voice?: VoiceProbe
    __mic?: { load(b64: string): Promise<number>; ended(): Promise<void> }
  }
}

export {}
