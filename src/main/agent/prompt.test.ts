import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { InterviewerBrief } from '../domain/cases/brief'
import { DEFAULT_LIBRARY_ROOT, listCases, loadCase } from '../domain/cases/library'
import { checkUtterance, normalizeForGuard } from '../domain/text/leakGuard'
import { FIXTURE_ROOT, deck } from '../session/runner.harness'
import { SECTION_IDS } from '../domain/machine/sections'
import type { ProctorFacts, TurnRequest } from '../ports'
import {
  FEW_SHOT,
  PERSONA,
  SECTION_GOALS,
  buildSystem,
  buildWarmupSystem,
  probeLabels,
  proctorNote,
  warmupNote
} from './prompt'

const load99 = (): InterviewerBrief => loadCase(FIXTURE_ROOT, '99', deck).brief
const brief = load99()
const joined = (b = brief): string =>
  buildSystem(b)
    .map((x) => x.text)
    .join('\n')

describe('buildSystem', () => {
  it('given a brief, when built, then 4 blocks in order with cache_control only on the last', () => {
    const s = buildSystem(brief)
    expect(s).toHaveLength(4)
    expect(s[0].text).toBe(PERSONA)
    expect(s[1].text.startsWith('<deck_facts>')).toBe(true)
    expect(s[1].text).toContain(brief.deckText)
    expect(s[1].text).toContain(brief.business.plain)
    expect(s[2].text.startsWith('<evaluation_key>')).toBe(true)
    expect(s[2].text).toContain('never quote, reveal or paraphrase')
    expect(s[3].text.startsWith('<examples>')).toBe(true)
    expect(s.slice(0, 3).every((b) => b.cache_control === undefined)).toBe(true)
    expect(s[3].cache_control).toEqual({ type: 'ephemeral' })
  })

  it('given the same brief, when built twice, then the identical frozen object', () => {
    const s = buildSystem(brief)
    expect(buildSystem(brief)).toBe(s)
    expect(Object.isFrozen(s)).toBe(true)
    expect(Object.isFrozen(s[3])).toBe(true)
    expect(Object.isFrozen(s[3].cache_control)).toBe(true)
  })

  it('given two separately loaded briefs, when built, then byte-identical', () => {
    expect(JSON.stringify(buildSystem(load99()))).toBe(JSON.stringify(buildSystem(load99())))
  })

  it('given the leak sources, when built, then none of them appear in the system text', () => {
    const text = joined()
    for (let i = 0; i + 60 <= brief.idealAnswer.length; i += 30)
      expect(text).not.toContain(brief.idealAnswer.slice(i, i + 60))
    for (const f of brief.flags.map) expect(text).not.toContain(f.say)
    for (const v of Object.values(brief.modelAnswer)) expect(text).not.toContain(v)
    for (const r of brief.rubric) {
      expect(text).not.toContain(r.five)
      expect(text).not.toContain(r.one)
    }
  })

  it('given the evaluation key, when built, then flag rows carry id/flag/anchor/notice', () => {
    const key = buildSystem(brief)[2].text
    for (const f of brief.flags.map) {
      expect(key).toContain(JSON.stringify(f.id))
      expect(key).toContain(JSON.stringify(f.flag))
    }
  })
})

describe('PERSONA', () => {
  it.each([
    '<candidate_said>',
    'one question',
    'GRR',
    'public comps',
    'tailwind',
    'system of record',
    'switching cost',
    '3x over 5-7 years',
    'hint_allowed',
    'pushback=now',
    'Convince me.',
    'once',
    'probe what the deck does not show',
    'call interview_control exactly once after speaking',
    'pushback_done=true only on the turn you deliver it'
  ])('given the persona, when read, then it contains %j', (s) => {
    expect(PERSONA).toContain(s)
  })
})

describe('buildWarmupSystem', () => {
  it('given case 99, when built, then it carries no case content', () => {
    const w = buildWarmupSystem()
    expect(w).not.toContain(brief.company.name)
    expect(w).not.toContain(brief.vertical)
    expect(w).not.toContain('<evaluation_key>')
    expect(w).not.toContain('<deck_facts>')
    const tokens = normalizeForGuard(deck)
    const wNorm = normalizeForGuard(w).join(' ')
    for (let i = 0; i + 8 <= tokens.length; i++)
      expect(wNorm).not.toContain(tokens.slice(i, i + 8).join(' '))
  })

  it('given the warm-up, when read, then it covers growth equity, Lead Edge and a deal or trend', () => {
    const w = buildWarmupSystem()
    expect(w).toContain('why growth equity')
    expect(w).toContain('why Lead Edge')
    expect(w).toMatch(/recent deal or tech trend/)
  })
})

describe('FEW_SHOT', () => {
  const realBriefs = existsSync(DEFAULT_LIBRARY_ROOT)
    ? listCases(DEFAULT_LIBRARY_ROOT).map(
        (c) => loadCase(DEFAULT_LIBRARY_ROOT, String(c.number).padStart(2, '0'), '').brief
      )
    : []

  it('given each line, when shaped, then <=3 sentences and exactly one question mark', () => {
    expect(FEW_SHOT.length).toBeGreaterThanOrEqual(4)
    for (const line of FEW_SHOT) {
      expect(line.split('?').length - 1).toBe(1)
      expect(line.split(/(?<=[.?!])\s+/).filter(Boolean).length).toBeLessThanOrEqual(3)
    }
  })

  it('given case 99, when every line runs through the leak guard, then all pass', () => {
    for (const line of FEW_SHOT) expect(checkUtterance(line, brief)).toEqual({ ok: true })
  })

  it.skipIf(realBriefs.length === 0)(
    'given every real case, when every line runs through the leak guard, then all pass',
    () => {
      for (const b of realBriefs)
        for (const line of FEW_SHOT) expect(checkUtterance(line, b), b.caseId).toEqual({ ok: true })
    }
  )
})

