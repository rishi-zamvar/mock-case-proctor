import { describe, it, expect, vi, type Mock } from 'vitest'
import { ensureMediaAccess, type MediaKind, type MediaPrefs } from './media'

type Fake = {
  prefs: {
    getMediaAccessStatus: Mock<MediaPrefs['getMediaAccessStatus']>
    askForMediaAccess: Mock<MediaPrefs['askForMediaAccess']>
  }
  log: { info: Mock; warn: Mock; error: Mock }
}

function fake(status: Record<MediaKind, string>, ask: (k: MediaKind) => Promise<boolean>): Fake {
  const prefs = {
    getMediaAccessStatus: vi.fn((k: MediaKind) => status[k]),
    askForMediaAccess: vi.fn(ask)
  } satisfies MediaPrefs
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  return { prefs, log }
}
const undetermined = { microphone: 'not-determined', camera: 'not-determined' }

describe('ensureMediaAccess', () => {
  it('given linux, when ensured, then returns null and leaves prefs untouched', async () => {
    const { prefs, log } = fake(undetermined, async () => true)
    expect(await ensureMediaAccess({ platform: 'linux', e2e: false, prefs, log })).toBeNull()
    expect(prefs.getMediaAccessStatus).not.toHaveBeenCalled()
    expect(prefs.askForMediaAccess).not.toHaveBeenCalled()
  })

  it('given e2e on darwin, when ensured, then returns null and leaves prefs untouched', async () => {
    const { prefs, log } = fake(undetermined, async () => true)
    expect(await ensureMediaAccess({ platform: 'darwin', e2e: true, prefs, log })).toBeNull()
    expect(prefs.getMediaAccessStatus).not.toHaveBeenCalled()
    expect(prefs.askForMediaAccess).not.toHaveBeenCalled()
  })

  it('given both not-determined, when ensured, then asks mic then camera sequentially and reports granted', async () => {
    const order: string[] = []
    const { prefs, log } = fake(undetermined, async (k) => {
      order.push(`start ${k}`)
      await new Promise((r) => setTimeout(r, 5))
      order.push(`end ${k}`)
      return true
    })
    const r = await ensureMediaAccess({ platform: 'darwin', e2e: false, prefs, log })
    expect(order).toEqual(['start microphone', 'end microphone', 'start camera', 'end camera'])
    expect(r).toEqual({ microphone: 'granted', camera: 'granted' })
  })

  it('given mic granted and camera denied, when ensured, then never asks and echoes statuses', async () => {
    const { prefs, log } = fake({ microphone: 'granted', camera: 'denied' }, async () => true)
    const r = await ensureMediaAccess({ platform: 'darwin', e2e: false, prefs, log })
    expect(prefs.askForMediaAccess).not.toHaveBeenCalled()
    expect(r).toEqual({ microphone: 'granted', camera: 'denied' })
  })

  it('given ask resolves false, when ensured, then that kind reports denied', async () => {
    const { prefs, log } = fake(undetermined, async (k) => k === 'camera')
    const r = await ensureMediaAccess({ platform: 'darwin', e2e: false, prefs, log })
    expect(r).toEqual({ microphone: 'denied', camera: 'granted' })
  })

  it('given ask rejects for mic, when ensured, then warns, reports error, still processes camera', async () => {
    const { prefs, log } = fake(undetermined, async (k) => {
      if (k === 'microphone') throw new Error('boom')
      return true
    })
    const r = await ensureMediaAccess({ platform: 'darwin', e2e: false, prefs, log })
    expect(log.warn).toHaveBeenCalledWith('media access failed', 'microphone')
    expect(r).toEqual({ microphone: 'error', camera: 'granted' })
  })
})
