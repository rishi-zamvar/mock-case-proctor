// The ONLY path from a grade draft (real or fake) to a Scorecard (REV-01..03). Pure: no LLM, IO or clock.
// Code owns evidence verification, the unverified cap, total, band, flag map and checks summary.
import {
  DIMENSION_IDS,
  DIMENSION_LABELS,
  type BrevityBand,
  type Checks,
  type ChecksSummary,
  type DimensionId,
  type FlagRowView,
  type NumberCheck,
  type Scorecard
} from '../../shared/ipc'
import { ScorecardSchema } from '../../shared/schemas'
import type { InterviewerBrief } from '../domain/cases/brief'
import { SECTION_CATALOG } from '../domain/machine/sections'
import type { ScoreInput } from '../ports'
import {
  brevityRows,
  flagMap,
  ledWithCall,
  numberChecks,
  type FlagMapRow,
  type NumberCheckRow
} from './checks'
import { bandOf, verifyQuotes } from './evidence'

type Row = { id: DimensionId; dimension: string; five: string; one: string }

const L = DIMENSION_LABELS
export const GENERIC_RUBRIC: readonly Row[] = [
  {
    id: 'clear_call',
    dimension: L.clear_call,
    five: 'Leads with invest / pass / invest-at-a-price in the first sentence',
    one: 'No call, or a call only when asked'
  },
  {
    id: 'lead_edge_8',
    dimension: L.lead_edge_8,
    five: 'Scores all 8 accurately, names the weakest and why it matters',
    one: "Doesn't reference the framework"
  },
  {
    id: 'retention',
    dimension: L.retention,
    five: 'Computes or estimates GRR, separates it from NRR, finds the buried flag',
    one: 'Quotes NRR only'
  },
  {
    id: 'valuation',
    dimension: L.valuation,
    five: 'Anchors the ask to a growth bucket and a vertical peer, adjusts for quality',
    one: 'Never mentions price'
  },
  {
    id: 'back_solve',
    dimension: L.back_solve,
    five: 'Gets required exit ARR and CAGR, judges believability',
    one: 'No return logic'
  },
  {
    id: 'quality_poise',
    dimension: L.quality_poise,
    five: 'Names the tailwind and moat; defends under pushback without folding or bluffing',
    one: 'Pure number-reading; folds on first pushback'
  }
]

export function rubricRows(brief: Pick<InterviewerBrief, 'rubric'>): Row[] {
  if (brief.rubric.length !== DIMENSION_IDS.length) return GENERIC_RUBRIC.map((r) => ({ ...r }))
  return DIMENSION_IDS.map((id, i) => ({
    id,
    dimension: brief.rubric[i].dimension,
    five: brief.rubric[i].five,
    one: brief.rubric[i].one
  }))
}

export type GradeDraft = {
  dimensions: {
    id: DimensionId
    score: number
    evidence_quotes: string[]
    answer_key_item: string
    rationale: string
  }[]
  keep: string
  fix: string
  insight: { called_out: string[]; missed: string[] }
  summary: string
}

const label = (id: string): string => SECTION_CATALOG.find((c) => c.id === id)?.label ?? id
const talkLines = (t: ScoreInput['transcript']): ScoreInput['transcript'] =>
  t.filter(
    (x) => x.speaker === 'candidate' && (x.phase === 'presentation' || x.phase === 'grilling')
  )

export function computeChecks(
  input: Pick<ScoreInput, 'transcript' | 'omitted' | 'openingPlan'>,
  brief: Pick<InterviewerBrief, 'numberTokens'>
): Checks {
  const opening =
    input.transcript.find((t) => t.speaker === 'candidate' && t.phase === 'presentation')?.text ??
    ''
  return {
    numbers: numberChecks(talkLines(input.transcript), brief.numberTokens),
    brevity: brevityRows(input.transcript),
    ledWithCall: ledWithCall(opening, input.openingPlan?.recommendation),
    omitted: input.omitted.map(label)
  }
}

export function summarizeChecks(checks: Checks, flags: FlagRowView[]): ChecksSummary {
  const brevity: Record<BrevityBand, number> = { short: 0, brief: 0, ideal: 0, long: 0, flagged: 0 }
  for (const b of checks.brevity) brevity[b.band]++
  const n = checks.numbers
  const ms = checks.brevity.map((b) => b.ms)
  return {
    numbersCorrect: n.filter((x) => x.correct === true).length,
    numbersWrong: n.filter((x) => x.correct === false).length,
    numbersUnverifiable: n.filter((x) => x.correct === 'unverifiable').length,
    brevity,
    avgAnswerMs: ms.length ? ms.reduce((a, b) => a + b, 0) / ms.length : null,
    ledWithCall: checks.ledWithCall,
    flagsFound: flags.filter((f) => f.status === 'found').length,
    flagsHinted: flags.filter((f) => f.status === 'hinted').length,
    flagsTotal: flags.length
  }
}

const words = (s: string, n: number): string => s.trim().split(/\s+/).slice(0, n).join(' ')
const MAX_QUOTES = 3
const UNVERIFIED_CAP = 2

export function assembleScorecard(
  draft: GradeDraft,
  ctx: { input: ScoreInput; brief: InterviewerBrief; graderModel: string; promptVersion: string }
): Scorecard {
  const ids = draft.dimensions.map((d) => d.id)
  const valid =
    ids.length === DIMENSION_IDS.length &&
    DIMENSION_IDS.every((id) => ids.includes(id)) &&
    draft.dimensions.every((d) => Number.isInteger(d.score) && d.score >= 1 && d.score <= 5)
  if (!valid) throw new Error('grade: invalid dimensions')

  const lines = ctx.input.transcript.filter((t) => t.speaker === 'candidate')
  const stats = { proposed: 0, verified: 0, dropped: 0 }
  const rubric = rubricRows(ctx.brief).map((row) => {
    const d = draft.dimensions.find((x) => x.id === row.id) as GradeDraft['dimensions'][number]
    const quotes = d.evidence_quotes.slice(0, MAX_QUOTES)
    const { verified, dropped } = verifyQuotes(quotes, lines)
    stats.proposed += quotes.length
    stats.verified += verified.length
    stats.dropped += dropped
    const unverified = verified.length === 0
    return {
      id: row.id,
      dimension: row.dimension,
      score: unverified ? Math.min(d.score, UNVERIFIED_CAP) : d.score,
      evidence: verified,
      answerKey: d.answer_key_item || row.five,
      rationale: words(d.rationale, 40),
      unverified
    }
  })
  const total = rubric.reduce((a, r) => a + r.score, 0)
  const flags = flagMap(ctx.input.controlLog, ctx.brief.flags.map)
  const card = ScorecardSchema.parse({
    rubric,
    total,
    band: bandOf(total),
    flags,
    keep: draft.keep,
    fix: draft.fix,
    insight: { calledOut: draft.insight.called_out, missed: draft.insight.missed },
    summary: words(draft.summary, 60),
    evidenceStats: stats,
    checksSummary: summarizeChecks(computeChecks(ctx.input, ctx.brief), flags),
    graderModel: ctx.graderModel,
    promptVersion: ctx.promptVersion,
    scoredAt: ctx.input.at
  } satisfies Scorecard)
  return Object.freeze(card)
}

// Compile-time guards: the 08-02 check rows are the shared ipc shapes, both ways.
const _nc: NumberCheck = {} as NumberCheckRow
const _nc2: NumberCheckRow = {} as NumberCheck
const _fm: FlagRowView = {} as FlagMapRow
const _fm2: FlagMapRow = {} as FlagRowView
void [_nc, _nc2, _fm, _fm2]
