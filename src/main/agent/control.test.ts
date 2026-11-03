import { describe, expect, it } from 'vitest'
import { InterviewControlSchema } from '../store/sessionSchema'
import { INTERVIEW_CONTROL_TOOL, parseControl } from './control'

const ctx = { current: 'retention' as const, flagIds: ['F1', 'F2'] }
const valid = {
  section_id: 'retention',
  status: 'probing',
  probe_failed: true,
  hint_given: false,
  flags_surfaced: [
    { flag_id: 'F1', by: 'candidate' },
    { flag_id: 'F2', by: 'hint' }
  ],
  evidence: 'GRR is ninety five',
  numbers_checked: [{ claim: 'GRR 95%', correct: false }],
  next_section: null,
  pushback_done: false
}

describe('parseControl', () => {
  it('given a valid probing input, when parsed, then it maps to the reducer control', () => {
    const r = parseControl(valid, ctx)
    expect(r.anomalies).toEqual([])
    expect(r.control).toEqual({
      section: 'retention',
      section_status: 'continue',
      probe_failed: true,
      hint_given: false,
      flags_surfaced: ['F1', 'F2'],
      flags_hinted: ['F2'],
      evidence: 'GRR is ninety five',
      numbers_checked: [{ claim: 'GRR 95%', correct: false }],
      pushback_done: false
    })
    expect(r.control).not.toHaveProperty('next_section')
  })

  it('given sufficient with next_section, when parsed, then both carry over', () => {
    const r = parseControl({ ...valid, status: 'sufficient', next_section: 'valuation' }, ctx)
    expect(r.control?.section_status).toBe('sufficient')
    expect(r.control?.next_section).toBe('valuation')
  })

  it('given an unknown flag id, when parsed, then it is dropped and counted', () => {
    const r = parseControl(
      { ...valid, flags_surfaced: [...valid.flags_surfaced, { flag_id: 'ZZ', by: 'hint' }] },
      ctx
    )
    expect(r.control?.flags_surfaced).toEqual(['F1', 'F2'])
    expect(r.control?.flags_hinted).toEqual(['F2'])
    expect(r.anomalies).toContain('unknown_flags:1')
  })

  it('given a section_id unlike the current section, when parsed, then current wins', () => {
    const r = parseControl({ ...valid, section_id: 'industry' }, ctx)
    expect(r.control?.section).toBe('retention')
    expect(r.anomalies).toContain('section_mismatch')
  })

  it('given no current section, when parsed, then section_id is used', () => {
    const r = parseControl({ ...valid, section_id: 'industry' }, { ...ctx, current: undefined })
    expect(r.control?.section).toBe('industry')
    expect(r.anomalies).toEqual([])
  })

  it('given undefined input, when parsed, then control is null with missing', () => {
    expect(parseControl(undefined, ctx)).toEqual({ control: null, anomalies: ['missing'] })
  })

  it('given wrong types or missing keys, when parsed, then control is null with invalid', () => {
    expect(parseControl({ ...valid, status: 'done' }, ctx)).toEqual({
      control: null,
      anomalies: ['invalid']
    })
    const { evidence: _e, ...missing } = valid
    expect(parseControl(missing, ctx)).toEqual({ control: null, anomalies: ['invalid'] })
    expect(parseControl('nope', ctx)).toEqual({ control: null, anomalies: ['invalid'] })
  })

  it('given a mapped control, when persisted, then InterviewControlSchema accepts it', () => {
    const r = parseControl({ ...valid, status: 'sufficient', next_section: 'call' }, ctx)
    expect(() => InterviewControlSchema.parse(r.control)).not.toThrow()
  })
})

describe('INTERVIEW_CONTROL_TOOL', () => {
  it('given the tool, when inspected, then it is frozen, strict and requires all 9 props', () => {
    const t = INTERVIEW_CONTROL_TOOL
    expect(Object.isFrozen(t)).toBe(true)
    expect(Object.isFrozen(t.input_schema)).toBe(true)
    expect(Object.isFrozen(t.input_schema.properties)).toBe(true)
    expect(t.strict).toBe(true)
    expect(t.name).toBe('interview_control')
    expect(t.description).toContain("at most 15 words, the candidate's own words")
    const req = t.input_schema.required as readonly string[]
    expect(req).toHaveLength(9)
    expect([...req].sort()).toEqual(Object.keys(t.input_schema.properties ?? {}).sort())
  })
})
