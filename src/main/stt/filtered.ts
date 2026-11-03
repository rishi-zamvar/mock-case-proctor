// Wraps any SttPort with the voiced gate (before) and the cleaner (after). Never logs transcript text.
import type { Logger } from '../log'
import type { SttPort } from '../ports'
import { cleanTranscript } from './clean'
import { MIN_VOICED_MS, voicedMs } from './gate'

export function filteredStt(
  inner: SttPort,
  o: { log?: Pick<Logger, 'info'>; minVoicedMs?: number; rms?: number } = {}
): SttPort {
  const min = o.minVoicedMs ?? MIN_VOICED_MS
  return {
    async transcribe(pcm, opts) {
      const v = voicedMs(pcm, o.rms)
      o.log?.info('stt voiced', v)
      if (v < min) return { text: '', noAnswer: true, voicedMs: v }
      const text = cleanTranscript((await inner.transcribe(pcm, opts)).text)
      return { text, noAnswer: text === '', voicedMs: v }
    }
  }
}
