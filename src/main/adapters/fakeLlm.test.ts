import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ScorecardSchema } from '../../shared/schemas'
import { loadCase } from '../domain/cases/library'
import { SECTION_IDS } from '../domain/machine/sections'
import { checkUtterance } from '../domain/text/leakGuard'
import type { InterviewControl } from '../domain/machine/interviewMachine'
import type { LlmChunk, ScoreInput, TurnRequest } from '../ports'
import { createFakeLlm } from './fakeLlm'

const ROOT = join(__dirname, '../../../tests/fixtures/cases')
const brief = loadCase(
  ROOT,
  '99',
  readFileSync(join(ROOT, 'case_99_fixture/deck.txt'), 'utf8')
).brief
const live = (): AbortSignal => new AbortController().signal

async function collect(it: AsyncIterable<LlmChunk>): Promise<LlmChunk[]> {
  const out: LlmChunk[] = []
  for await (const c of it) out.push(c)
  return out
}
const text = (cs: LlmChunk[]): string =>
  cs
    .map((c) => (c.type === 'text' ? c.delta : ''))
    .join('')
    .trim()
const grill = (section: TurnRequest['section'], turnInSection: number): TurnRequest => ({
  kind: 'grill',
  section,
  turnInSection,
  history: []
})

describe('createFakeLlm streamTurn', () => {
  it('given a first grill turn, when streamed, then text chunks, one continue control, then done', async () => {
    const cs = await collect(createFakeLlm()(brief).streamTurn(grill('retention', 0), live()))
    const kinds = cs.map((c) => c.type)
    expect(kinds.filter((k) => k === 'text').length).toBeGreaterThan(1)
    expect(kinds.slice(-2)).toEqual(['control', 'done'])
    expect(kinds.filter((k) => k === 'control')).toHaveLength(1)
    expect(text(cs)).toContain('Retention')
    expect(cs.at(-2)).toEqual({
      type: 'control',
      payload: { section: 'retention', section_status: 'continue' }
    })
  })

  it('given turn 1 with default sufficientAfter, when streamed, then sufficient and no next_section', async () => {
    const cs = await collect(createFakeLlm()(brief).streamTurn(grill('retention', 1), live()))
    const ctl = cs.find((c) => c.type === 'control')
    expect(ctl).toEqual({
      type: 'control',
      payload: { section: 'retention', section_status: 'sufficient' }
    })
  })

  it('given sufficientAfter 3, when turn 1 streamed, then still continue', async () => {
    const cs = await collect(
      createFakeLlm({ sufficientAfter: 3 })(brief).streamTurn(grill('business', 1), live())
    )
    expect(cs.find((c) => c.type === 'control')).toMatchObject({
      payload: { section_status: 'continue' }
    })
  })

  it('given the same request twice, when streamed, then identical text', async () => {
    const llm = createFakeLlm()(brief)
    const a = text(await collect(llm.streamTurn(grill('valuation', 0), live())))
    const b = text(await collect(llm.streamTurn(grill('valuation', 0), live())))
    expect(a).toBe(b)
  })

  it('given every section and turn, when streamed, then every line passes the leak guard', async () => {
    const llm = createFakeLlm()(brief)
    for (const s of SECTION_IDS)
      for (const t of [0, 1]) {
        const line = text(await collect(llm.streamTurn(grill(s, t), live())))
        for (const sentence of line.split(/(?<=[.?!])\s+/))
          expect(checkUtterance(sentence, brief).ok).toBe(true)
        expect(line.toLowerCase()).not.toMatch(/rubric|answer key/)
      }
  })

  it('given a wrapup request, when streamed, then text and done with no control', async () => {
    const cs = await collect(
      createFakeLlm()(brief).streamTurn({ kind: 'wrapup', turnInSection: 0, history: [] }, live())
    )
    expect(cs.some((c) => c.type === 'control')).toBe(false)
    expect(cs.at(-1)).toEqual({ type: 'done' })
    expect(text(cs).length).toBeGreaterThan(0)
  })

  it('given an aborted signal, when iterated, then nothing is yielded', async () => {
    const ac = new AbortController()
    ac.abort()
    expect(
      await collect(createFakeLlm()(brief).streamTurn(grill('retention', 0), ac.signal))
    ).toEqual([])
  })

  it('given an abort mid-stream, when iterated, then it stops early without done', async () => {
    const ac = new AbortController()
    const out: LlmChunk[] = []
    for await (const c of createFakeLlm({ chunkDelayMs: 5 })(brief).streamTurn(
      grill('retention', 0),
      ac.signal
    )) {
      out.push(c)
      if (out.length === 2) ac.abort()
    }
    expect(out).toHaveLength(2)
    expect(out.some((c) => c.type === 'done')).toBe(false)
  })
})

