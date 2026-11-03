// VOUT-05: after a barge-in Claude's history keeps only what was spoken, alternating and truthful.
// Real SDK parser via sse.harness; no live calls.
import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import { describe, expect, it, vi } from 'vitest'
import type { InterviewerBrief } from '../domain/cases/brief'
import { loadCase } from '../domain/cases/library'
import type { Logger } from '../log'
import type { HistoryTurn, LlmChunk, LlmPort, TurnRequest } from '../ports'
import { FIXTURE_ROOT, deck } from '../session/runner.harness'
import { createClaudeLlm } from './claudeLlm'
import { checkConversation } from './messages'
import { sseEvents, sseFetch } from './sse.harness'

const brief: InterviewerBrief = loadCase(FIXTURE_ROOT, '99', deck).brief
const control = {
  section_id: 'retention',
  status: 'probing',
  probe_failed: false,
  hint_given: false,
  flags_surfaced: [],
  evidence: 'x',
  numbers_checked: [],
  next_section: null,
  pushback_done: false
}

type Setup = { llm: LlmPort; requests: Record<string, unknown>[]; logs: () => string }
function setup(responses: string[][], delayMs?: number): Setup {
  const stub = sseFetch(responses, { delayMs })
  const client = new Anthropic({
    apiKey: 'test',
    baseURL: 'http://replay.test',
    fetch: stub.fetch,
    maxRetries: 0
  })
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const llm = createClaudeLlm({ client, model: 'claude-test-model', log: log as Logger })(brief)
  const logs = (): string =>
    JSON.stringify([...log.info.mock.calls, ...log.warn.mock.calls, ...log.error.mock.calls])
  return { llm, requests: stub.requests, logs }
}

async function collect(
  it: AsyncIterable<LlmChunk>,
  onChunk?: (c: LlmChunk) => void
): Promise<LlmChunk[]> {
  const out: LlmChunk[] = []
  for await (const c of it) {
    out.push(c)
    onChunk?.(c)
  }
  return out
}

const live = (): AbortSignal => new AbortController().signal
const cand = (text: string): HistoryTurn => ({ speaker: 'candidate', text, phase: 'grilling' })
const grill = (history: HistoryTurn[]): TurnRequest => ({
  kind: 'grill',
  section: 'retention',
  turnInSection: 0,
  history
})
const msgsOf = (r: Record<string, unknown>): MessageParam[] => r.messages as MessageParam[]
const blocks = (m: MessageParam): { type: string; [k: string]: unknown }[] =>
  m.content as unknown as { type: string; [k: string]: unknown }[]

/** Runs a turn, aborting after the first text delta. */
async function abortAfterFirstText(it: (s: AbortSignal) => AsyncIterable<LlmChunk>): Promise<void> {
  const ac = new AbortController()
  await collect(it(ac.signal), (c) => {
    if (c.type === 'text') ac.abort()
  })
}

