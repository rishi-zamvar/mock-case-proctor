import { describe, expect, it } from 'vitest'
import { SECTION_CATALOG, SECTION_IDS, mergePlan, turnCaps, type RubricDimension } from './sections'

const ALL_DIMS: RubricDimension[] = [
  'Clear call',
  'Lead Edge 8',
  'Retention insight',
  'Valuation and comps',
  'Return back-solve',
  'Business quality and poise'
]

describe('SECTION_CATALOG', () => {
  it('lists ids in SECTION_IDS order', () => {
    expect(SECTION_CATALOG.map((s) => s.id)).toEqual([...SECTION_IDS])
  })
  it.each(ALL_DIMS)('covers rubric dimension %s', (dim) => {
    expect(SECTION_CATALOG.some((s) => s.rubric.includes(dim))).toBe(true)
  })
})

describe('mergePlan', () => {
  it.each([
    {
      name: 'given order first, then missing in catalog order',
      order: ['retention', 'business'],
      plan: ['retention', 'business', 'lead_edge_8', 'industry', 'diligence', 'valuation', 'call'],
      omitted: ['lead_edge_8', 'industry', 'diligence', 'valuation']
    },
    {
      name: 'duplicates deduped',
      order: ['business', 'business'],
      plan: ['business', 'lead_edge_8', 'retention', 'industry', 'diligence', 'valuation', 'call'],
      omitted: ['lead_edge_8', 'retention', 'industry', 'diligence', 'valuation']
    },
    {
      name: 'unknown ids dropped',
      order: ['bogus', 'retention'],
      plan: ['retention', 'business', 'lead_edge_8', 'industry', 'diligence', 'valuation', 'call'],
      omitted: ['business', 'lead_edge_8', 'industry', 'diligence', 'valuation']
    },
    {
      name: 'call given first goes last and is not omitted',
      order: ['call', 'business'],
      plan: ['business', 'lead_edge_8', 'retention', 'industry', 'diligence', 'valuation', 'call'],
      omitted: ['lead_edge_8', 'retention', 'industry', 'diligence', 'valuation']
    },
    {
      name: 'full catalog order omits nothing',
      order: [...SECTION_IDS],
      plan: [...SECTION_IDS],
      omitted: []
    },
    {
      name: 'empty order gives full catalog',
      order: [],
      plan: [...SECTION_IDS],
      omitted: SECTION_IDS.filter((s) => s !== 'call')
    }
  ])('$name', ({ order, plan, omitted }) => {
    expect(mergePlan(order)).toEqual({ plan, omitted })
  })
})

describe('turnCaps', () => {
  it.each([
    [25, 7, 3, 5],
    [60, 7, 6, 8],
    [5, 7, 3, 5],
    [40, 7, 5, 7]
  ])('budget %i min over %i sections → soft %i hard %i', (budget, count, soft, hard) => {
    expect(turnCaps(budget, count)).toEqual({ soft, hard })
  })
})
