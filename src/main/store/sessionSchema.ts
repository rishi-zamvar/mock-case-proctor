// Versioned session.json schema (REV-05). Main-only: files on disk are a trust boundary.
import { z } from 'zod'
import { SECTION_IDS } from '../domain/machine/sections'
import type { InterviewControl, InterviewState } from '../domain/machine/interviewMachine'
import type { OpeningPlan } from '../ports'
import { ScorecardSchema } from '../../shared/schemas'
import { DIMENSION_IDS } from '../../shared/ipc'

const PhaseEnum = z.enum([
  'idle',
  'warmup',
  'review',
  'presentation',
  'extraction',
  'grilling',
  'wrapup',
  'scoring',
  'reviewMode'
])
const SectionEnum = z.enum(SECTION_IDS)
const count = z.number().int().nonnegative()

export const InterviewStateSchema = z
  .object({
    phase: PhaseEnum,
    config: z
      .object({
        warmup: z.boolean(),
        warmupPosition: z.enum(['before', 'after']),
        budgetMin: z.number().positive(),
        reviewMs: z.number().positive()
      })
      .strict(),
    startedAt: z.number().nullable(),
    reviewDeadline: z.number().nullable(),
    reviewWarned: z.boolean().default(false), // absent in pre-Phase-4 session files
    plan: z.array(SectionEnum),
    omitted: z.array(SectionEnum),
    done: z.array(SectionEnum),
    current: SectionEnum.nullable(),
    caps: z.object({ soft: count, hard: count }).strict().nullable(),
    turnsInSection: count,
    failedProbes: count,
    hintAllowed: z.boolean(),
    interruptedAnswerId: z.string().nullable(),
    endedEarly: z.boolean(),
    // absent in pre-Phase-6 session files
    pushbackDone: z.boolean().default(false),
    grillStartedAt: z.number().nullable().default(null),
    warmupDeadline: z.number().nullable().default(null)
  })
  .strict()

export const InterviewControlSchema = z
  .object({
    section: SectionEnum,
    section_status: z.enum(['continue', 'sufficient']),
    next_section: SectionEnum.optional(),
    probe_failed: z.boolean().optional(),
    hint_given: z.boolean().optional(),
    flags_surfaced: z.array(z.string()).optional(),
    flags_hinted: z.array(z.string()).optional(),
    evidence: z.string().optional(),
    numbers_checked: z
      .array(z.object({ claim: z.string(), correct: z.boolean() }).strict())
      .optional(),
    pushback_done: z.boolean().optional()
  })
  .strict()

/** Plain on purpose: 06-03 reuses it as the zodOutputFormat schema (no refinements/defaults/transforms). */
export const OpeningPlanSchema = z
  .object({
    recap: z.string(),
    recommendation: z.enum(['invest', 'pass', 'invest_at_price', 'unclear']),
    price: z.string().nullable(),
    considerations: z.array(
      z
        .object({ label: z.string(), section_id: SectionEnum, stance: z.enum(['for', 'against']) })
        .strict()
    ),
    order: z.array(SectionEnum)
  })
  .strict()

export const TurnSchema = z
  .object({
    id: z.string().min(1),
    speaker: z.enum(['interviewer', 'candidate']),
    phase: PhaseEnum,
    section: SectionEnum.optional(),
    text: z.string(),
    at: z.number(),
    ms: z.number().nonnegative().optional()
  })
  .strict()

export const PendingTurnSchema = z
  .object({
    kind: z.enum(['warmup', 'extraction', 'grill', 'wrapup', 'score']),
    section: SectionEnum.optional(),
    hintAllowed: z.boolean().optional()
  })
  .strict()

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Upgrades a pre-Phase-8 scorecard (evidence string, band strong/average/weak) to v2 so old
 * session files load instead of being quarantined. v2 and garbage pass through untouched.
 * `at` is the session's endedAt ?? startedAt (0 when called as a field-level preprocess).
 */
