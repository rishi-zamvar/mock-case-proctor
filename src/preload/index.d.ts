import type { Api, E2EHooks } from '../shared/ipc'

declare global {
  interface Window {
    api: Api
    __e2e?: E2EHooks
  }
}

export {}
