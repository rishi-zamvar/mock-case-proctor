import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { InterviewerBrief } from '../domain/cases/brief'
import { DEFAULT_LIBRARY_ROOT, listCases, loadCase } from '../domain/cases/library'
import { checkUtterance, normalizeForGuard } from '../domain/text/leakGuard'
import { FIXTURE_ROOT, deck } from '../session/runner.harness'
import { FEW_SHOT, PERSONA, buildSystem, buildWarmupSystem } from './prompt'

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
    'call interview_control exactly once after speaking'
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