const RETENTION_RE = /retention|churn|grr|nrr|cohort|renewal/i

describe('SECTION_GOALS and probeLabels', () => {
  it.each(SECTION_IDS)(
    'given section %s, when looked up, then a goal and >=1 leak-safe label',
    (id) => {
      expect(SECTION_GOALS[id].length).toBeGreaterThan(10)
      const labels = probeLabels(brief, id)
      expect(labels.length).toBeGreaterThanOrEqual(1)
      for (const l of labels) expect(checkUtterance(l.label, brief), l.label).toEqual({ ok: true })
    }
  )

  it('given case 99, when retention, then every retention flag row with its id', () => {
    const labels = probeLabels(brief, 'retention')
    const retention = brief.flags.map.filter((f) => RETENTION_RE.test(f.flag))
    expect(retention.length).toBeGreaterThan(0)
    for (const f of retention) expect(labels).toContainEqual({ label: f.flag, flagId: f.id })
  })

  it('given case 99, when diligence, then the other flag rows plus deliberate omissions', () => {
    const labels = probeLabels(brief, 'diligence')
    const other = brief.flags.map.filter((f) => !RETENTION_RE.test(f.flag))
    expect(other.length).toBeGreaterThan(0)
    for (const f of other) expect(labels).toContainEqual({ label: f.flag, flagId: f.id })
    expect(labels.map((l) => l.label)).toContain('deliberate omissions')
  })
})

describe('proctorNote', () => {
  const retentionFlag = brief.flags.map.find((f) => RETENTION_RE.test(f.flag))!
  const facts = (over: Partial<ProctorFacts> = {}): ProctorFacts => ({
    directive: 'probe',
    caps: { soft: 3, hard: 5 },
    grillElapsedMs: 660000,
    budgetMs: 1500000,
    pushback: 'not_yet',
    lastAnswerLong: false,
    plan: ['industry', 'retention', 'valuation', 'call'],
    done: ['industry'],
    surfacedFlagIds: [retentionFlag.id],
    openingLabels: [],
    ...over
  })
  const req = (over: Partial<ProctorFacts> = {}, r: Partial<TurnRequest> = {}): TurnRequest => ({
    kind: 'grill',
    section: 'retention',
    turnInSection: 2,
    hintAllowed: false,
    history: [],
    proctor: facts(over),
    ...r
  })

  it('given a mid-section probe, when rendered, then every code-owned fact is stated', () => {
    const n = proctorNote(req(), brief)
    expect(n.startsWith('<proctor>')).toBe(true)
    expect(n.endsWith('</proctor>')).toBe(true)
    for (const s of [
      'section=retention',
      'turn=2 soft=3 hard=5',
      'directive=probe',
      'grill_elapsed=11m budget=25m',
      'hint_allowed=false',
      'pushback=not_yet',
      'last_answer_long=false',
      SECTION_GOALS.retention
    ])
      expect(n).toContain(s)
    const remaining = /remaining_probes=(\[.*\])/.exec(n)
    expect(remaining).not.toBeNull()
    const probes = JSON.parse(remaining![1]) as string[]
    expect(probes).not.toContain(retentionFlag.flag)
    expect(probes).toContain('GRR vs NRR')
  })

  it('given the first grilling turn, when framing, then it names the opening points and asks where to start', () => {
    const n = proctorNote(
      req(
        { directive: 'framing', openingLabels: ['churn risk', 'great comps'] },
        { turnInSection: 0 }
      ),
      brief
    )
    expect(n).toContain('directive=framing')
    expect(n).toContain('churn risk')
    expect(n).toContain('great comps')
    expect(n).toMatch(/which one they want to start with/)
  })

  it('given wrapup, when rendered, then the partner closes with no new question', () => {
    const n = proctorNote(req({ directive: 'wrapup' }, { kind: 'wrapup' }), brief)
    expect(n).toContain('directive=wrapup')
    expect(n).toMatch(/close the interview briefly/i)
    expect(n).toMatch(/no new question/i)
  })

  it('given a FakeLlm-shaped request without proctor, when rendered, then a valid note with defaults', () => {
    const n = proctorNote(
      { kind: 'grill', section: 'business', turnInSection: 0, history: [] },
      brief
    )
    expect(n).toContain('section=business')
    expect(n).toContain('directive=framing')
    expect(n).toContain('pushback=not_yet')
    expect(n).toContain('hint_allowed=false')
    expect(() =>
      proctorNote({ kind: 'wrapup', turnInSection: 0, history: [] }, brief)
    ).not.toThrow()
  })

  it('given the same input, when rendered twice, then identical and free of deck text and say lines', () => {
    const a = proctorNote(req({ pushback: 'now', lastAnswerLong: true }), brief)
    expect(proctorNote(req({ pushback: 'now', lastAnswerLong: true }), brief)).toBe(a)
    expect(a).toContain('pushback=now')
    expect(a).toContain('last_answer_long=true')
    expect(a).not.toContain(brief.deckText)
    for (const f of brief.flags.map) expect(a).not.toContain(f.say)
  })
})

describe('warmupNote', () => {
  it('given no candidate turns, when rendered, then open casually', () => {
    const n = warmupNote(0)
    expect(n).toMatch(/^<proctor>phase=warmup /)
    expect(n).toMatch(/open casually/)
  })
  it('given candidate turns, when rendered, then continue the chat', () => {
    expect(warmupNote(3)).toMatch(/continue the chat/)
  })
})
