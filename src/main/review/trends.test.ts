import { describe, it, expect, vi } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Anthropic, { APIError, APIUserAbortError } from '@anthropic-ai/sdk'
import {
  toSummary,
  createTrendsAgent,
  createFakeTrendsAgent,
  createTrendsService,
  type TrendsAgent,
  type TrendsInput
} from './trends'
import { sseFetch, jsonMessage } from '../agent/sse.harness'
import { TrendsViewSchema } from '../../shared/schemas'
import { DIMENSION_IDS, type DimensionId, type Scorecard, type SessionSummary } from '../../shared/ipc'
import type { SessionFile } from '../store/sessionSchema'
import { initialState } from '../domain/machine/interviewMachine'
import type { Logger } from '../log'

const SECRET = 'transcript-secret 184 million'
const mkLog = (): Logger => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })

function card(o: Partial<Scorecard> & { dims?: Partial<Record<DimensionId, number>> } = {}): Scorecard {
  const { dims = {}, ...rest } = o
  return {
    rubric: DIMENSION_IDS.map((id) => ({
      id,
      dimension: id,
      score: dims[id] ?? 4,
      evidence: [],
      answerKey: '',
      rationale: '',
      unverified: false
    })),
    total: 24,
    band: 'close',
    flags: [],
    keep: 'k',
    fix: 'lead with the call',
    insight: { calledOut: [], missed: [] },
    summary: '',
    evidenceStats: { proposed: 0, verified: 0, dropped: 0 },
    checksSummary: {
      numbersCorrect: 3,
      numbersWrong: 1,
      numbersUnverifiable: 2,
      brevity: { short: 0, brief: 1, ideal: 2, long: 1, flagged: 0 },
      avgAnswerMs: 42000,
      ledWithCall: true,
      flagsFound: 2,
      flagsHinted: 2,
      flagsTotal: 4
    },
    graderModel: 'fake',
    promptVersion: 'v1',
    scoredAt: 500,
    ...rest
  }
}

function session(sc?: Scorecard): SessionFile {
  return {
    schemaVersion: 1,
    id: 's1',
    caseId: '03',
    startedAt: 1,
    status: 'completed',
    endedAt: 9,
    warmup: true,
    machineState: initialState(),
    transcript: [{ id: 't1', speaker: 'candidate', phase: 'presentation', text: SECRET, at: 2 }],
    controlLog: [],
    timings: [],
    pending: null,
    scorecard: sc
  }
}

const summ = (o: Partial<SessionSummary> = {}): SessionSummary => ({
  ...toSummary(session(card())),
  ...o
})

describe('toSummary', () => {
  it('given a scored session when summarised then it carries scores and ratios, not the transcript', () => {
    const s = toSummary(session(card({ dims: { valuation: 2 } })))
    expect(s).toEqual({
      sessionId: 's1',
      caseId: '03',
      at: 500,
      total: 24,
      band: 'close',
      dims: {
        clear_call: 4,
        lead_edge_8: 4,
        retention: 4,
        valuation: 2,
        back_solve: 4,
        quality_poise: 4
      },
      flagFoundRate: 0.75, // (2 + 2*0.5) / 4
      avgAnswerMs: 42000,
      numberAccuracy: 0.75,
      brevity: { short: 0, brief: 1, ideal: 2, long: 1, flagged: 0 },
      fix: 'lead with the call'
    })
    expect(JSON.stringify(s)).not.toContain('transcript-secret')
  })

  it('given no flags and no checked numbers when summarised then ratios are null', () => {
    const base = card()
    const s = toSummary(
      session({
        ...base,
        checksSummary: {
          ...base.checksSummary,
          numbersCorrect: 0,
          numbersWrong: 0,
          flagsFound: 0,
          flagsHinted: 0,
          flagsTotal: 0
        }
      })
    )
    expect(s.flagFoundRate).toBeNull()
    expect(s.numberAccuracy).toBeNull()
  })
})

const input: TrendsInput = {
  summaries: [summ({ sessionId: 'a', at: 1, total: 18 }), summ({ sessionId: 'b', at: 2, total: 22 })],
  unseen: [{ id: '07', vertical: 'SaaS', level: 2 }]
}

const raw = (o: Record<string, unknown> = {}): Record<string, unknown> => ({
  recurring_weaknesses: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  progress_by_dimension: [
    { id: 'valuation', direction: 'up', note: 'better comps' },
    { id: 'valuation', direction: 'down', note: 'dup' },
    { id: 'bogus', direction: 'up', note: 'x' }
  ],
  carried_forward_fix: { fix: 'lead with the call', improved: 'yes', note: 'led with it' },
  next_case_suggestion: { case_id: '07', why: 'retention-heavy' },
  readiness: 'Two points off.',
  ...o
})

