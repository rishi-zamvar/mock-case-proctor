// Record-only interview_control tool (INT-06). Code, not the model, decides what a control means:
// invalid or missing input -> null (treated as probing). Anomaly codes never carry model text.
import type { Tool } from '@anthropic-ai/sdk/resources/messages'
import { z } from 'zod'
import { SECTION_IDS, type SectionId } from '../domain/machine/sections'
import type { InterviewControl } from '../domain/machine/interviewMachine'

const deepFreeze = <T>(o: T): T => {
  if (o && typeof o === 'object') {
    for (const v of Object.values(o)) deepFreeze(v)
    Object.freeze(o)
  }
  return o
}

// Byte-stable: part of the cached prefix. Matches 06-RESEARCH "interview_control schema" exactly.
export const INTERVIEW_CONTROL_TOOL: Tool = deepFreeze({
  name: 'interview_control',
  strict: true,
  description:
    'Record-only bookkeeping. Call exactly once at the END of every turn, AFTER your spoken reply. ' +
    "Never mention it. evidence: at most 15 words, the candidate's own words. " +
    "status=sufficient only when the section's probes have been tested. flags_surfaced uses flag ids from the evaluation key.",
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      section_id: { type: 'string', enum: [...SECTION_IDS] },
      status: { type: 'string', enum: ['probing', 'sufficient'] },
      probe_failed: { type: 'boolean' },
      hint_given: { type: 'boolean' },
      flags_surfaced: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            flag_id: { type: 'string' },
            by: { type: 'string', enum: ['candidate', 'hint'] }
          },
          required: ['flag_id', 'by']
        }
      },
      evidence: { type: 'string' },
      numbers_checked: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: { claim: { type: 'string' }, correct: { type: 'boolean' } },
          required: ['claim', 'correct']
        }
      },
      next_section: { anyOf: [{ type: 'string', enum: [...SECTION_IDS] }, { type: 'null' }] },
      pushback_done: { type: 'boolean' }
    },
    required: [
      'section_id',
      'status',
      'probe_failed',
      'hint_given',
      'flags_surfaced',
      'evidence',
      'numbers_checked',
      'next_section',
      'pushback_done'
    ]
  }
})

const Section = z.enum(SECTION_IDS)
const RawControl = z
  .object({
    section_id: Section,
    status: z.enum(['probing', 'sufficient']),
    probe_failed: z.boolean(),
    hint_given: z.boolean(),
    flags_surfaced: z.array(
      z.object({ flag_id: z.string(), by: z.enum(['candidate', 'hint']) }).strict()
    ),
    evidence: z.string(),
    numbers_checked: z.array(z.object({ claim: z.string(), correct: z.boolean() }).strict()),
    next_section: Section.nullable(),
    pushback_done: z.boolean()
  })
  .strict()

export function parseControl(
  input: unknown,
  ctx: { current: SectionId | undefined; flagIds: readonly string[] }
): { control: InterviewControl | null; anomalies: string[] } {
  if (input === undefined) return { control: null, anomalies: ['missing'] }
  const r = RawControl.safeParse(input)
  if (!r.success) return { control: null, anomalies: ['invalid'] }
  const raw = r.data
  const anomalies: string[] = []

  const known = raw.flags_surfaced.filter((f) => ctx.flagIds.includes(f.flag_id))
  const unknown = raw.flags_surfaced.length - known.length
  if (unknown > 0) anomalies.push(`unknown_flags:${unknown}`)
  if (ctx.current && raw.section_id !== ctx.current) anomalies.push('section_mismatch')

  const control: InterviewControl = {
    section: ctx.current ?? raw.section_id,
    section_status: raw.status === 'probing' ? 'continue' : 'sufficient',
    probe_failed: raw.probe_failed,
    hint_given: raw.hint_given,
    flags_surfaced: known.map((f) => f.flag_id),
    flags_hinted: known.filter((f) => f.by === 'hint').map((f) => f.flag_id),
    evidence: raw.evidence,
    numbers_checked: raw.numbers_checked,
    pushback_done: raw.pushback_done
  }
  if (raw.next_section) control.next_section = raw.next_section
  return { control, anomalies }
}
