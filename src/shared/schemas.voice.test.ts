import { describe, expect, it } from 'vitest'
import { initialState } from '../main/domain/machine/interviewMachine'
import { SessionFileSchema } from '../main/store/sessionSchema'
import { IntentSchema, StartedArgsSchema, SttChunkArgsSchema, SttStatusSchema } from './schemas'

const ok = (s: { safeParse(v: unknown): { success: boolean } }, v: unknown): boolean =>
  s.safeParse(v).success

describe('Phase 7 IPC schemas', () => {
  it('given answer and bargeIn intents, when parsed, then valid shapes pass and bad ones fail', () => {
    expect(ok(IntentSchema, { type: 'answer', ms: 1, answerId: 'a-1', chunks: 3 })).toBe(true)
    expect(ok(IntentSchema, { type: 'answer', ms: 1 })).toBe(true)
    expect(ok(IntentSchema, { type: 'bargeIn' })).toBe(true)
    expect(ok(IntentSchema, { type: 'answer', ms: 1, answerId: 'bad id!' })).toBe(false)
    expect(ok(IntentSchema, { type: 'answer', ms: 1, answerId: 'a1', chunks: 33 })).toBe(false)
    expect(ok(IntentSchema, { type: 'bargeIn', x: 1 })).toBe(false)
  })

  it('given stt chunk args, when parsed, then only a bounded Float32Array with idx <= 31 passes', () => {
    expect(ok(SttChunkArgsSchema, ['a1', 0, new Float32Array(10)])).toBe(true)
    expect(ok(SttChunkArgsSchema, ['a1', 0, new Float32Array(0)])).toBe(false)
    expect(ok(SttChunkArgsSchema, ['a1', 0, new Float32Array(16000 * 310 + 1)])).toBe(false)
    expect(ok(SttChunkArgsSchema, ['a1', 0, [0.1, 0.2]])).toBe(false)
    expect(ok(SttChunkArgsSchema, ['a1', 32, new Float32Array(10)])).toBe(false)
    expect(ok(SttChunkArgsSchema, ['bad id!', 0, new Float32Array(10)])).toBe(false)
  })

  it('given speak started args, when parsed, then an empty turn id fails', () => {
    expect(ok(StartedArgsSchema, ['t1', 0])).toBe(true)
    expect(ok(StartedArgsSchema, ['', 0])).toBe(false)
  })

  it('given stt status values, when parsed, then only the four modes pass', () => {
    for (const s of ['metal', 'cpu', 'failed', 'off']) expect(ok(SttStatusSchema, s)).toBe(true)
    expect(ok(SttStatusSchema, 'gpu')).toBe(false)
  })
})

describe('SessionFileSchema timings latency', () => {
  const file = (entry: Record<string, unknown>): unknown => ({
    schemaVersion: 1,
    id: 's1',
    caseId: '99',
    startedAt: 1,
    status: 'active',
    warmup: false,
    machineState: initialState(),
    transcript: [],
    controlLog: [],
    timings: [{ turnId: 't1', kind: 'grill', startedAt: 1, doneAt: 2, ...entry }],
    pending: null
  })

  it('given latency stamps and interrupted, when parsed, then it passes', () => {
    expect(
      ok(
        SessionFileSchema,
        file({ latency: { stopAt: 1, transcriptAt: 2, requestAt: 3 }, interrupted: true })
      )
    ).toBe(true)
    expect(
      ok(
        SessionFileSchema,
        file({
          latency: {
            stopAt: 1,
            transcriptAt: 2,
            requestAt: 3,
            firstDeltaAt: 4,
            firstSentenceAt: 5,
            firstAudioAt: 6
          }
        })
      )
    ).toBe(true)
  })

  it('given an unknown latency key, when parsed, then it fails (strict)', () => {
    expect(
      ok(SessionFileSchema, file({ latency: { stopAt: 1, transcriptAt: 2, requestAt: 3, x: 1 } }))
    ).toBe(false)
  })
})
