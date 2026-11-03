import type { Api, E2EHooks, VoiceProbe } from '../shared/ipc'

declare global {
  interface Window {
    api: Api
    __e2e?: E2EHooks
    __voice?: VoiceProbe
  }
}

export {}
