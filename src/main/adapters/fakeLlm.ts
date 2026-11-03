// Scripted, deterministic LLM for tests and Tier-1 E2E (QA-02). Spoken lines never use the brief.
import type { FlagStatus, Scorecard } from '../../shared/ipc'
import { ScorecardSchema } from '../../shared/schemas'
import { SECTION_CATALOG, SECTION_IDS } from '../domain/machine/sections'
import type { LlmChunk, LlmPort, MakeLlm } from '../ports'

export type FakeLlmOptions = {
  sufficientAfter?: number
  warmupReplies?: number
  chunkDelayMs?: number
  plan?: string[]
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export function createFakeLlm(o: FakeLlmOptions = {}): MakeLlm {
  const sufficientAfter = Math.max(2, o.sufficientAfter ?? 2)
  const warmupReplies = o.warmupReplies ?? 2
  const delay = o.chunkDelayMs ?? 0
  const plan = o.plan ?? [...SECTION_IDS]

  async function* speak(
    line: string,
    tail: LlmChunk[],
    signal: AbortSignal
  ): AsyncGenerator<LlmChunk> {
    const chunks: LlmChunk[] = [
      ...line.split(' ').map((w) => ({ type: 'text' as const, delta: w + ' ' })),
      ...tail
    ]
    for (const [i, c] of chunks.entries()) {
      if (i > 0 && delay > 0) await sleep(delay)
      if (signal.aborted) return
      yield c
    }
  }

  return (brief): LlmPort => ({
    warmupTurn({ history }, signal) {
      const c = history.filter((t) => t.speaker === 'candidate').length
      if (c >= warmupReplies)
        return speak(
          "Great, let's get into the case.",
          [{ type: 'done', warmupComplete: true }],
          signal
        )
      const line =
        c === 0
          ? 'Hi, thanks for making the time today. How has your week been?'
          : 'Nice. What got you interested in growth investing?'
      return speak(line, [{ type: 'done' }], signal)
    },

    streamTurn(req, signal) {
      if (req.kind === 'wrapup' || !req.section)
        return speak(
          "That's everything I wanted to cover. Thanks, that was useful.",
          [{ type: 'done' }],
          signal
        )
      const section = req.section
      const label = SECTION_CATALOG.find((s) => s.id === section)?.label ?? section
      const line =
        req.turnInSection === 0
          ? `Let's talk about ${label}. What's your read here?`
          : `Okay, push on that a bit. What would change your mind on ${label.toLowerCase()}?`
      const status = req.turnInSection + 1 >= sufficientAfter ? 'sufficient' : 'continue'
      return speak(
        line,
        [{ type: 'control', payload: { section, section_status: status } }, { type: 'done' }],
        signal
      )
    },

    async extractPlan() {
      return { order: [...plan] }
    },

    async scoreSession(input) {
      const first = input.transcript.find((t) => t.speaker === 'candidate')
      const evidence = first ? first.text.split(/\s+/).slice(0, 12).join(' ') : '(no answer)'
      const status = new Map<string, FlagStatus>()
      for (const { control } of input.controlLog)
        for (const id of control.flags_surfaced ?? [])
          if (status.get(id) !== 'hinted') status.set(id, control.hint_given ? 'hinted' : 'found')
      const rubric = brief.rubric.map((r) => ({
        dimension: r.dimension,
        score: 3,
        evidence,
        answerKey: r.five
      }))
      const total = rubric.reduce((n, r) => n + r.score, 0)
      const card: Scorecard = {
        rubric,
        total,
        band: total >= 24 ? 'strong' : total >= 15 ? 'average' : 'weak',
        flags: brief.flags.map.map((f) => ({
          id: f.id,
          flag: f.flag,
          status: status.get(f.id) ?? 'missed'
        })),
        graderModel: 'fake',
        promptVersion: 'fake-1'
      }
      return ScorecardSchema.parse(card)
    }
  })
}
