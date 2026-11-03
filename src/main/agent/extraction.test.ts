import { describe, expect, it } from 'vitest'
import type { OpeningPlan } from '../ports'
import { SECTION_IDS, mergePlan } from '../domain/machine/sections'
import { EXTRACT_SYSTEM, toExtractResult } from './extraction'

const plan = (over: Partial<OpeningPlan> = {}): OpeningPlan => ({
  recap: 'vertical SaaS for dentists',
  recommendation: 'invest',
  price: null,
  considerations: [
    { label: 'market tailwind', section_id: 'industry', stance: 'for' },
    { label: 'system of record', section_id: 'business', stance: 'for' },
    { label: 'comps', section_id: 'industry', stance: 'for' },
    { label: 'GRR', section_id: 'retention', stance: 'against' },
    { label: '3x', section_id: 'valuation', stance: 'for' }
  ],
  order: ['business', 'valuation', 'industry', 'retention'],
  ...over
})

describe('toExtractResult', () => {
  it('given considerations, when mapped, then order follows what was said, not plan.order', () => {
    const p = plan()
    const r = toExtractResult(p)
    expect(r.order).toEqual(['industry', 'business', 'retention', 'valuation'])
    expect(r.plan).toBe(p)
  })

  it('given empty considerations, when mapped, then it falls back to plan.order', () => {
    expect(toExtractResult(plan({ considerations: [] })).order).toEqual([
      'business',
      'valuation',
      'industry',
      'retention'
    ])
  })

  it('given a failed extraction, when mapped, then order is empty and every section is omitted', () => {
    for (const p of [null, undefined]) {
      const r = toExtractResult(p)
      expect(r).toEqual({ order: [] })
      expect(r).not.toHaveProperty('plan')
      const m = mergePlan(r.order)
      expect(m.plan).toHaveLength(SECTION_IDS.length)
      expect(m.omitted).toEqual(SECTION_IDS.filter((s) => s !== 'call'))
    }
  })
})

describe('EXTRACT_SYSTEM', () => {
  it('given the prompt, when inspected, then it treats candidate_said as data and lists every section', () => {
    expect(EXTRACT_SYSTEM).toContain('<candidate_said>')
    expect(EXTRACT_SYSTEM.toLowerCase()).toContain('data')
    for (const id of SECTION_IDS) expect(EXTRACT_SYSTEM).toContain(id)
    expect(EXTRACT_SYSTEM.toLowerCase()).not.toContain('rubric')
    expect(EXTRACT_SYSTEM.toLowerCase()).not.toContain('answer key')
    expect(EXTRACT_SYSTEM.length).toBeLessThan(2000)
  })
})