function agentWith(responses: string[][]): {
  agent: TrendsAgent
  requests: Record<string, unknown>[]
  log: Logger
} {
  const { fetch, requests } = sseFetch(responses)
  const log = mkLog()
  const client = new Anthropic({ apiKey: 'test', fetch, maxRetries: 0 })
  return { agent: createTrendsAgent({ client, model: 'claude-opus-5-5', log }), requests, log }
}

describe('createTrendsAgent', () => {
  it('given summaries when called then one parse request is sent with summaries only', async () => {
    const { agent, requests } = agentWith([jsonMessage(JSON.stringify(raw()))])
    await agent(input, new AbortController().signal)
    expect(requests).toHaveLength(1)
    const req = requests[0] as {
      model: string
      max_tokens: number
      output_config: { effort: string; format: unknown }
      system: string
      messages: { role: string; content: string }[]
    }
    expect(req.model).toBe('claude-opus-5-5')
    expect(req.max_tokens).toBe(4096)
    expect(req.output_config.effort).toBe('medium')
    expect(req.output_config.format).toBeTruthy()
    expect(req.system).toContain('26')
    const body = JSON.stringify(req)
    expect(body).not.toContain('<candidate_said>')
    expect(body).not.toContain('transcript-secret')
    const sent = JSON.parse(req.messages[0].content) as TrendsInput
    expect(Object.keys(sent).sort()).toEqual(['summaries', 'unseen'])
    for (const s of sent.summaries)
      expect(Object.keys(s).sort()).toEqual(Object.keys(input.summaries[0]).sort())
  })

  it('given a raw response when mapped then it is camelCase, deduped, capped and validated', async () => {
    const { agent } = agentWith([jsonMessage(JSON.stringify(raw()))])
    const out = await agent(input, new AbortController().signal)
    expect(out).toEqual({
      recurringWeaknesses: ['a', 'b', 'c', 'd', 'e'],
      progress: [{ id: 'valuation', direction: 'up', note: 'better comps' }],
      carriedForwardFix: { fix: 'lead with the call', improved: 'yes', note: 'led with it' },
      nextCase: { caseId: '07', why: 'retention-heavy' },
      readiness: 'Two points off.'
    })
  })

  it('given a suggestion outside the unseen list when mapped then nextCase is null and a code is logged', async () => {
    const { agent, log } = agentWith([
      jsonMessage(JSON.stringify(raw({ next_case_suggestion: { case_id: '03', why: 'seen' } })))
    ])
    const out = await agent(input, new AbortController().signal)
    expect(out.nextCase).toBeNull()
    expect(log.warn).toHaveBeenCalled()
    expect(JSON.stringify((log.warn as ReturnType<typeof vi.fn>).mock.calls)).not.toContain('seen')
  })

  it('given unparsable output when called then it throws trends unparsable', async () => {
    const { agent } = agentWith([jsonMessage('not json at all')])
    await expect(agent(input, new AbortController().signal)).rejects.toThrow()
  })

  it('given an API error when called then it rethrows the APIError', async () => {
    const fetch = (async () =>
      new Response(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'x' } }), {
        status: 529,
        headers: { 'content-type': 'application/json' }
      })) as typeof globalThis.fetch
    const client = new Anthropic({ apiKey: 'test', fetch, maxRetries: 0 })
    const agent = createTrendsAgent({ client, model: 'm', log: mkLog() })
    await expect(agent(input, new AbortController().signal)).rejects.toBeInstanceOf(APIError)
  })

  it('given an aborted signal when called then it rethrows APIUserAbortError', async () => {
    const { agent } = agentWith([jsonMessage(JSON.stringify(raw()))])
    const ac = new AbortController()
    ac.abort()
    await expect(agent(input, ac.signal)).rejects.toBeInstanceOf(APIUserAbortError)
  })
})

describe('createFakeTrendsAgent', () => {
  it('given summaries when called then insights are deterministic from the scores', async () => {
    const a = summ({
      sessionId: 'a',
      total: 18,
      fix: 'first fix',
      dims: { ...summ().dims, valuation: 1, retention: 2, back_solve: 4 }
    })
    const b = summ({
      sessionId: 'b',
      total: 22,
      fix: 'second fix',
      dims: { ...summ().dims, valuation: 2, retention: 3, back_solve: 3 }
    })
    const out = await createFakeTrendsAgent()(
      { summaries: [a, b], unseen: [{ id: '07', vertical: 'SaaS', level: 2 }] },
      new AbortController().signal
    )
    expect(out.recurringWeaknesses).toEqual(['Valuation and comps', 'Retention insight'])
    expect(out.progress).toContainEqual({ id: 'valuation', direction: 'up', note: '' })
    expect(out.progress).toContainEqual({ id: 'back_solve', direction: 'down', note: '' })
    expect(out.progress).toContainEqual({ id: 'clear_call', direction: 'flat', note: '' })
    expect(out.progress).toHaveLength(6)
    expect(out.carriedForwardFix).toEqual({ fix: 'first fix', improved: 'yes', note: '' })
    expect(out.nextCase).toEqual({ caseId: '07', why: expect.any(String) })
    expect(out.readiness).toBe('Latest 22/30; ready at 26.')
  })

  it('given no unseen cases and a worse latest total then nextCase is null and improved is no', async () => {
    const out = await createFakeTrendsAgent()(
      { summaries: [summ({ total: 22 }), summ({ total: 18 })], unseen: [] },
      new AbortController().signal
    )
    expect(out.nextCase).toBeNull()
    expect(out.carriedForwardFix?.improved).toBe('no')
  })
})

