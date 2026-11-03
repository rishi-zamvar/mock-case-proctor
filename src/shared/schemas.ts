// Strict zod schemas for the IPC boundary (KEY-03). Main-only: the preload must never import this.
import { z } from 'zod'
import type {
  CaseCard,
  Intent,
  KeyStatus,
  LibraryView,
  SaveResult,
  Scorecard,
  SpeakCancel,
  SpeakEvent,
  SttStatus,
  ViewState
} from './ipc'

export const KeyStatusSchema = z
  .object({ hasKey: z.boolean(), source: z.enum(['stored', 'env', 'dotenv', 'none']) })
  .strict()

export const SaveResultSchema = z
  .object({
    status: KeyStatusSchema,
    result: z.enum(['valid', 'invalid', 'unverified', 'unavailable', 'empty'])
  })
  .strict()

export const SaveArgsSchema = z.tuple([
  z.string().max(1000),
  z.object({ force: z.boolean().optional() }).strict()
])

export const CaseCardSchema = z
  .object({
    id: z.string().regex(/^\d{2}$/),
    number: z.number().int(),
    slug: z.string().regex(/^[a-z0-9]+$/),
    company: z.string().min(1),
    vertical: z.string().min(1),
    level: z.number().int().min(1).max(3),
    intervieweePdfPath: z.string().endsWith('_interviewee_package.pdf')
  })
  .strict()

const ViewPhaseEnum = z.enum([
  'warmup',
  'review',
  'presentation',
  'extraction',
  'grilling',
  'wrapup',
  'scoring',
  'reviewMode'
])

export const TranscriptLineSchema = z
  .object({ id: z.string(), speaker: z.enum(['interviewer', 'candidate']), text: z.string() })
  .strict()

export const SectionViewSchema = z
  .object({ id: z.string(), label: z.string(), index: z.number().int(), total: z.number().int() })
  .strict()

export const RubricRowSchema = z
  .object({
    dimension: z.string(),
    score: z.number().int().min(1).max(5),
    evidence: z.string(),
    answerKey: z.string()
  })
  .strict()

export const ScorecardSchema = z
  .object({
    rubric: z.array(RubricRowSchema),
    total: z.number().int().min(0).max(30),
    band: z.enum(['strong', 'average', 'weak']),
    flags: z.array(
      z
        .object({ id: z.string(), flag: z.string(), status: z.enum(['found', 'hinted', 'missed']) })
        .strict()
    ),
    graderModel: z.string(),
    promptVersion: z.string()
  })
  .strict()

export const ChecksSchema = z
  .object({
    brevity: z.array(
      z
        .object({
          turnId: z.string(),
          ms: z.number(),
          band: z.enum(['short', 'brief', 'ideal', 'long', 'flagged'])
        })
        .strict()
    ),
    ledWithCall: z.boolean(),
    omitted: z.array(z.string()),
    numbers: z.array(z.object({ said: z.string(), expected: z.string(), ok: z.boolean() }).strict())
  })
  .strict()

export const RevealSchema = z
  .object({
    scorecard: ScorecardSchema,
    checks: ChecksSchema,
    idealAnswer: z.string(),
    opening: z.string(),
    keyNumbers: z.array(z.object({ label: z.string(), text: z.string() }).strict())
  })
  .strict()

// BAR-01: strict, and a reveal outside reviewMode is a schema error.
export const ViewStateSchema = z
  .object({
    sessionId: z.string(),
    phase: ViewPhaseEnum,
    card: CaseCardSchema,
    reviewDeadline: z.number().nullable(),
    clockNow: z.number(),
    timeScale: z.number().positive(),
    section: SectionViewSchema.nullable(),
    transcript: z.array(TranscriptLineSchema),
    speaking: z.boolean(),
    canTalk: z.boolean(),
    endedEarly: z.boolean(),
    reveal: RevealSchema.nullable(),
    deckPage: z.number().int().min(1),
    reviewWarned: z.boolean(),
    transcribing: z.boolean().optional()
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.reveal !== null && v.phase !== 'reviewMode')
      ctx.addIssue({ code: 'custom', path: ['reveal'], message: 'reveal only in reviewMode' })
  })

export const LibraryEntrySchema = z
  .object({
    card: CaseCardSchema,
    completed: z.object({ at: z.number(), score: z.number() }).strict().nullable()
  })
  .strict()

