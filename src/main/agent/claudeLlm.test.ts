import Anthropic from '@anthropic-ai/sdk'
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages'
import { describe, expect, it, vi } from 'vitest'
import type { InterviewerBrief } from '../domain/cases/brief'
import { loadCase } from '../domain/cases/library'
import type { Logger } from '../log'
import type { HistoryTurn, LlmChunk, LlmPort, TurnRequest } from '../ports'
import { FIXTURE_ROOT, deck } from '../session/runner.harness'
import { createClaudeLlm, DEFAULT_INTERVIEWER_MODEL, INTERVIEWER_MAX_TOKENS } from './claudeLlm'
import { checkConversation } from './messages'
import { FALLBACK_LINE } from './turnText'
import { jsonMessage, sseEvents, sseFetch } from './sse.harness'
import { buildWarmupSystem, warmupNote } from './prompt'
import { ScorecardSchema } from '../../shared/schemas'
import type { OpeningPlan } from '../ports'

const brief: InterviewerBrief = loadCase(FIXTURE_ROOT, '99', deck).brief
const flagId = brief.flags.map[0].id
const OPENING = 'OPENING_SECRET I recommend invest because retention is strong'
const ANSWER = 'ANSWER_SECRET gross retention is ninety percent'
const REPLY = 'REPLY_SECRET how did you get that number?'

const control = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  section_id: 'retention',
  status: 'probing',
  probe_failed: false,
  hint_given: false,
  flags_surfaced: [{ flag_id: flagId, by: 'candidate' }],
  evidence: 'retention is strong',
  numbers_checked: [],
  next_section: null,
  pushback_done: false,
  ...over
})

type MockLog = Logger & {
  info: ReturnType<typeof vi.fn>
  warn: ReturnType<typeof vi.fn>
  error: ReturnType<typeof vi.fn>
  all: () => unknown[]
}
const mockLog = (): MockLog => {
  const l = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  return {
    ...l,
    all: () => [...l.info.mock.calls, ...l.warn.mock.calls, ...l.error.mock.calls].flat()
  }
}

function setup(
  responses: string[][],
  opts: { delayMs?: number } = {}
): {
  make: (b?: InterviewerBrief) => LlmPort
  requests: Record<string, unknown>[]
  log: MockLog
} {
  const stub = sseFetch(responses, opts)
  const client = new Anthropic({
    apiKey: 'test',
    baseURL: 'http://replay.test',
    fetch: stub.fetch,
    maxRetries: 0
  })
  const log = mockLog()
  const mk = createClaudeLlm({ client, model: 'claude-test-model', log })
  return { make: (b = brief) => mk(b), requests: stub.requests, log }
}

const grill = (history: HistoryTurn[], over: Partial<TurnRequest> = {}): TurnRequest => ({
  kind: 'grill',
  section: 'retention',
  turnInSection: 0,
  history,
  ...over
})

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

const h1: HistoryTurn[] = [{ speaker: 'candidate', text: OPENING, phase: 'presentation' }]
const h2: HistoryTurn[] = [
  ...h1,
  { speaker: 'interviewer', text: REPLY, phase: 'grilling' },
  { speaker: 'candidate', text: ANSWER, phase: 'grilling' }
]
const msgsOf = (r: Record<string, unknown>): MessageParam[] => r.messages as MessageParam[]
const blocks = (m: MessageParam): { type: string; [k: string]: unknown }[] =>
  m.content as unknown as { type: string; [k: string]: unknown }[]