describe('claudeLlm.interrupted (barge-in history)', () => {
  it('given grill turn B aborted mid-stream, when interrupted(spoken), then the next request holds userB + spoken [interrupted] and no orphan tool_result', async () => {
    const { llm, requests, logs } = setup(
      [
        sseEvents({ text: ['REPLY_A '], control, toolUseId: 'toolu_A' }),
        sseEvents({
          text: ['First sentence. ', 'UNSPOKEN_SECRET rest.'],
          control,
          toolUseId: 'toolu_B'
        }),
        sseEvents({ text: ['Ok.'], control, toolUseId: 'toolu_C' })
      ],
      20
    )
    await collect(llm.streamTurn(grill([cand('ANSWER_A')]), live()))
    await abortAfterFirstText((s) => llm.streamTurn(grill([cand('ANSWER_B_SECRET')]), s))
    llm.interrupted?.('First sentence.')
    await collect(llm.streamTurn(grill([cand('ANSWER_C')]), live()))
    const msgs = msgsOf(requests[2])
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user'])
    expect(blocks(msgs[1]).some((b) => b.type === 'tool_use' && b.id === 'toolu_A')).toBe(true)
    expect(
      blocks(msgs[2]).some((b) => b.type === 'tool_result' && b.tool_use_id === 'toolu_A')
    ).toBe(true)
    expect(JSON.stringify(msgs[2])).toContain('ANSWER_B_SECRET')
    expect(msgs[3]).toEqual({
      role: 'assistant',
      content: [{ type: 'text', text: 'First sentence. [interrupted]' }]
    })
    expect(blocks(msgs[4]).some((b) => b.type === 'tool_result')).toBe(false)
    expect(JSON.stringify(msgs)).not.toContain('UNSPOKEN_SECRET')
    expect(checkConversation(msgs)).toEqual([])
    for (const s of ['ANSWER_B_SECRET', 'First sentence', 'REPLY_A'])
      expect(logs()).not.toContain(s)
  })

  it('given grill turn B completed before TTS finished, when interrupted(spoken), then the last assistant is replaced text-only (no toolu_B, no tool_result)', async () => {
    const { llm, requests } = setup([
      sseEvents({ text: ['REPLY_A '], control, toolUseId: 'toolu_A' }),
      sseEvents({
        text: ['First sentence. ', 'UNSPOKEN_SECRET rest.'],
        control,
        toolUseId: 'toolu_B'
      }),
      sseEvents({ text: ['Ok.'], control })
    ])
    await collect(llm.streamTurn(grill([cand('ANSWER_A')]), live()))
    await collect(llm.streamTurn(grill([cand('ANSWER_B')]), live()))
    llm.interrupted?.('First sentence.')
    await collect(llm.streamTurn(grill([cand('ANSWER_C')]), live()))
    const msgs = msgsOf(requests[2])
    expect(msgs).toHaveLength(5)
    expect(msgs[3]).toEqual({
      role: 'assistant',
      content: [{ type: 'text', text: 'First sentence. [interrupted]' }]
    })
    expect(JSON.stringify(msgs)).not.toContain('toolu_B')
    expect(JSON.stringify(msgs)).not.toContain('UNSPOKEN_SECRET')
    expect(blocks(msgs[4]).some((b) => b.type === 'tool_result')).toBe(false)
    expect(checkConversation(msgs)).toEqual([])
  })

  it('given nothing was spoken, when interrupted(""), then the assistant text is non-empty and valid', async () => {
    const { llm, requests } = setup(
      [sseEvents({ text: ['A ', 'B'], control }), sseEvents({ text: ['Ok.'], control })],
      20
    )
    await abortAfterFirstText((s) => llm.streamTurn(grill([cand('ANSWER_A')]), s))
    llm.interrupted?.('  ')
    await collect(llm.streamTurn(grill([cand('ANSWER_B')]), live()))
    const msgs = msgsOf(requests[1])
    expect(msgs[1]).toEqual({
      role: 'assistant',
      content: [{ type: 'text', text: '… [interrupted]' }]
    })
    expect(checkConversation(msgs)).toEqual([])
  })

  it('given warm-up turn 2 aborted mid-stream, when interrupted, then the next warm-up request alternates with the spoken text', async () => {
    const { llm, requests } = setup(
      [
        sseEvents({ text: ['How was your week?'] }),
        sseEvents({ text: ['Nice. ', 'UNSPOKEN_SECRET more'] }),
        sseEvents({ text: ['Ok.'] })
      ],
      20
    )
    await collect(llm.warmupTurn({ history: [] }, live()))
    await abortAfterFirstText((s) =>
      llm.warmupTurn({ history: [{ speaker: 'candidate', text: 'WARM_B' }] }, s)
    )
    llm.interrupted?.('Nice.')
    await collect(llm.warmupTurn({ history: [{ speaker: 'candidate', text: 'WARM_C' }] }, live()))
    const msgs = msgsOf(requests[2])
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user'])
    expect(JSON.stringify(msgs[2])).toContain('WARM_B')
    expect(msgs[3]).toEqual({
      role: 'assistant',
      content: [{ type: 'text', text: 'Nice. [interrupted]' }]
    })
    expect(checkConversation(msgs)).toEqual([])
  })

  it('given interrupted() with no turn since the last call, then it is a no-op (twice changes nothing)', async () => {
    const { llm, requests } = setup([
      sseEvents({ text: ['A.'], control }),
      sseEvents({ text: ['Ok.'], control })
    ])
    llm.interrupted?.('nothing yet')
    await collect(llm.streamTurn(grill([cand('ANSWER_A')]), live()))
    llm.interrupted?.('A.')
    llm.interrupted?.('second call')
    await collect(llm.streamTurn(grill([cand('ANSWER_B')]), live()))
    const msgs = msgsOf(requests[1])
    expect(requests[0].messages).toHaveLength(1)
    expect(msgs).toHaveLength(3)
    expect(JSON.stringify(msgs)).not.toContain('second call')
    expect(JSON.stringify(msgs)).not.toContain('nothing yet')
    expect(checkConversation(msgs)).toEqual([])
  })

  it('given interrupted() called while the aborted generator is still running, then the turn is not also remembered (no duplicate)', async () => {
    const { llm, requests } = setup(
      [sseEvents({ text: ['Said. ', 'More.'], control }), sseEvents({ text: ['Ok.'], control })],
      20
    )
    const ac = new AbortController()
    await collect(llm.streamTurn(grill([cand('ANSWER_A')]), ac.signal), (c) => {
      if (c.type === 'text' && !ac.signal.aborted) {
        ac.abort()
        llm.interrupted?.('Said.')
      }
    })
    await collect(llm.streamTurn(grill([cand('ANSWER_B')]), live()))
    const msgs = msgsOf(requests[1])
    expect(msgs).toHaveLength(3)
    expect(checkConversation(msgs)).toEqual([])
  })
})