export const LibraryViewSchema = z
  .object({
    cases: z.array(LibraryEntrySchema),
    resumable: z
      .object({
        sessionId: z.string(),
        caseId: z.string(),
        company: z.string(),
        phase: ViewPhaseEnum
      })
      .strict()
      .nullable(),
    quarantined: z.number().int().nonnegative(),
    error: z.string().nullable()
  })
  .strict()

const AnswerIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/)

export const IntentSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('answer'),
      ms: z.number().int().min(0).max(600_000),
      answerId: AnswerIdSchema.optional(),
      chunks: z.number().int().min(0).max(32).optional()
    })
    .strict(),
  z.object({ type: z.literal('bargeIn') }).strict(),
  z.object({ type: z.literal('ready') }).strict(),
  z.object({ type: z.literal('skipWarmup') }).strict(),
  z.object({ type: z.literal('end') }).strict(),
  z.object({ type: z.literal('deckPage'), page: z.number().int().min(1).max(500) }).strict()
])

export const StartArgsSchema = z.tuple([
  z.string().regex(/^\d{2}$/),
  z.object({ warmup: z.boolean() }).strict()
])
export const IdArgsSchema = z.tuple([z.string().regex(/^[A-Za-z0-9_-]{1,80}$/)])
export const AckArgsSchema = z.tuple([
  z.string().min(1).max(80),
  z.number().int().min(0),
  z.boolean().optional()
])
export const StartedArgsSchema = z.tuple([z.string().min(1).max(80), z.number().int().min(0)])
// ponytail: 310 s cap per chunk (renderer sends ~20 s chunks); 32 chunks bounds one answer.
export const SttChunkArgsSchema = z.tuple([
  AnswerIdSchema,
  z.number().int().min(0).max(31),
  z.instanceof(Float32Array).refine((a) => a.length > 0 && a.length <= 16000 * 310)
])
export const SttStatusSchema = z.enum(['metal', 'cpu', 'failed', 'off'])
export const SpeakCancelSchema = z.object({ turnId: z.string().min(1).max(80) }).strict()

export const SpeakEventSchema = z
  .object({ turnId: z.string(), seq: z.number().int().min(0), text: z.string() })
  .strict()

// Compile-time guards: schemas and the shared contract must stay identical.
const _ks: KeyStatus = {} as z.infer<typeof KeyStatusSchema>
const _ks2: z.infer<typeof KeyStatusSchema> = {} as KeyStatus
const _sr: SaveResult = {} as z.infer<typeof SaveResultSchema>
const _sr2: z.infer<typeof SaveResultSchema> = {} as SaveResult
const _cc: CaseCard = {} as z.infer<typeof CaseCardSchema>
const _cc2: z.infer<typeof CaseCardSchema> = {} as CaseCard
const _vs: ViewState = {} as z.infer<typeof ViewStateSchema>
const _vs2: z.infer<typeof ViewStateSchema> = {} as ViewState
const _lv: LibraryView = {} as z.infer<typeof LibraryViewSchema>
const _lv2: z.infer<typeof LibraryViewSchema> = {} as LibraryView
const _in: Intent = {} as z.infer<typeof IntentSchema>
const _in2: z.infer<typeof IntentSchema> = {} as Intent
const _se: SpeakEvent = {} as z.infer<typeof SpeakEventSchema>
const _se2: z.infer<typeof SpeakEventSchema> = {} as SpeakEvent
const _sc: Scorecard = {} as z.infer<typeof ScorecardSchema>
const _sc2: z.infer<typeof ScorecardSchema> = {} as Scorecard
const _sx: SpeakCancel = {} as z.infer<typeof SpeakCancelSchema>
const _sx2: z.infer<typeof SpeakCancelSchema> = {} as SpeakCancel
const _st: SttStatus = {} as z.infer<typeof SttStatusSchema>
const _st2: z.infer<typeof SttStatusSchema> = {} as SttStatus
void [
  _st,
  _st2,
  _sx,
  _sx2,
  _ks,
  _ks2,
  _sr,
  _sr2,
  _cc,
  _cc2,
  _vs,
  _vs2,
  _lv,
  _lv2,
  _in,
  _in2,
  _se,
  _se2,
  _sc,
  _sc2
]
