import { describe, it, expect, vi } from 'vitest'
import { applyE2ESwitches } from './e2e'

function fake() {
  return { setPath: vi.fn(), commandLine: { appendSwitch: vi.fn() } }
}
const names = (f: ReturnType<typeof fake>): string[] =>
  f.commandLine.appendSwitch.mock.calls.map((c) => c[0] as string)

describe('applyE2ESwitches', () => {
  it('given no E2E env, when applied, then returns false and touches nothing', () => {
    const f = fake()
    expect(applyE2ESwitches(f, {})).toBe(false)
    expect(f.setPath).not.toHaveBeenCalled()
    expect(f.commandLine.appendSwitch).not.toHaveBeenCalled()
  })

  it('given E2E=0, when applied, then returns false', () => {
    const f = fake()
    expect(applyE2ESwitches(f, { E2E: '0' })).toBe(false)
    expect(f.commandLine.appendSwitch).not.toHaveBeenCalled()
  })

  it('given E2E=1 with USER_DATA_DIR, when applied, then isolates userData and sets fake-media switches', () => {
    const f = fake()
    expect(applyE2ESwitches(f, { E2E: '1', USER_DATA_DIR: '/tmp/u' })).toBe(true)
    expect(f.setPath).toHaveBeenCalledWith('userData', '/tmp/u')
    const n = names(f)
    expect(n).toEqual(
      expect.arrayContaining([
        'use-mock-keychain',
        'use-fake-ui-for-media-stream',
        'use-fake-device-for-media-stream'
      ])
    )
    expect(n).not.toContain('use-file-for-fake-audio-capture')
    expect(n).not.toContain('disable-features')
  })

  it('given FAKE_AUDIO_WAV, when applied, then feeds the file and disables AudioServiceSandbox once', () => {
    const f = fake()
    applyE2ESwitches(f, { E2E: '1', USER_DATA_DIR: '/tmp/u', FAKE_AUDIO_WAV: '/x/tone.wav' })
    expect(f.commandLine.appendSwitch).toHaveBeenCalledWith(
      'use-file-for-fake-audio-capture',
      '/x/tone.wav'
    )
    expect(f.commandLine.appendSwitch).toHaveBeenCalledWith('disable-features', 'AudioServiceSandbox')
    expect(names(f).filter((n) => n === 'disable-features')).toHaveLength(1)
  })
})
