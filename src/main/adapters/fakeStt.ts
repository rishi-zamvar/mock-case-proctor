// Fake STT (QA-02): injected text first (E2E), else canned answers by call index. PCM is ignored.
import type { SttPort } from '../ports'

export type FakeStt = SttPort & { inject(text: string): void }

const DEFAULT_CANNED = [
  'My call is to invest at this price, but I want to understand retention first.',
  'Gross retention looks solid, and net retention is driven by seat expansion.',
  'I would diligence the cohort data and the top customer concentration.'
]

export function createFakeStt(canned: string[] = DEFAULT_CANNED): FakeStt {
  const queue: string[] = []
  let i = 0
  return {
    inject: (text) => void queue.push(text),
    async transcribe() {
      const n = i++ // injected calls advance the index too
      return { text: queue.shift() ?? canned[n % canned.length] ?? '' }
    }
  }
}
