import type { SpeakEvent } from '../../../shared/ipc'

// Phase 3 placeholder for the Phase 5 HeadTTS/TalkingHead queue: same enqueue/clear shape, no audio.
export function createFakeSpeechQueue(o: {
  ack(turnId: string, seq: number): void
  msPerWord?: number
  setTimeout?: typeof setTimeout
}): { enqueue(s: SpeakEvent): void; clear(): void } {
  const msPerWord = o.msPerWord ?? 60
  const schedule = o.setTimeout ?? setTimeout
  const queue: SpeakEvent[] = []
  let timer: ReturnType<typeof setTimeout> | null = null

  const pump = (): void => {
    const head = queue.shift()
    if (!head) return
    const words = head.text.trim().split(/\s+/).filter(Boolean).length
    timer = schedule(() => {
      timer = null
      o.ack(head.turnId, head.seq)
      pump()
    }, words * msPerWord)
  }

  return {
    enqueue(s) {
      queue.push(s)
      if (timer === null) pump()
    },
    clear() {
      queue.length = 0
      if (timer !== null) clearTimeout(timer)
      timer = null
    }
  }
}
