import type { SpeakEvent } from '../../../shared/ipc'

export type SynthData = { visemes: unknown[]; [k: string]: unknown } // HeadTTS msg.data, passed to speakAudio untouched
export type SynthResult = { ok: true; data: SynthData } | { ok: false; error: string }
export type TtsLike = { synthesize(text: string): Promise<SynthResult> }
export type HeadLike = {
  speakAudio(data: SynthData): void
  speakMarker(fn: () => void): void
  stopSpeaking(): void
}
export type SpokenSeq = {
  turnId: string
  seq: number
  visemes: number
  startedAt: number
  endedAt: number | null
}
export type SpeechQueue = {
  enqueue(s: SpeakEvent): void
  cancel(turnId: string): void
  clear(): void // cancel every turn
  isPlaying(): boolean
  stats(): { spoken: SpokenSeq[]; visemeCount: number }
}

type Item = {
  ev: SpeakEvent
  synth: Promise<SynthResult>
  state: 'pending' | 'handed' | 'started' | 'done' | 'dropped'
  dropped: Promise<null>
  drop: () => void
  spoken?: SpokenSeq
}

export function createSpeechQueue(o: {
  tts: TtsLike
  head: HeadLike
  ready: Promise<void> // avatar shown + tts connected
  ack(turnId: string, seq: number, spoken: boolean): void
  onPlaying?(playing: boolean): void // true at the first start marker; false only when the queue fully drains or is cancelled empty
  now?: () => number
}): SpeechQueue {
  const now = o.now ?? (() => performance.now())
  let items: Item[] = []
  const spoken: SpokenSeq[] = []
  let playing = false
  let chain: Promise<void> = Promise.resolve()

  const setPlaying = (p: boolean): void => {
    if (p === playing) return
    playing = p
    o.onPlaying?.(p)
  }
  const live = (i: Item): boolean => i.state === 'handed' || i.state === 'started'

  // The only place acks happen; a second call for the same item is a no-op.
  const finish = (item: Item, ok: boolean): void => {
    if (item.state === 'done' || item.state === 'dropped') return
    item.state = ok ? 'done' : 'dropped'
    item.drop()
    items = items.filter((i) => i !== item)
    o.ack(item.ev.turnId, item.ev.seq, ok)
    if (items.length === 0) setPlaying(false)
  }

  const handOff = async (item: Item): Promise<void> => {
    try {
      await o.ready
    } catch {
      return finish(item, false)
    }
    const r = await Promise.race([item.synth, item.dropped])
    if (r === null || item.state !== 'pending') return
    item.state = 'handed'
    if (!r.ok) {
      // a marker keeps the failed seq's ack in order behind the sentence still playing
      o.head.speakMarker(() => finish(item, false))
      return
    }
    o.head.speakMarker(() => {
      if (item.state !== 'handed') return
      item.state = 'started'
      item.spoken = {
        turnId: item.ev.turnId,
        seq: item.ev.seq,
        visemes: r.data.visemes.length,
        startedAt: now(),
        endedAt: null
      }
      spoken.push(item.spoken)
      setPlaying(true)
    })
    o.head.speakAudio(r.data)
    o.head.speakMarker(() => {
      if (item.state !== 'started') return
      item.spoken!.endedAt = now()
      finish(item, true)
    })
  }

  const cancel = (turnId: string): void => {
    if (items.some((i) => live(i) && i.ev.turnId === turnId)) {
      o.head.stopSpeaking() // clears the head FIFO, so every handed item of any turn is gone
      items.filter(live).forEach((i) => finish(i, false))
    }
    items.filter((i) => i.ev.turnId === turnId).forEach((i) => finish(i, false))
    if (!items.some((i) => i.state === 'started')) setPlaying(false)
  }

  return {
    enqueue(ev) {
      let drop!: () => void
      const dropped = new Promise<null>((res) => (drop = () => res(null)))
      const synth = o.tts
        .synthesize(ev.text)
        .catch((e: unknown): SynthResult => ({ ok: false, error: String(e) }))
      const item: Item = { ev, synth, state: 'pending', dropped, drop }
      items.push(item)
      chain = chain.then(() => handOff(item))
    },
    cancel,
    clear() {
      for (const t of new Set(items.map((i) => i.ev.turnId))) cancel(t)
    },
    isPlaying: () => playing,
    stats: () => ({
      spoken: spoken.map((s) => ({ ...s })),
      visemeCount: spoken.reduce((n, s) => n + s.visemes, 0)
    })
  }
}
