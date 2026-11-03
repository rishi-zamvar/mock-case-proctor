import { describe, expect, it } from 'vitest'
import { initialState, type InterviewState } from '../domain/machine/interviewMachine'
import type { OpeningPlan } from '../ports'
import type { SessionFile, Turn } from '../store/sessionSchema'
import { buildTurnRequest } from './turnRequest'

type S = Pick<SessionFile, 'machineState' | 'transcript' | 'controlLog' | 'openingPlan'>

const grilling = (o: Partial<InterviewState> = {}): InterviewState => ({
  ...initialState(),
  phase: 'grilling',
  plan: ['business', 'valuation', 'call'],
  current: 'business',
  caps: { soft: 3, hard: 5 },
  grillStartedAt: 1000,
  ...o
})

const turn = (id: string, speaker: Turn['speaker'], phase: Turn['phase'] = 'grilling'): Turn => ({
  id,
  speaker,
  phase,
  text: `${id} text`,
  at: 0
})

const plan: OpeningPlan = {
  recap: 'r',
  recommendation: 'invest',
  price: null,
  considerations: [
    { label: 'retention is strong', section_id: 'retention', stance: 'for' },
    { label: 'price is rich', section_id: 'valuation', stance: 'against' }
  ],
  order: ['business', 'valuation', 'call']
}

const sess = (m: InterviewState, o: Partial<S> = {}): S => ({
  machineState: m,
  transcript: [],
  controlLog: [],
  ...o
})

const grill = { kind: 'grill' as const, section: 'business' as const, hintAllowed: false }

describe('buildTurnRequest', () => {
  it('given section turn counts, when built, then directive is framing / probe / wrap_section / wrapup', () => {
    expect(buildTurnRequest(sess(grilling()), grill, 0).proctor?.directive).toBe('framing')
    expect(
      buildTurnRequest(sess(grilling({ turnsInSection: 1 })), grill, 0).proctor?.directive
    ).toBe('probe')
    expect(
      buildTurnRequest(sess(grilling({ turnsInSection: 3 })), grill, 0).proctor?.directive
    ).toBe('wrap_section')
    expect(
      buildTurnRequest(sess(grilling({ turnsInSection: 1 })), { kind: 'wrapup' }, 0).proctor
        ?.directive
    ).toBe('wrapup')
  })

  it('given grillStartedAt, when built, then elapsed and budget are computed', () => {
    const p = buildTurnRequest(sess(grilling()), grill, 661_000).proctor
    expect(p?.grillElapsedMs).toBe(660_000)
    expect(p?.budgetMs).toBe(25 * 60_000)
    expect(p?.caps).toEqual({ soft: 3, hard: 5 })
    expect(
      buildTurnRequest(sess(grilling({ grillStartedAt: null })), grill, 661_000).proctor
        ?.grillElapsedMs
    ).toBe(0)
  })

  it('given valuation turn 1, when built, then pushback is now until done', () => {
    const m = grilling({ current: 'valuation', turnsInSection: 1 })
    expect(buildTurnRequest(sess(m), grill, 0).proctor?.pushback).toBe('now')
    expect(
      buildTurnRequest(sess({ ...m, pushbackDone: true }), grill, 0).proctor?.pushback
    ).toBe('done')
  })

  it('given an interrupted answer, when it is the last candidate turn, then lastAnswerLong', () => {
    const transcript = [turn('t1', 'candidate'), turn('t2', 'interviewer')]
    const m = grilling({ interruptedAnswerId: 't1' })
    expect(buildTurnRequest(sess(m, { transcript }), grill, 0).proctor?.lastAnswerLong).toBe(true)
    const later = [...transcript, turn('t3', 'candidate')]
    expect(
      buildTurnRequest(sess(m, { transcript: later }), grill, 0).proctor?.lastAnswerLong
    ).toBe(false)
    expect(
      buildTurnRequest(sess(grilling(), { transcript: [] }), grill, 0).proctor?.lastAnswerLong
    ).toBe(false)
  })

  it('given repeated surfaced flags, when built, then ids are unique in first-seen order', () => {
    const c = (flags: string[]): SessionFile['controlLog'][number] => ({
      at: 0,
      turnId: 't',
      control: { section: 'business', section_status: 'continue', flags_surfaced: flags }
    })
    const controlLog = [c(['f2', 'f1']), c(['f1', 'f3'])]
    expect(
      buildTurnRequest(sess(grilling(), { controlLog }), grill, 0).proctor?.surfacedFlagIds
    ).toEqual(['f2', 'f1', 'f3'])
  })

  it('given an opening plan, when first grill turn, then labels are present only then', () => {
    const first = buildTurnRequest(sess(grilling(), { openingPlan: plan }), grill, 0).proctor
    expect(first?.openingLabels).toEqual(['retention is strong', 'price is rich'])
    const second = buildTurnRequest(
      sess(grilling({ done: ['business'], current: 'valuation' }), { openingPlan: plan }),
      { kind: 'grill', section: 'valuation' },
      0
    ).proctor
    expect(second?.openingLabels).toEqual([])
    expect(second?.done).toEqual(['business'])
    expect(second?.plan).toEqual(['business', 'valuation', 'call'])
    expect(buildTurnRequest(sess(grilling()), grill, 0).proctor?.openingLabels).toEqual([])
  })

  it('given a transcript, when built, then history carries phase and fields copy through', () => {
    const transcript = [turn('a', 'candidate', 'presentation'), turn('b', 'interviewer')]
    const r = buildTurnRequest(
      sess(grilling({ turnsInSection: 2 }), { transcript }),
      { kind: 'grill', section: 'business', hintAllowed: true },
      0
    )
    expect(r.history).toEqual([
      { speaker: 'candidate', text: 'a text', phase: 'presentation' },
      { speaker: 'interviewer', text: 'b text', phase: 'grilling' }
    ])
    expect(r).toMatchObject({
      kind: 'grill',
      section: 'business',
      hintAllowed: true,
      turnInSection: 2
    })
  })
})
