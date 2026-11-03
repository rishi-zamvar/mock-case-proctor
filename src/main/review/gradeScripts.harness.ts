// Hand-written fictional case_99 (Fixturely) sessions for grader replay/live evals (test-only).
// Strong / average / weak are deliberately far apart. Never put real case content here.
import type { InterviewControl } from '../domain/machine/interviewMachine'
import type { SectionId } from '../domain/machine/sections'
import type { OpeningPlan, ScoreInput } from '../ports'
import type { Turn } from '../store/sessionSchema'

type Line = [speaker: 'i' | 'c', section: SectionId | null, text: string, ms?: number]
type Ctl = { turn: number; control: InterviewControl }

const T0 = 1_000_000

function build(lines: Line[]): Turn[] {
  let at = T0
  return lines.map(([who, section, text, ms], i) => {
    const t: Turn = {
      id: `t${i}`,
      speaker: who === 'c' ? 'candidate' : 'interviewer',
      phase: section ? 'grilling' : 'presentation',
      text,
      at
    }
    if (section) t.section = section
    if (who === 'c') t.ms = ms ?? 45_000
    at += (ms ?? 8_000) + 2_000
    return t
  })
}

export const STRONG: Turn[] = build([
  [
    'c',
    null,
    "Pass at 4.1x; I'd invest at $30M pre. Fixturely sells test-fixture software to QA teams at $9.9M ARR growing 40%, " +
      'which is a solid growth-bucket asset, but the headline retention flatters the base and the ask needs a 31% CAGR against our 25% underwrite. ' +
      "I'll walk the Lead Edge 8, then retention, valuation and the return back-solve.",
    55_000
  ],
  ['i', 'lead_edge_8', 'Go ahead, give me the Lead Edge 8 quickly.'],
  [
    'c',
    'lead_edge_8',
    'Growth at 40% passes, it is mission critical for QA teams, and the market is large. Capital efficiency I cannot score because there is no burn bridge in the deck. ' +
      'The weakest criterion is retention quality, because the GRR is only measured on tenured customers, and that is the one that decides the price.',
    52_000
  ],
  ['i', 'retention', 'Walk me through retention.'],
  [
    'c',
    'retention',
    'Net retention is 104% but gross retention is 85%, and the footnote says that 85% is for customers live 12 months or more only. ' +
      'So the all-cohort GRR is likely worse, since young cohorts churn most. NRR barely above 100 means expansion only just covers churn. ' +
      'I would ask for retention by cohort including year-one customers before signing.',
    58_000
  ],
  ['i', 'retention', 'Anything else in that footnote?'],
  [
    'c',
    'retention',
    'Yes, some customers prepay two years, so cash and billings run ahead of ARR. I would not treat the cash balance as proof of efficiency, ' +
      'and I want the renewal schedule for those prepaid contracts because a cliff could hit in year two.',
    48_000
  ],
  ['i', 'valuation', 'Talk to me about price.'],
  [
    'c',
    'valuation',
    'At 4.1x the post-money is $34M. For a 40% grower with 104% NRR the growth-bucket peers trade nearer 3x, and a vertical peer with better retention would justify the premium, this one does not. ' +
      'So I anchor at 3x and adjust down for the tenured-only GRR.',
    50_000
  ],
  ['i', 'valuation', 'What return does that ask need?'],
  [
    'c',
    'valuation',
    'To make our target on a $34M post we need $102M of exit equity, which back-solves to a 31% CAGR versus the 25% we would underwrite. ' +
      'At $30M pre it works, and the breakeven pre is $12M on the downside case, so the price, not the business, is the problem.',
    55_000
  ],
  ['i', 'call', 'Convince me. The growth is great, why not just pay up?'],
  [
    'c',
    'call',
    'Because 40% growth with 85% gross retention on tenured customers only is not the same as durable growth. ' +
      'If cohort GRR comes back above 85% I would move, but on this data I hold my position: invest at $30M pre, pass at 4.1x.',
    45_000
  ]
])

export const AVERAGE: Turn[] = build([
  [
    'c',
    null,
    "Fixturely is a QA software company at $9.9M ARR growing 40%. I think I'd invest, but at a lower price than the ask. " +
      "I'll cover the business, retention and valuation.",
    50_000
  ],
  ['i', 'lead_edge_8', 'How does it screen on the Lead Edge 8?'],
  [
    'c',
    'lead_edge_8',
    'It passes growth and the market looks big. I am less sure on profitability because the deck is light there. Overall it passes most of the criteria.',
    40_000
  ],
  ['i', 'retention', 'Tell me about retention.'],
  [
    'c',
    'retention',
    'Net retention is 104% and gross retention is 85%, so customers mostly stay and some expand. That seems fine for a company this size, ' +
      'and I think the expansion story is decent. I would want to understand the churn reasons a bit more, maybe by talking to customers, ' +
      'and I would also want to look at the sales pipeline and how the new logos are trending because that drives most of the growth here.',
    95_000
  ],
  ['i', 'retention', 'Look at who that 85% covers. Read the footnote on the retention slide.'],
  [
    'c',
    'retention',
    'Right, it only covers customers live 12 months or more, so the real GRR is probably lower. That makes me more cautious.',
    35_000
  ],
  ['i', 'valuation', 'What about price?'],
  [
    'c',
    'valuation',
    'The ask is 4.1x, which feels a bit high. Peers trade at something like 3x, so I would want a discount.',
    35_000
  ],
  ['i', 'valuation', 'What return would the ask need?'],
  [
    'c',
    'valuation',
    'The post-money is $34M, so we need a pretty big exit, maybe around $100M. I have not worked out the exact CAGR but it feels like a stretch.',
    45_000
  ],
  ['i', 'call', 'Convince me. Why not pay the ask?'],
  [
    'c',
    'call',
    'I think the retention risk means we should push on price, but if the team is strong I could be talked into it.',
    30_000
  ]
])

