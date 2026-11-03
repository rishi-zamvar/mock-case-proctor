// Main-only interviewer brief (LIB-03). Never import this from src/shared, preload or renderer.
import type { LeakSource } from '../text/leakGuard'
import { splitPages } from './deckText'
import { makeResolver, resolveDeep, type Tokens } from './resolve'

type FlagRow = {
  id: string
  flag: string
  kind: string
  role: string
  templates: string[]
  anchor: string
  notice: string
  say: string
}

export interface InterviewerBrief extends LeakSource {
  caseId: string
  level: number
  company: { name: string; oneLiner: string; tagline: string }
  vertical: string
  intendedRead: { short: string; bucket: string; sentence: string; answerKey: unknown }
  business: { plain: string; facts: { label: string; text: string }[] }
  glossary: { term: string; def: string }[]
  deckFacts: { deckNumbers: unknown[]; snapshot: unknown[] }
  deckPages: string[]
  leadEdge8: {
    rows: unknown[]
    weakest: unknown
    weakestWhy: unknown
    scores: unknown
    lines: unknown
  }
  flags: {
    hidden: unknown[]
    map: FlagRow[]
    deliberateOmissions: string
    bankerRationale: string | null
    bankerRationaleWhy: string | null
  }
  mustPullOuts: unknown[]
  whatItTests: { skill: string; evidence: string }[]
  comps: { iv: unknown; pb: unknown[]; rows: unknown[] }
  precedents: unknown[]
  kpis: unknown[]
  tailwinds: unknown[]
  headwinds: unknown[]
  exitBuyers: unknown[]
  backSolve: unknown
  priceLadder: { acceptedCalls: unknown[]; condition: unknown; header: unknown }
  pushback: {
    questions: unknown[]
    mustAsk: unknown[]
    convinceMe: unknown
    convinceMeStrong: unknown
    doNotUseUnlessRaised: unknown[]
    genericBank: unknown[]
  }
  rubric: { dimension: string; five: string; one: string }[]
  rubricExtras: unknown
  idealAnswer: string
  modelAnswer: Record<string, string>
  memorize: { label: string; text: string }[]
  traps: string[]
  annotations: unknown[]
}

// Untyped case JSON; every field is picked explicitly and resolved (never spread).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any

export function buildBrief(data: unknown, deckText: string): InterviewerBrief {
  const d = data as J
  const r = makeResolver(d as { tokens: Tokens })
  const R = <T>(x: T): T => resolveDeep(x, r)
  const iv = d.interviewer
  const ak = d.answer_key
  const pb = iv.prep_brief
  const s2 = iv.s2_answer_key
  const fm = iv.s3_flag_map
  const s8 = iv.s8_scoring

  const idealAnswer: string = R(pb.ideal_answer)
  const modelAnswer: Record<string, string> = R(iv.s7_model_answer)
  const map: FlagRow[] = R(fm.rows)
  const rubric = (R(s8.rubric) as [string, string, string][]).map(([dimension, five, one]) => ({
    dimension,
    five,
    one
  }))
  const whatItTests: { skill: string; evidence: string }[] = R(pb.tests)

  return {
    caseId: d.case_id,
    level: d.level,
    company: R({ name: d.company.name, oneLiner: d.company.one_liner, tagline: d.company.tagline }),
    vertical: R(d.vertical),
    intendedRead: R({
      short: d.intended_read_short,
      bucket: d.intended_read_bucket,
      sentence: d.intended_read_sentence,
      answerKey: ak.intended_read
    }),
    business: R({ plain: pb.business, facts: pb.business_facts }),
    glossary: R(pb.glossary),
    deckFacts: R({ deckNumbers: d.deck_numbers, snapshot: s2.snapshot }),
    deckPages: splitPages(deckText),
    deckText,
    leadEdge8: R({
      rows: ak.lead_edge_8,
      weakest: ak.weakest,
      weakestWhy: ak.weakest_why,
      scores: ak.scores,
      lines: {
        weakest: s2.weakest_line,
        ntm: s2.ntm_line,
        boundary: s2.boundary_line,
        ruleOf40: s2.rule_of_40,
        lifetimeBurn: s2.lifetime_burn
      }
    }),
    flags: {
      hidden: R(d.hidden_flags),
      map,
      deliberateOmissions: R(fm.deliberate_omissions),
      bankerRationale: R(fm.banker_rationale ?? null),
      bankerRationaleWhy: R(fm.banker_rationale_why ?? null)
    },
    mustPullOuts: R(pb.pull_outs),
    whatItTests,
    comps: R({ iv: iv.s5_comps, pb: pb.comps, rows: pb.comps_rows }),
    precedents: R(pb.precedents ?? []),
    kpis: R(pb.kpis ?? []),
    tailwinds: R(pb.tailwinds ?? []),
    headwinds: R(pb.headwinds ?? []),
    exitBuyers: R(pb.exit_buyers ?? []),
    backSolve: R(ak.back_solve),
    priceLadder: R({
      acceptedCalls: ak.accepted_calls,
      condition: ak.accepted_calls_condition,
      header: iv.s1_cover.accepted_calls_header
    }),
    pushback: R({
      questions: iv.s6_pushback.questions,
      mustAsk: iv.s1_cover.must_ask,
      convinceMe: iv.s1_cover.convince_me,
      convinceMeStrong: iv.s6_pushback.convince_me_strong,
      doNotUseUnlessRaised: iv.s6_pushback.do_not_use_unless_raised ?? [],
      genericBank: iv.s6_pushback.generic_bank ?? []
    }),
    rubric,
    rubricExtras: R({
      rubric5: s8.rubric_5,
      rubric3: s8.rubric_3,
      rubric1: s8.rubric_1,
      bonus: s8.bonus,
      debrief: s8.debrief,
      notes: s8.notes
    }),
    idealAnswer,
    modelAnswer,
    memorize: R(pb.memorize ?? []),
    traps: R(pb.traps ?? []),
    annotations: R(iv.s9_annotations ?? []),
    // BAR-03 sources: what the interviewer must never read out.
    leakSources: [
      idealAnswer,
      ...Object.values(modelAnswer),
      ...map.map((f) => f.say),
      ...rubric.flatMap((x) => [x.five, x.one]),
      ...whatItTests.map((t) => t.evidence)
    ].filter(Boolean)
  }
}
