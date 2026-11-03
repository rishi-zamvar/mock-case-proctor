// Versioned session.json schema (REV-05). Main-only: files on disk are a trust boundary.
import { z } from 'zod'
import { SECTION_IDS } from '../domain/machine/sections'
import type { InterviewControl, InterviewState } from '../domain/machine/interviewMachine'
import type { OpeningPlan } from '../ports'
import { ScorecardSchema } from '../../shared/schemas'

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

export const SessionFileSchema = z
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
            .optional()
        })
        .strict()
    ),
    pending: PendingTurnSchema.nullable(),
    scorecard: ScorecardSchema.optional(),
    deckPage: z.number().int().min(1).max(500).optional(),
    openingPlan: OpeningPlanSchema.optional()
  })
  .strict()

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
