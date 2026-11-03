// Trends (REV-06): per-session summaries -> one structured Claude call. The agent reads summaries
// only, never transcripts.
import Anthropic, { APIError } from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import {
  DIMENSION_IDS,
  DIMENSION_LABELS,
  type DimensionId,
  type SessionSummary,
  type TrendsInsights
} from '../../shared/ipc'
import type { SessionFile } from '../store/sessionSchema'
import type { Logger } from '../log'

export function toSummary(s: SessionFile): SessionSummary {
  const sc = s.scorecard
  if (!sc) throw new Error('toSummary: session has no scorecard')
  const c = sc.checksSummary
  const dims = Object.fromEntries(
    DIMENSION_IDS.map((id) => [id, sc.rubric.find((r) => r.id === id)?.score ?? 0])
  ) as Record<DimensionId, number>
  const checked = c.numbersCorrect + c.numbersWrong
  return {
    sessionId: s.id,
    caseId: s.caseId,
    at: sc.scoredAt,
    total: sc.total,
    band: sc.band,
    dims,
    // A flag found only after a hint counts half.
    flagFoundRate: c.flagsTotal ? (c.flagsFound + c.flagsHinted * 0.5) / c.flagsTotal : null,
    avgAnswerMs: c.avgAnswerMs,
    numberAccuracy: checked ? c.numbersCorrect / checked : null,
    brevity: c.brevity,
    fix: sc.fix
  }
}

// Plain on purpose: zodOutputFormat consumes it and strict outputs reject min/max. Limits live in code.
export const TrendsInsightsSchema = z.object({
  recurring_weaknesses: z.array(z.string()),
  progress_by_dimension: z.array(
    z.object({
      id: z.enum(DIMENSION_IDS),
      direction: z.enum(['up', 'flat', 'down']),
      note: z.string()
    })
  ),
  carried_forward_fix: z
    .object({ fix: z.string(), improved: z.enum(['yes', 'no', 'unclear']), note: z.string() })
    .nullable(),
  next_case_suggestion: z.object({ case_id: z.string(), why: z.string() }).nullable(),
  readiness: z.string()
})
type RawInsights = z.infer<typeof TrendsInsightsSchema>

export type TrendsInput = {
  summaries: SessionSummary[]
  unseen: { id: string; vertical: string; level: number }[]
}
export type TrendsAgent = (input: TrendsInput, signal: AbortSignal) => Promise<TrendsInsights>
export const DEFAULT_TRENDS_EFFORT = 'medium'

const TRENDS_SYSTEM = `You are a Lead Edge Capital case-interview coach reading compact scorecard summaries of a candidate's past mock cases (oldest first). Each summary has a total out of 30 and six 1-5 dimension scores; 26/30 is the readiness bar.
- recurring_weaknesses: dimensions scored low (<=3) in 2 or more sessions, phrased as short coaching points.
- progress_by_dimension: one entry per dimension, comparing early to recent sessions.
- carried_forward_fix: did the latest session improve on the previous session's fix? null if there is no previous session.
- next_case_suggestion: pick a case_id from the unseen list ONLY, aimed at the weakest area; null if the list is empty.
- readiness: one or two sentences on distance to 26/30.`

function toInsights(r: RawInsights, unseen: TrendsInput['unseen'], log: Logger): TrendsInsights {
  // Unknown ids never reach here: the SDK validates the DIMENSION_IDS enum. Dedupe only.
  const seen = new Set<string>()
  const progress = r.progress_by_dimension.filter((p) => {
    if (seen.has(p.id)) return false
    seen.add(p.id)
    return true
  })
  let nextCase: TrendsInsights['nextCase'] = null
  const n = r.next_case_suggestion
  if (n && unseen.some((u) => u.id === n.case_id)) nextCase = { caseId: n.case_id, why: n.why }
  else if (n) log.warn('trends next case not unseen')
  return {
    recurringWeaknesses: r.recurring_weaknesses.slice(0, 5),
    progress,
    carriedForwardFix: r.carried_forward_fix,
    nextCase,
    readiness: r.readiness
  }
}

export function createTrendsAgent(cfg: {
  client: Anthropic
  model: string
  log: Logger
}): TrendsAgent {
  return async (input, signal) => {
    const body = { summaries: input.summaries, unseen: input.unseen }
    let r
    try {
      r = await cfg.client.messages.parse(
        {
          model: cfg.model,
          max_tokens: 4096,
          output_config: {
            effort: DEFAULT_TRENDS_EFFORT,
            format: zodOutputFormat(TrendsInsightsSchema)
          },
          system: TRENDS_SYSTEM,
          messages: [{ role: 'user', content: JSON.stringify(body) }]
        },
        { signal }
      )
    } catch (e) {
      if (e instanceof APIError) throw e // APIUserAbortError is an APIError subclass
      throw new Error('trends unparsable') // SDK schema validation failed (incl. unknown dimension ids)
    }
    if (!r.parsed_output) throw new Error('trends unparsable')
    return toInsights(r.parsed_output, input.unseen, cfg.log)
  }
}

// Deterministic, offline (E2E).
export function createFakeTrendsAgent(): TrendsAgent {
  return async ({ summaries, unseen }) => {
    const first = summaries[0]
    const last = summaries[summaries.length - 1]
    const prev = summaries[summaries.length - 2]
    const mean = (id: DimensionId): number =>
      summaries.reduce((a, s) => a + s.dims[id], 0) / (summaries.length || 1)
    return {
      recurringWeaknesses: DIMENSION_IDS.filter((id) => mean(id) < 3)
        .sort((a, b) => mean(a) - mean(b))
        .slice(0, 3)
        .map((id) => DIMENSION_LABELS[id]),
      progress: DIMENSION_IDS.map((id) => {
        const d = last && first ? last.dims[id] - first.dims[id] : 0
        return { id, direction: d > 0 ? 'up' : d < 0 ? 'down' : 'flat', note: '' } as const
      }),
      carriedForwardFix: prev
        ? { fix: prev.fix, improved: last.total > prev.total ? 'yes' : 'no', note: '' }
        : null,
      nextCase: unseen[0] ? { caseId: unseen[0].id, why: 'Not attempted yet.' } : null,
      readiness: `Latest ${last?.total ?? 0}/30; ready at 26.`
    }
  }
}
