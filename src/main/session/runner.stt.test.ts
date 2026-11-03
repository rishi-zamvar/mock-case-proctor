import { describe, expect, it, vi } from 'vitest'
import { createFakeLlm } from '../adapters/fakeLlm'
import { speakable } from '../domain/text/speakable'
import type { MakeLlm, SttPort, SttResult } from '../ports'
import { NO_ANSWER_LINE, STT_FAILED_LINE } from './runner'
import { setup } from './runner.harness'

type Impl = (pcm: Float32Array, o?: { prompt?: string }) => Promise<SttResult>

/** Programmable STT: swap the behaviour between calls. */
function progStt(first: Impl = async () => ({ text: 'Plain answer from whisper.' })): {
  stt: SttPort
  set(f: Impl): void
} {
  let impl = first
  return { stt: { transcribe: (pcm, o) => impl(pcm, o) }, set: (f) => void (impl = f) }
}

function deferred<T>(): { promise: Promise<T>; resolve(v: T): void } {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

function spyLlm(): {
  makeLlm: MakeLlm
  stream: ReturnType<typeof vi.fn>
  warm: ReturnType<typeof vi.fn>
} {
  const stream = vi.fn()
  const warm = vi.fn()
  const makeLlm: MakeLlm = (brief) => {
    const base = createFakeLlm({ chunkDelayMs: 0 })(brief)
    return {
      ...base,
      streamTurn: (req, signal) => {
        stream()
        return base.streamTurn(req, signal)
      },
      warmupTurn: (req, signal) => {
        warm()
        return base.warmupTurn(req, signal)
      }
    }
  }
  return { makeLlm, stream, warm }
}

const pcm = (): Float32Array => new Float32Array(160).fill(0.1)

async function toPresentation(t: ReturnType<typeof setup>): Promise<string> {
  const { sessionId } = await t.runner.start('99', { warmup: false })
  await t.runner.intent({ type: 'ready' })
  return sessionId
}

describe('SessionRunner real answer flow', () => {
  it('given chunks in presentation, when answered, then whisper gets the pcm and the case prompt and the line is the stt text', async () => {
    const s = progStt(async () => ({ text: 'I would invest at this price.' }))
    const t = setup({ stt: s.stt })
    await toPresentation(t)
    const a = pcm()
    t.runner.sttChunk('a1', 0, a)
    await t.runner.intent({ type: 'answer', ms: 30_000, answerId: 'a1', chunks: 1 })
    expect(t.transcribe).toHaveBeenCalledTimes(1)
    expect(t.transcribe.mock.calls[0][0]).toBe(a)
    expect(t.transcribe.mock.calls[0][1]?.prompt).toContain('Fixturely')
    const line = t.view().transcript.find((l) => l.speaker === 'candidate')
    expect(line?.text).toBe('I would invest at this price.')
    await t.until(() => t.view().phase === 'grilling')
  })

  it('given a slow stt, when answered, then transcribing is true until it resolves', async () => {
    const d = deferred<SttResult>()
    const s = progStt(() => d.promise)
    const t = setup({ stt: s.stt })
    await toPresentation(t)
    t.runner.sttChunk('a1', 0, pcm())
    const p = t.runner.intent({ type: 'answer', ms: 30_000, answerId: 'a1', chunks: 1 })
    await t.until(() => t.view().transcribing === true)
    expect(t.view().canTalk).toBe(false)
    d.resolve({ text: 'Done now.' })
    await p
    expect(t.view().transcribing).toBe(false)
  })

  it('given a no-answer result in grilling, when answered, then a re-prompt is spoken with no LLM call and no line', async () => {
    const s = progStt()
    const l = spyLlm()
    const t = setup({ stt: s.stt, makeLlm: l.makeLlm })
    await t.toGrilling()
    await t.idle()
    const lines = t.view().transcript.length
    const speaks = t.speaks.length
    const calls = l.stream.mock.calls.length + l.warm.mock.calls.length
    s.set(async () => ({ text: '', noAnswer: true }))
    t.runner.sttChunk('a2', 0, pcm())
    await t.runner.intent({ type: 'answer', ms: 5000, answerId: 'a2', chunks: 1 })
    expect(t.speaks.slice(speaks).map((e) => e.text)).toEqual([speakable(NO_ANSWER_LINE)])
    expect(t.view().transcript).toHaveLength(lines)
    expect(l.stream.mock.calls.length + l.warm.mock.calls.length).toBe(calls)
    expect(t.view().phase).toBe('grilling')
    expect(t.view().canTalk).toBe(true)
  })

  it('given stt rejects, when answered, then the failure line is spoken and only the error name is logged', async () => {
    const s = progStt(async () => {
      throw new TypeError('secret transcript words')
    })
    const t = setup({ stt: s.stt })
    await toPresentation(t)
    t.runner.sttChunk('a1', 0, pcm())
    await t.runner.intent({ type: 'answer', ms: 30_000, answerId: 'a1', chunks: 1 })
    expect(t.speaks.map((e) => e.text)).toEqual([speakable(STT_FAILED_LINE)])
    expect(t.view().transcript).toHaveLength(0)
    expect(t.view().transcribing).toBe(false)
    expect(t.view().phase).toBe('presentation')
    expect(t.log.warn).toHaveBeenCalledWith('stt failed', 'TypeError')
    expect(JSON.stringify(t.log.warn.mock.calls)).not.toContain('secret')
  })

  it('given the FakeStt path, when answered without answerId, then blank text speaks the re-prompt and appends nothing', async () => {
    const t = setup()
    await toPresentation(t)
    t.stt.inject('   ')
    await t.runner.intent({ type: 'answer', ms: 1000 })
    expect(t.view().transcript).toHaveLength(0)
    expect(t.speaks.map((e) => e.text)).toEqual([speakable(NO_ANSWER_LINE)])
  })
})

describe('SessionRunner latency stamps', () => {
  const counter = (): (() => number) => {
    let n = 0
    return () => (n += 10)
  }

  it('given real-clock stamps, when answers lead to interviewer turns, then latency is monotonic and the opening has none', async () => {
    const t = setup({ realNow: counter(), autoStart: true })
    const id = await t.toGrilling(true)
    await t.idle()
    await t.answer()
    const timings = t.file(id).timings
    expect(timings[0].kind).toBe('warmup')
    expect(timings[0].latency).toBeUndefined()
    const grills = timings.filter((x) => x.kind === 'grill')
    expect(grills.length).toBeGreaterThanOrEqual(2)
    for (const g of grills.slice(0, 2)) {
      const l = g.latency
      expect(l).toBeDefined()
      if (!l) return
      const seq = [
        l.stopAt,
        l.transcriptAt,
        l.requestAt,
        l.firstDeltaAt,
        l.firstSentenceAt,
        l.firstAudioAt
      ]
      expect(seq.every((v) => typeof v === 'number')).toBe(true)
      const nums = seq as number[]
      for (let i = 1; i < nums.length; i++) expect(nums[i]).toBeGreaterThanOrEqual(nums[i - 1])
    }
    const lat = t.log.info.mock.calls.filter((c) => c[0] === 'latency')
    expect(lat.length).toBeGreaterThanOrEqual(2)
    for (const c of lat) {
      expect(c).toHaveLength(4)
      expect(typeof c[1]).toBe('string')
      expect(typeof c[2]).toBe('number')
      expect(typeof c[3]).toBe('number')
    }
  })

  it('given started for an unknown turn or a repeat, then firstAudioAt keeps the first stamp', async () => {
    const realNow = vi.fn(counter())
    const t = setup({ realNow })
    const id = await t.toGrilling()
    await t.idle()
    t.h.autoAck = false
    const before = t.speaks.length
    await t.runner.intent({ type: 'answer', ms: 30_000 })
    await t.until(() => t.speaks.length > before)
    const turnId = t.speaks[before].turnId
    t.runner.started('nope', 0)
    t.runner.started(turnId, 0)
    const stamp = realNow.mock.results.at(-1)?.value as number
    t.runner.started(turnId, 1)
    t.runner.started(turnId, 0)
    for (const e of t.speaks.slice(before)) t.runner.ack(e.turnId, e.seq)
    await t.until(() => t.file(id).timings.some((x) => x.turnId === turnId))
    const entry = t.file(id).timings.find((x) => x.turnId === turnId)
    expect(entry?.latency?.firstAudioAt).toBe(stamp)
  })
})

describe('SessionRunner sttChunk', () => {
  it('given no session, when a chunk arrives, then it is ignored', () => {
    const s = progStt()
    const t = setup({ stt: s.stt })
    t.runner.sttChunk('a1', 0, pcm())
    expect(t.transcribe).not.toHaveBeenCalled()
  })

  it('given a chunk from an old session, when a new session starts, then it does not leak', async () => {
    const s = progStt(async () => ({ text: 'Old session words.' }))
    const t = setup({ stt: s.stt })
    await toPresentation(t)
    t.runner.sttChunk('a1', 0, pcm())
    await toPresentation(t)
    s.set(async () => ({ text: 'New session words.' }))
    const p = t.runner.intent({ type: 'answer', ms: 30_000, answerId: 'a1', chunks: 1 })
    await t.until(() => t.view().transcribing === true)
    t.runner.sttChunk('a1', 0, pcm())
    await p
    expect(t.view().transcript.map((l) => l.text)).toEqual(['New session words.'])
  })
})