export function upgradeScorecard(raw: unknown, at?: unknown): unknown {
  if (!isObj(raw) || !Array.isArray(raw.rubric)) return raw
  const rubric = raw.rubric as unknown[]
  const first = rubric[0]
  const legacy =
    (isObj(first) && typeof first.evidence === 'string') ||
    ['strong', 'average', 'weak'].includes(raw.band as string)
  if (!legacy) return raw
  const total = typeof raw.total === 'number' ? raw.total : 0
  return {
    rubric: rubric.map((r, i) => {
      const row = isObj(r) ? r : {}
      return {
        id: DIMENSION_IDS[i],
        dimension: row.dimension,
        score: row.score,
        evidence: [],
        answerKey: row.answerKey,
        rationale: '',
        unverified: true
      }
    }),
    total: raw.total,
    band: total >= 26 ? 'ready' : total >= 20 ? 'close' : 'another',
    flags: Array.isArray(raw.flags)
      ? raw.flags.map((f) =>
          isObj(f) ? { id: f.id, flag: f.flag, status: f.status, where: '' } : f
        )
      : raw.flags,
    keep: '',
    fix: '',
    insight: { calledOut: [], missed: [] },
    summary: '',
    evidenceStats: { proposed: 0, verified: 0, dropped: 0 },
    checksSummary: {
      numbersCorrect: 0,
      numbersWrong: 0,
      numbersUnverifiable: 0,
      brevity: { short: 0, brief: 0, ideal: 0, long: 0, flagged: 0 },
      avgAnswerMs: null,
      ledWithCall: false,
      flagsFound: 0,
      flagsHinted: 0,
      flagsTotal: 0
    },
    graderModel: raw.graderModel,
    promptVersion: raw.promptVersion,
    scoredAt: typeof at === 'number' ? at : 0
  }
}

// Session-level pass stamps scoredAt from the session clock; the field-level one is a no-op on v2.
const upgradeSession = (raw: unknown): unknown => {
  if (!isObj(raw) || raw.scorecard === undefined) return raw
  return { ...raw, scorecard: upgradeScorecard(raw.scorecard, raw.endedAt ?? raw.startedAt) }
}

const SessionFileObject = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
    caseId: z.string().regex(/^\d{2}$/),
    startedAt: z.number(),
    endedAt: z.number().optional(),
    status: z.enum(['active', 'completed', 'abandoned']),
    warmup: z.boolean(),
    machineState: InterviewStateSchema,
    transcript: z.array(TurnSchema),
    controlLog: z.array(
      z.object({ at: z.number(), turnId: z.string(), control: InterviewControlSchema }).strict()
    ),
    timings: z.array(
      z
        .object({
          turnId: z.string(),
          kind: z.string(),
          startedAt: z.number(),
          firstTextAt: z.number().optional(),
          firstSentenceAt: z.number().optional(),
          doneAt: z.number(),
          usage: z
            .object({
              inputTokens: count,
              outputTokens: count,
              cacheRead: count,
              cacheWrite: count,
              stopReason: z.string().nullable()
            })
            .strict()
            .optional(),
          // REAL-clock ms (never the scaled app clock)
          latency: z
            .object({
              stopAt: z.number(),
              transcriptAt: z.number(),
              requestAt: z.number(),
              firstDeltaAt: z.number().optional(),
              firstSentenceAt: z.number().optional(),
              firstAudioAt: z.number().optional()
            })
            .strict()
            .optional(),
          interrupted: z.boolean().optional()
        })
        .strict()
    ),
    pending: PendingTurnSchema.nullable(),
    scorecard: z.preprocess(upgradeScorecard, ScorecardSchema).optional(),
    deckPage: z.number().int().min(1).max(500).optional(),
    openingPlan: OpeningPlanSchema.optional()
  })
  .strict()

export const SessionFileSchema = z.preprocess(upgradeSession, SessionFileObject)

export type SessionFile = z.infer<typeof SessionFileSchema>
export type Turn = z.infer<typeof TurnSchema>
export type PendingTurn = z.infer<typeof PendingTurnSchema>

// Compile-time guards: the reducer types and the persisted schema must stay identical.
const _is: InterviewState = {} as z.infer<typeof InterviewStateSchema>
const _is2: z.infer<typeof InterviewStateSchema> = {} as InterviewState
const _ic: InterviewControl = {} as z.infer<typeof InterviewControlSchema>
const _ic2: z.infer<typeof InterviewControlSchema> = {} as InterviewControl
const _op: OpeningPlan = {} as z.infer<typeof OpeningPlanSchema>
const _op2: z.infer<typeof OpeningPlanSchema> = {} as OpeningPlan
void [_is, _is2, _ic, _ic2, _op, _op2]
