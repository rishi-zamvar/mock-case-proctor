// Scripted, deterministic LLM for tests and Tier-1 E2E (QA-02). Spoken lines never use the brief.
import { DIMENSION_IDS } from '../../shared/ipc'
import { SECTION_CATALOG, SECTION_IDS } from '../domain/machine/sections'
import type { LlmChunk, LlmPort, MakeLlm } from '../ports'
import { assembleScorecard } from '../review/scorecard'

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
      const quotes = first ? [first.text.split(/\s+/).slice(0, 12).join(' ')] : []
      return assembleScorecard(
        {
          dimensions: DIMENSION_IDS.map((id) => ({
            id,
            score: 3,
            evidence_quotes: quotes,
            answer_key_item: '',
            rationale: 'Fake grader.'
          })),
          keep: 'Lead with the call.',
          fix: 'Quantify retention.',
          insight: { called_out: ['Fake called-out point'], missed: ['Fake missed point'] },
          summary: 'Fake scorecard.'
        },
        { input, brief, graderModel: 'fake', promptVersion: 'fake-1' }
      )
    }
  })
}