describe('createClaudeLlm streamTurn', () => {
  it('exports the config constants', () => {
    expect(INTERVIEWER_MAX_TOKENS).toBe(1024)
    expect(DEFAULT_INTERVIEWER_MODEL).toBe('claude-opus-5-5')
  })

  it('given a grill turn, when streamed, then text deltas in order, one control, done with usage', async () => {
    const { make } = setup([
      sseEvents({
        text: ['REPLY_SECRET how ', 'did you get ', 'that number?'],
        control: control(),
        usage: {
          cache_read_input_tokens: 900,
          cache_creation_input_tokens: 5,
          output_tokens: 77,
          input_tokens: 12
        }
      })
    ])
    const chunks = await collect(make().streamTurn(grill(h1), new AbortController().signal))
    expect(
      chunks.filter((c) => c.type === 'text').map((c) => (c as { delta: string }).delta)
    ).toEqual(['REPLY_SECRET how ', 'did you get ', 'that number?'])
    const ctl = chunks.filter((c) => c.type === 'control')
    expect(ctl).toHaveLength(1)
    expect(ctl[0]).toMatchObject({
      payload: { section: 'retention', section_status: 'continue', flags_surfaced: [flagId] }
    })
    expect(chunks[chunks.length - 1]).toEqual({
      type: 'done',
      usage: {
        inputTokens: 12,
        outputTokens: 77,
        cacheRead: 900,
        cacheWrite: 5,
        stopReason: 'tool_use'
      }
    })
    expect(chunks.findIndex((c) => c.type === 'control')).toBeGreaterThan(
      chunks.findLastIndex((c) => c.type === 'text')
    )
  })

  it('given a grill turn, then the request is the cache-stable record-only shape', async () => {
    const { make, requests } = setup([sseEvents({ text: ['Hi.'], control: control() })])
    await collect(make().streamTurn(grill(h1), new AbortController().signal))
    const r = requests[0]
    expect(r.model).toBe('claude-test-model')
    expect(r.max_tokens).toBe(1024)
    expect(r.output_config).toEqual({ effort: 'low' })
    expect('thinking' in r).toBe(false)
    expect(r.tool_choice).toEqual({ type: 'auto' })
    expect(r.cache_control).toEqual({ type: 'ephemeral' })
    expect(r.stream).toBe(true)
    const system = r.system as { cache_control?: unknown }[]
    expect(system[system.length - 1].cache_control).toEqual({ type: 'ephemeral' })
    const tools = r.tools as { name: string; strict: boolean }[]
    expect(tools[0].name).toBe('interview_control')
    expect(tools[0].strict).toBe(true)
    const msgs = msgsOf(r)
    expect(msgs).toHaveLength(1)
    expect(JSON.stringify(msgs[0])).toContain('<candidate_said>OPENING_SECRET')
  })

  it('given two turns, then system+tools are byte-identical and history threads tool_result first', async () => {
    const { make, requests } = setup([
      sseEvents({ text: [REPLY], control: control(), toolUseId: 'toolu_T1' }),
      sseEvents({ text: ['Next?'], control: control() })
    ])
    const llm = make()
    await collect(llm.streamTurn(grill(h1), new AbortController().signal))
    await collect(llm.streamTurn(grill(h2, { turnInSection: 1 }), new AbortController().signal))
    const [a, b] = requests
    expect(JSON.stringify(b.system)).toBe(JSON.stringify(a.system))
    expect(JSON.stringify(b.tools)).toBe(JSON.stringify(a.tools))
    const msgs = msgsOf(b)
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(blocks(msgs[1]).map((x) => x.type)).toEqual(['thinking', 'text', 'tool_use'])
    expect(blocks(msgs[2])[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_T1' })
    const u2 = JSON.stringify(msgs[2])
    expect(u2).toContain('<proctor>')
    expect(u2).toContain('<candidate_said>ANSWER_SECRET')
    expect(checkConversation(msgs)).toEqual([])
  })

  it('given a turn with no tool_use, then no control chunk, warn "control missing", next turn has no tool_result', async () => {
    const { make, requests, log } = setup([
      sseEvents({ text: [REPLY], control: null }),
      sseEvents({ text: ['Next?'], control: control() })
    ])
    const llm = make()
    const chunks = await collect(llm.streamTurn(grill(h1), new AbortController().signal))
    expect(chunks.some((c) => c.type === 'control')).toBe(false)
    expect(log.warn.mock.calls.flat().join(' ')).toContain('control missing')
    await collect(llm.streamTurn(grill(h2, { turnInSection: 1 }), new AbortController().signal))
    const msgs = msgsOf(requests[1])
    expect(JSON.stringify(msgs)).not.toContain('tool_result')
    expect(checkConversation(msgs)).toEqual([])
  })

  it('given a turn with zero text, then FALLBACK_LINE is yielded once before done', async () => {
    const { make } = setup([sseEvents({ text: [], control: control() })])
    const chunks = await collect(make().streamTurn(grill(h1), new AbortController().signal))
    const texts = chunks.filter((c) => c.type === 'text')
    expect(texts).toEqual([{ type: 'text', delta: FALLBACK_LINE }])
    expect(chunks.findIndex((c) => c.type === 'text')).toBeLessThan(
      chunks.findIndex((c) => c.type === 'done')
    )
  })

  it('given abort after the first text chunk, then the generator ends quietly and forgets the turn', async () => {
    const { make, requests } = setup(
      [
        sseEvents({ text: ['ABORTED_SECRET one ', 'two ', 'three'], control: control() }),
        sseEvents({ text: ['Again?'], control: control() })
      ],
      { delayMs: 30 }
    )
    const llm = make()
    const ac = new AbortController()
    const chunks = await collect(llm.streamTurn(grill(h1), ac.signal), (c) => {
      if (c.type === 'text') ac.abort()
    })
    expect(chunks.filter((c) => c.type === 'text').length).toBeGreaterThanOrEqual(1)
    expect(chunks.some((c) => c.type === 'control' || c.type === 'done')).toBe(false)
    await collect(llm.streamTurn(grill(h1), new AbortController().signal))
    const msgs = msgsOf(requests[1])
    expect(checkConversation(msgs)).toEqual([])
    expect(msgs).toHaveLength(1)
    expect(JSON.stringify(msgs)).not.toContain('ABORTED_SECRET')
  })

  it('given stop_reason max_tokens, then it is logged as an anomaly code', async () => {
    const { make, log } = setup([
      sseEvents({ text: ['Hi.'], control: null, stopReason: 'max_tokens' })
    ])
    await collect(make().streamTurn(grill(h1), new AbortController().signal))
    expect(log.warn.mock.calls.flat().join(' ')).toContain('max_tokens')
  })

  it('given resume (empty closure, grilling history), then messages are seeded text-only and valid', async () => {
    const { make, requests } = setup([sseEvents({ text: ['Ok.'], control: control() })])
    await collect(make().streamTurn(grill(h2, { turnInSection: 1 }), new AbortController().signal))
    const msgs = msgsOf(requests[0])
    expect(checkConversation(msgs)).toEqual([])
    expect(JSON.stringify(msgs)).toContain('REPLY_SECRET')
    expect(JSON.stringify(msgs[msgs.length - 1])).toContain('ANSWER_SECRET')
  })

  it('never logs candidate, proctor or reply text', async () => {
    const { make, log } = setup([
      sseEvents({ text: [REPLY], control: null, stopReason: 'max_tokens' }),
      sseEvents({ text: [], control: { bad: true } })
    ])
    const llm = make()
    await collect(llm.streamTurn(grill(h1), new AbortController().signal))
    await collect(llm.streamTurn(grill(h2, { turnInSection: 1 }), new AbortController().signal))
    const s = JSON.stringify(log.all())
    for (const secret of ['OPENING_SECRET', 'ANSWER_SECRET', 'REPLY_SECRET', '<proctor>', 'phase='])
      expect(s).not.toContain(secret)
  })
})

const live = (): AbortSignal => new AbortController().signal

describe('createClaudeLlm warmupTurn', () => {
  it('given empty history, then a case-free warm-up request with no tools and text then done', async () => {
    const { make, requests } = setup([sseEvents({ text: ['Hi, ', 'how was your week?'] })])
    const chunks = await collect(make().warmupTurn({ history: [] }, live()))
    const r = requests[0]
    expect(r.system).toBe(buildWarmupSystem())
    expect('tools' in r).toBe(false)
    expect('thinking' in r).toBe(false)
    expect(r.output_config).toEqual({ effort: 'low' })
    const msgs = msgsOf(r)
    expect(msgs).toHaveLength(1)
    expect(JSON.stringify(msgs[0])).toContain(JSON.stringify(warmupNote(0)).slice(1, -1))
    const raw = JSON.stringify(r)
    expect(raw).not.toContain(brief.company.name)
    expect(raw).not.toContain('<evaluation_key>')
    expect(chunks.map((c) => c.type)).toEqual(['text', 'text', 'done'])
    expect(chunks.some((c) => c.type === 'done' && c.warmupComplete)).toBe(false)
  })

  it('given a second warm-up turn, then it carries the first exchange and the wrapped reply', async () => {
    const { make, requests } = setup([
      sseEvents({ text: ['How was your week?'] }),
      sseEvents({ text: ['Nice. Why growth?'] })
    ])
    const llm = make()
    await collect(llm.warmupTurn({ history: [] }, live()))
    await collect(
      llm.warmupTurn(
        {
          history: [
            { speaker: 'interviewer', text: 'How was your week?' },
            { speaker: 'candidate', text: 'WARM_SECRET pretty good' }
          ]
        },
        live()
      )
    )
    const msgs = msgsOf(requests[1])
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(JSON.stringify(msgs[2])).toContain('<candidate_said>WARM_SECRET pretty good')
    expect(JSON.stringify(msgs[2])).toContain(JSON.stringify(warmupNote(1)).slice(1, -1))
    expect(checkConversation(msgs)).toEqual([])
  })
})

describe('createClaudeLlm extractPlan', () => {
  const plan: OpeningPlan = {
    recap: 'Invest at a lower price',
    recommendation: 'invest_at_price',
    price: '8x ARR',
    considerations: [
      { label: 'industry tailwind', section_id: 'industry', stance: 'for' },
      { label: 'sticky product', section_id: 'business', stance: 'for' },
      { label: 'churn risk', section_id: 'retention', stance: 'against' }
    ],
    order: ['business', 'valuation', 'industry', 'retention']
  }

  it('given a valid structured response, then order comes from considerations and the plan is returned', async () => {
    const { make, requests } = setup([jsonMessage(JSON.stringify(plan))])
    const res = await make().extractPlan(OPENING, live())
    expect(res).toEqual({ order: ['industry', 'business', 'retention'], plan })
    const r = requests[0]
    expect(r.max_tokens).toBe(2048)
    expect((r.output_config as { effort: string }).effort).toBe('low')
    expect((r.output_config as { format?: unknown }).format).toBeTruthy()
    expect('tools' in r).toBe(false)
    expect('stream' in r && r.stream).toBeFalsy()
    const raw = JSON.stringify(r)
    expect(raw).toContain('<candidate_said>OPENING_SECRET')
    expect(raw).not.toContain(brief.company.name)
    expect(raw).not.toContain('<evaluation_key>')
  })

  it('given an unparsable response, then { order: [] } and a code-only log', async () => {
    const { make, log } = setup([jsonMessage('not json at all')])
    expect(await make().extractPlan(OPENING, live())).toEqual({ order: [] })
    expect(log.warn.mock.calls.flat().join(' ')).toContain('extraction unparsable')
    expect(JSON.stringify(log.all())).not.toContain('OPENING_SECRET')
  })

  it('given a schema-invalid response, then { order: [] }', async () => {
    const { make } = setup([jsonMessage(JSON.stringify({ ...plan, recommendation: 'maybe' }))])
    expect(await make().extractPlan(OPENING, live())).toEqual({ order: [] })
  })
})

describe('createClaudeLlm scoreSession + isolation', () => {
  it('scoreSession delegates to the fake scorer (Phase 8 stub)', async () => {
    const { make } = setup([])
    const card = await make().scoreSession(
      { transcript: [], controlLog: [], endedEarly: false, omitted: [] },
      live()
    )
    expect(ScorecardSchema.parse(card)).toEqual(card)
    expect(card.graderModel).toBe('fake')
  })

  it('given two sessions, then B starts fresh with no A history; warm-up and grill are independent', async () => {
    const { make, requests } = setup([
      sseEvents({ text: ['Warm?'] }),
      sseEvents({ text: [REPLY], control: control() }),
      sseEvents({ text: ['B?'], control: control() })
    ])
    const a = make()
    const b = make()
    await collect(a.warmupTurn({ history: [] }, live()))
    await collect(a.streamTurn(grill(h1), live()))
    expect(msgsOf(requests[1])).toHaveLength(1)
    await collect(b.streamTurn(grill(h1), live()))
    expect(msgsOf(requests[2])).toHaveLength(1)
  })
})
