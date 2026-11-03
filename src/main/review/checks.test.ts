import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { loadCase } from '../domain/cases/library'
import type { InterviewControl } from '../domain/machine/interviewMachine'
import type { Turn } from '../store/sessionSchema'
import { brevityRows, flagMap, ledWithCall, numberChecks } from './checks'

const ROOT = join(__dirname, '../../../tests/fixtures/cases')
const deck = readFileSync(join(ROOT, 'case_99_fixture/deck.txt'), 'utf8')
const tokens = loadCase(ROOT, '99', deck).brief.numberTokens

describe('numberChecks', () => {
  it.each([
    ['GRR is 85%', { claim: '85%', matched: '85%', expected: null, correct: true }],
    ['GRR is about 95%', { claim: '95%', matched: null, expected: '85%', correct: false }],
    [
      'ARR of $10 million',
      { claim: '$10 million', matched: '$9.9M', expected: null, correct: true }
    ],
    ['net retention is 104%', { claim: '104%', matched: '104%', expected: null, correct: true }],
    [
      'the multiple is trading at 4.1x',
      { claim: '4.1x', matched: '4.1x', expected: null, correct: true }
    ],
    [
      'we met 3 times last week',
      { claim: '3 times', matched: null, expected: null, correct: 'unverifiable' }
    ],
    ["I'd say 12 people", { claim: '12', matched: null, expected: null, correct: 'unverifiable' }],
    [
      'gross margin is 70%',
      { claim: '70%', matched: null, expected: null, correct: 'unverifiable' }
    ]
  ])('given %j, when checked against case_99, then row is %o', (text, row) => {
    expect(numberChecks([{ text }], tokens)).toEqual([row])
  })

  it('given several lines and mentions, when checked, then one row per mention in order', () => {
    const rows = numberChecks(
      [{ text: 'GRR is 85% and NRR is 104%' }, { text: 'growth of 40%' }],
      tokens
    )
    expect(rows.map((r) => [r.claim, r.correct])).toEqual([
      ['85%', true],
      ['104%', true],
      ['40%', true]
    ])
  })

  it('given a wrong growth figure, when checked, then expected is the closest aliased token', () => {
    expect(numberChecks([{ text: 'growing at 33%' }], tokens)[0]).toMatchObject({
      correct: false,
      expected: '31%'
    })
  })
})

describe('ledWithCall', () => {
  const filler = Array.from({ length: 25 }, () => 'word').join(' ')
  it.each([
    ["I'd pass at this price, because…", undefined, true],
    ["Fixturely sells widgets. I'd invest.", undefined, false],
    [`${filler} invest`, undefined, false],
    ['Invest at a price.', 'unclear', false],
    ['Invest at a price.', 'invest_at_price', true],
    ['', undefined, false]
  ] as const)('given %j with recommendation %j, when checked, then %s', (opening, rec, want) => {
    expect(ledWithCall(opening, rec)).toBe(want)
  })
})

describe('brevityRows', () => {
  const t = (
    id: string,
    phase: Turn['phase'],
    ms?: number,
    speaker: Turn['speaker'] = 'candidate'
  ): Turn => ({
    id,
    speaker,
    phase,
    text: 'x',
    at: 0,
    ...(ms === undefined ? {} : { ms })
  })
  it('given a mixed transcript, when rowed, then only timed candidate presentation/grilling turns are banded', () => {
    expect(
      brevityRows([
        t('w', 'warmup', 45_000),
        t('p', 'presentation', 45_000),
        t('g', 'grilling', 95_000),
        t('n', 'grilling'),
        t('i', 'grilling', 50_000, 'interviewer')
      ])
    ).toEqual([
      { turnId: 'p', ms: 45_000, band: 'ideal' },
      { turnId: 'g', ms: 95_000, band: 'flagged' }
    ])
  })
})

describe('flagMap', () => {
  const c = (x: Partial<InterviewControl>): { control: InterviewControl } => ({
    control: { section: 'retention', section_status: 'continue', ...x }
  })
  const flags = [
    { id: 'f1', flag: 'one', templates: ['S12', 'A3'] },
    { id: 'f2', flag: 'two', templates: ['S4'] },
    { id: 'f3', flag: 'three', templates: [] }
  ]
  it('given a control log, when mapped, then status is fixed at first appearance', () => {
    const log = [
      c({ flags_surfaced: ['f1'] }),
      c({ flags_surfaced: ['f2'], flags_hinted: ['f2'] }),
      c({ flags_surfaced: ['f1', 'f2', 'zz'], flags_hinted: ['f1'] })
    ]
    expect(flagMap(log, flags)).toEqual([
      { id: 'f1', flag: 'one', status: 'found', where: 'S12, A3' },
      { id: 'f2', flag: 'two', status: 'hinted', where: 'S4' },
      { id: 'f3', flag: 'three', status: 'missed', where: '' }
    ])
  })
})
