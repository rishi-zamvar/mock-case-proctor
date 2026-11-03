// E2E launch switches (FND-03). Must run before app.whenReady(): Chromium reads switches at startup.
export type SwitchTarget = {
  setPath(name: 'userData', p: string): void
  commandLine: { appendSwitch(name: string, value?: string): void }
}

export function applyE2ESwitches(
  app: SwitchTarget,
  env: Record<string, string | undefined>
): boolean {
  if (env.E2E !== '1') return false
  if (env.USER_DATA_DIR) app.setPath('userData', env.USER_DATA_DIR)
  app.commandLine.appendSwitch('use-mock-keychain') // no keychain prompts for safeStorage
  app.commandLine.appendSwitch('use-fake-ui-for-media-stream')
  app.commandLine.appendSwitch('use-fake-device-for-media-stream')
  if (env.FAKE_AUDIO_WAV) {
    app.commandLine.appendSwitch('use-file-for-fake-audio-capture', env.FAKE_AUDIO_WAV)
    // Required or the fake samples are all zero (spike-verified). Chromium honours only ONE
    // disable-features switch: later phases must comma-join into this call, not add another.
    app.commandLine.appendSwitch('disable-features', 'AudioServiceSandbox')
  }
  return true
}