export const WEAK: Turn[] = build([
  [
    'c',
    null,
    'Fixturely makes software for test teams. It has about $9.9M of revenue and it is growing quickly, and the team seems good. ' +
      'The product looks useful and customers seem to like it. There are a lot of numbers in the deck which all look healthy.',
    85_000
  ],
  ['i', 'call', 'So what is your recommendation?'],
  ['c', 'call', 'I guess I would invest, it looks like a good company.', 10_000],
  ['i', 'retention', 'How is retention?'],
  [
    'c',
    'retention',
    'NRR is 104%, which is above 100, so customers are growing with them. GRR is about 95%, so churn is not really a concern. ' +
      'Retention looks strong overall and I would not worry about it. They also have good customer logos and the product is sticky, ' +
      'so I think retention will stay strong for the next few years, and that supports the growth story overall.',
    100_000
  ],
  ['i', 'valuation', 'What do you think of the price?'],
  [
    'c',
    'valuation',
    'The 4.1x seems okay for a company growing this fast. Software companies trade at high multiples, so I think the price is fair ' +
      'and we should not lose the deal over it. I have not really looked at comps but it seems in line with the market, ' +
      'and if it keeps growing we will be fine on the return.',
    95_000
  ],
  ['i', 'call', 'Convince me. Why should we not pass at this price?'],
  ['c', 'call', 'You are right, maybe we should pass, the price is probably too high.', 12_000]
])

const ctl = (section: SectionId, over: Partial<InterviewControl> = {}): InterviewControl => ({
  section,
  section_status: 'sufficient',
  ...over
})

export const CONTROLS: Record<'strong' | 'average' | 'weak', Ctl[]> = {
  strong: [
    { turn: 2, control: ctl('lead_edge_8') },
    { turn: 4, control: ctl('retention', { section_status: 'continue', flags_surfaced: ['f1'] }) },
    { turn: 6, control: ctl('retention', { flags_surfaced: ['f2'] }) },
    { turn: 8, control: ctl('valuation', { section_status: 'continue' }) },
    { turn: 10, control: ctl('valuation') },
    { turn: 12, control: ctl('call', { pushback_done: true }) }
  ],
  average: [
    { turn: 2, control: ctl('lead_edge_8') },
    { turn: 4, control: ctl('retention', { section_status: 'continue', probe_failed: true }) },
    {
      turn: 6,
      control: ctl('retention', { hint_given: true, flags_hinted: ['f1'] })
    },
    { turn: 8, control: ctl('valuation', { section_status: 'continue' }) },
    { turn: 10, control: ctl('valuation') },
    { turn: 12, control: ctl('call', { pushback_done: true }) }
  ],
  weak: [
    { turn: 2, control: ctl('call', { section_status: 'continue' }) },
    { turn: 4, control: ctl('retention', { probe_failed: true }) },
    { turn: 6, control: ctl('valuation', { probe_failed: true }) },
    { turn: 8, control: ctl('call', { pushback_done: true }) }
  ]
}

const PLANS: Record<'strong' | 'average' | 'weak', OpeningPlan> = {
  strong: {
    recap: 'Pass at the ask, invest at a lower price',
    recommendation: 'invest_at_price',
    price: '$30M pre',
    considerations: [
      { label: 'Lead Edge 8', section_id: 'lead_edge_8', stance: 'for' },
      { label: 'Tenured-only retention', section_id: 'retention', stance: 'against' },
      { label: 'Price and return', section_id: 'valuation', stance: 'against' }
    ],
    order: ['lead_edge_8', 'retention', 'valuation']
  },
  average: {
    recap: 'Invest at a lower price',
    recommendation: 'invest_at_price',
    price: null,
    considerations: [
      { label: 'Business', section_id: 'business', stance: 'for' },
      { label: 'Retention', section_id: 'retention', stance: 'for' },
      { label: 'Valuation', section_id: 'valuation', stance: 'against' }
    ],
    order: ['business', 'retention', 'valuation']
  },
  weak: {
    recap: 'Describes the business',
    recommendation: 'unclear',
    price: null,
    considerations: [{ label: 'Business', section_id: 'business', stance: 'for' }],
    order: ['business']
  }
}

const OMITTED: Record<'strong' | 'average' | 'weak', SectionId[]> = {
  strong: [],
  average: ['industry'],
  weak: ['lead_edge_8', 'industry', 'diligence']
}

const which = (turns: Turn[]): 'strong' | 'average' | 'weak' =>
  turns === STRONG ? 'strong' : turns === AVERAGE ? 'average' : 'weak'

/** ScoreInput for one script; controls default to the script's own control log. */
export function scoreInputOf(turns: Turn[], controls?: Ctl[]): ScoreInput {
  const k = which(turns)
  const last = turns[turns.length - 1]
  return {
    transcript: turns,
    controlLog: (controls ?? CONTROLS[k]).map((c) => ({
      at: turns[c.turn].at,
      turnId: turns[c.turn].id,
      control: c.control
    })),
    endedEarly: false,
    omitted: OMITTED[k],
    openingPlan: PLANS[k],
    at: last.at + (last.ms ?? 0)
  }
}
