// safeStorage adapter for KeyStore. Async API only: the sync one is deprecated in Electron 45.
import type { SafeStorage } from 'electron'
import type { Cipher } from './keyStore'

export function createSafeStorageCipher(ss: SafeStorage): Cipher {
  return {
    available: async () => Boolean(await ss.isAsyncEncryptionAvailable()),
    encrypt: (s) => ss.encryptStringAsync(s),
    decrypt: async (b) => {
      const r = await ss.decryptStringAsync(b)
      return { value: r.result, shouldReEncrypt: r.shouldReEncrypt }
    }
  }
}
