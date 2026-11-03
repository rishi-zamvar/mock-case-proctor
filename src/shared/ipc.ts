// IPC contract shared by main, preload and renderer.
// NO runtime imports: the sandboxed preload bundles this file.
export const CH = { keyStatus: 'key:status', keySave: 'key:save', keyClear: 'key:clear' } as const
export type KeySource = 'stored' | 'env' | 'dotenv' | 'none'
export type KeyStatus = { hasKey: boolean; source: KeySource }
export type ProbeResult = 'valid' | 'invalid' | 'unverified'
export type SaveOutcome = ProbeResult | 'unavailable' | 'empty'
export type SaveResult = { status: KeyStatus; result: SaveOutcome }
export type SaveOptions = { force?: boolean }
export interface Api {
  key: {
    status(): Promise<KeyStatus>
    save(key: string, opts?: SaveOptions): Promise<SaveResult>
    clear(): Promise<KeyStatus>
  }
}
export interface E2EHooks {
  micPeak(ms: number): Promise<number>
}
