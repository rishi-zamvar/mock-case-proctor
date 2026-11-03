// macOS TCC prompt for mic + camera before the first session. Electron-free: index.ts injects
// systemPreferences. Never throws: a missing permission must not stop the app.
import type { Logger } from './log'

export type MediaKind = 'microphone' | 'camera'
export type MediaPrefs = {
  getMediaAccessStatus(t: MediaKind): string
  askForMediaAccess(t: MediaKind): Promise<boolean>
}

export async function ensureMediaAccess(o: {
  platform: string
  e2e: boolean
  prefs: MediaPrefs
  log: Logger
}): Promise<Record<MediaKind, string> | null> {
  if (o.platform !== 'darwin' || o.e2e) return null
  const out = {} as Record<MediaKind, string>
  for (const kind of ['microphone', 'camera'] as const) {
    try {
      const s = o.prefs.getMediaAccessStatus(kind)
      // Only undetermined prompts; macOS will not re-show the dialog to a denied user anyway.
      out[kind] = s === 'not-determined' ? ((await o.prefs.askForMediaAccess(kind)) ? 'granted' : 'denied') : s
    } catch {
      o.log.warn('media access failed', kind)
      out[kind] = 'error'
    }
  }
  o.log.info('media access', out)
  return out
}
