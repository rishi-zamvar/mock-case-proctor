export const SECTION_IDS = [
  'business',
  'lead_edge_8',
  'retention',
  'industry',
  'diligence',
  'valuation',
  'call'
] as const
export type SectionId = (typeof SECTION_IDS)[number]

export type RubricDimension =
  | 'Clear call'
  | 'Lead Edge 8'
  | 'Retention insight'
  | 'Valuation and comps'
  | 'Return back-solve'
  | 'Business quality and poise'

export const SECTION_CATALOG: readonly {
  id: SectionId
  label: string
  rubric: readonly RubricDimension[]
}[] = [
  { id: 'business', label: 'Business overview', rubric: ['Business quality and poise'] },
  { id: 'lead_edge_8', label: 'Lead Edge 8', rubric: ['Lead Edge 8'] },
  { id: 'retention', label: 'Retention', rubric: ['Retention insight'] },
  { id: 'industry', label: 'Industry and comps', rubric: ['Valuation and comps'] },
  { id: 'diligence', label: 'Diligence', rubric: ['Business quality and poise'] },
  {
    id: 'valuation',
    label: 'Valuation (work back to 3x)',
    rubric: ['Return back-solve', 'Valuation and comps']
  },
  { id: 'call', label: 'The call', rubric: ['Clear call'] }
]

const isSectionId = (s: string): s is SectionId => (SECTION_IDS as readonly string[]).includes(s)

/** Candidate's order first (deduped, unknowns dropped), missing sections appended as omitted, call always last. */
export function mergePlan(order: readonly string[]): { plan: SectionId[]; omitted: SectionId[] } {
  const plan: SectionId[] = []
  for (const s of order) if (isSectionId(s) && s !== 'call' && !plan.includes(s)) plan.push(s)
  const omitted = SECTION_IDS.filter((s) => s !== 'call' && !plan.includes(s))
  return { plan: [...plan, ...omitted, 'call'], omitted }
}

/** ~75 s per turn over the budget, split across sections, clamped to 3-6; hard cap = soft + 2. */
export function turnCaps(budgetMin: number, sectionCount: number): { soft: number; hard: number } {
  const turns = Math.round((budgetMin * 60) / 75)
  const soft = Math.min(6, Math.max(3, Math.round(turns / sectionCount)))
  return { soft, hard: soft + 2 }
}