describe('createTrendsService', () => {
  function svc(o: {
    summaries: SessionSummary[]
    agent?: TrendsAgent
  }): {
    service: ReturnType<typeof createTrendsService>
    calls: () => number
    file: string
    log: Logger
    set: (s: SessionSummary[]) => void
  } {
    let summaries = o.summaries
    let n = 0
    const fake = createFakeTrendsAgent()
    const counting: TrendsAgent = async (i, s) => {
      n++
      return (o.agent ?? fake)(i, s)
    }
    const file = join(mkdtempSync(join(tmpdir(), 'mcp-trends-')), 'trends.json')
    const log = mkLog()
    const service = createTrendsService({
      listSummaries: () => summaries,
      cases: () => [
        { id: '03', vertical: 'SaaS', level: 2 },
        { id: '07', vertical: 'Fintech', level: 3 }
      ],
      agent: () => counting,
      file,
      log
    })
    return { service, calls: () => n, file, log, set: (s) => (summaries = s) }
  }

  const two = [summ({ sessionId: 'a', at: 1, total: 18 }), summ({ sessionId: 'b', at: 2, total: 22 })]

  it('given fewer than 2 summaries when getting then it is insufficient and the agent is not called', async () => {
    for (const summaries of [[], [summ()]]) {
      const { service, calls } = svc({ summaries })
      const v = await service.get()
      expect(v).toEqual({ status: 'insufficient', summaries, insights: null })
      expect(TrendsViewSchema.parse(v)).toEqual(v)
      expect(calls()).toBe(0)
    }
  })

  it('given 2 summaries when getting twice then the agent runs once and trends.json caches it', async () => {
    const { service, calls, file } = svc({ summaries: two })
    const v = await service.get()
    expect(v.status).toBe('ready')
    expect(TrendsViewSchema.parse(v)).toEqual(v)
    expect(v.insights?.nextCase?.caseId).toBe('07') // only unseen case
    const disk = JSON.parse(readFileSync(file, 'utf8'))
    expect(disk.insights).toEqual(v.insights)
    expect(typeof disk.key).toBe('string')
    expect(existsSync(`${file}.tmp`)).toBe(false)
    expect(await service.get()).toEqual(v)
    expect(calls()).toBe(1)
  })

  it('given a new scorecard when refreshing then insights are recomputed', async () => {
    const { service, calls, set } = svc({ summaries: two })
    await service.get()
    set([...two, summ({ sessionId: 'c', at: 3, total: 26 })])
    await service.refresh()
    expect(calls()).toBe(2)
    expect((await service.get()).insights?.readiness).toBe('Latest 26/30; ready at 26.')
    expect(calls()).toBe(2)
  })

  it('given concurrent get and refresh then they share one agent call', async () => {
    const { service, calls } = svc({ summaries: two })
    const [v] = await Promise.all([service.get(), service.refresh(), service.get()])
    expect(v.status).toBe('ready')
    expect(calls()).toBe(1)
  })

  it('given the agent throws when getting then status is failed and nothing is cached', async () => {
    const agent: TrendsAgent = async () => {
      throw Object.assign(new Error('boom ' + SECRET), { code: 'E_BOOM' })
    }
    const { service, file, log } = svc({ summaries: two, agent })
    const v = await service.get()
    expect(v).toEqual({ status: 'failed', summaries: two, insights: null })
    expect(TrendsViewSchema.parse(v)).toEqual(v)
    expect(existsSync(file)).toBe(false)
    expect(log.warn).toHaveBeenCalledWith('trends failed', expect.anything())
    expect(JSON.stringify((log.warn as ReturnType<typeof vi.fn>).mock.calls)).not.toContain(
      'transcript-secret'
    )
  })

  it('given a corrupt trends.json when getting then it recomputes without throwing', async () => {
    const { service, calls, file } = svc({ summaries: two })
    writeFileSync(file, '{not json')
    expect((await service.get()).status).toBe('ready')
    expect(calls()).toBe(1)
  })
})