describe('createFakeLlm warmupTurn', () => {
  const cand = { speaker: 'candidate' as const, text: 'fine' }
  const intv = { speaker: 'interviewer' as const, text: 'hi' }

  it('given no candidate turns, when warmup streamed, then greeting and done without warmupComplete', async () => {
    const cs = await collect(createFakeLlm()(brief).warmupTurn({ history: [] }, live()))
    expect(text(cs)).toMatch(/^Hi, thanks/)
    expect(cs.at(-1)).toEqual({ type: 'done' })
  })

  it('given two candidate turns, when warmup streamed, then closing line and warmupComplete', async () => {
    const cs = await collect(
      createFakeLlm()(brief).warmupTurn({ history: [intv, cand, intv, cand] }, live())
    )
    expect(text(cs)).toBe("Great, let's get into the case.")
    expect(cs.at(-1)).toEqual({ type: 'done', warmupComplete: true })
  })
})

describe('createFakeLlm extractPlan', () => {
  it('given default options, when extracting, then the full section order', async () => {
    expect(await createFakeLlm()(brief).extractPlan('anything', live())).toEqual({
      order: [...SECTION_IDS]
    })
  })
  it('given a plan option, when extracting, then that order', async () => {
    const llm = createFakeLlm({ plan: ['retention', 'business'] })(brief)
    expect(await llm.extractPlan('x', live())).toEqual({ order: ['retention', 'business'] })
  })
})

describe('createFakeLlm scoreSession', () => {
  const turn = {
    id: 't1',
    speaker: 'candidate' as const,
    phase: 'grilling' as const,
    text: 'My call is to pass at this price',
    at: 0
  }
  const ctl = (extra: Partial<InterviewControl>): ScoreInput['controlLog'][number] => ({
    at: 0,
    turnId: 't1',
    control: { section: 'retention' as const, section_status: 'continue' as const, ...extra }
  })

  it('given one turn and f1 surfaced, when scored, then a valid average card with f1 found', async () => {
    const card = await createFakeLlm()(brief).scoreSession(
      {
        transcript: [turn],
        controlLog: [ctl({ flags_surfaced: ['f1'] })],
        endedEarly: false,
        omitted: []
      },
      live()
    )
    expect(ScorecardSchema.parse(card)).toEqual(card)
    expect(card.rubric.map((r) => r.dimension)).toEqual(brief.rubric.map((r) => r.dimension))
    expect(card.rubric).toHaveLength(6)
    card.rubric.forEach((r, i) => {
      expect(r.answerKey).toBe(brief.rubric[i].five)
      expect(r.score).toBe(3)
      expect(r.evidence).toBe('My call is to pass at this price')
    })
    expect(card.total).toBe(18)
    expect(card.band).toBe('average')
    expect(card.flags.map((f) => f.id)).toEqual(brief.flags.map.map((f) => f.id))
    expect(card.flags.find((f) => f.id === 'f1')?.status).toBe('found')
    expect(card.flags.find((f) => f.id === 'f2')?.status).toBe('missed')
    expect(card.graderModel).toBe('fake')
    expect(card.promptVersion).toBe('fake-1')
  })

  it('given f1 surfaced with a hint, when scored, then f1 is hinted', async () => {
    const card = await createFakeLlm()(brief).scoreSession(
      {
        transcript: [turn],
        controlLog: [ctl({ flags_surfaced: ['f1'], hint_given: true })],
        endedEarly: false,
        omitted: []
      },
      live()
    )
    expect(card.flags.find((f) => f.id === 'f1')?.status).toBe('hinted')
  })

  it('given a long answer or none, when scored, then evidence is 12 words or (no answer)', async () => {
    const llm = createFakeLlm()(brief)
    const long = {
      ...turn,
      text: 'one two three four five six seven eight nine ten eleven twelve thirteen'
    }
    const a = await llm.scoreSession(
      { transcript: [long], controlLog: [], endedEarly: false, omitted: [] },
      live()
    )
    expect(a.rubric[0].evidence).toBe(
      'one two three four five six seven eight nine ten eleven twelve'
    )
    const b = await llm.scoreSession(
      { transcript: [], controlLog: [], endedEarly: false, omitted: [] },
      live()
    )
    expect(b.rubric[0].evidence).toBe('(no answer)')
  })
})
