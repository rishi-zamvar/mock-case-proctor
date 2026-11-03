// Display-sleep blocker for a session. Electron-free: index.ts injects powerSaveBlocker.
import type { Logger } from './log'

export type Blocker = {
  start(type: 'prevent-display-sleep'): number
  stop(id: number): void
  isStarted(id: number): boolean
}

export function createAwake(b: Blocker, log: Logger): { hold(): void; release(): void } {
  let id: number | null = null
  return {
    hold() {
      if (id !== null && b.isStarted(id)) return
      id = b.start('prevent-display-sleep')
      log.info('awake hold')
    },
    release() {
      if (id === null) return
      b.stop(id)
      id = null
      log.info('awake release')
    }
  }
}
