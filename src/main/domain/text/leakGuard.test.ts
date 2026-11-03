import { describe, expect, it } from 'vitest'
import { BANNED_TERMS, checkUtterance, normalizeForGuard, type LeakSource } from './leakGuard'

// Fictional sources only. The deck sentence below also appears verbatim inside IDEAL.
const DECK_SENTENCE = 'The company grows ARR fast and pays back capital.'
const IDEAL =
  'I would invest because gross retention of 85 percent sits below peers, yet net retention offsets it. ' +
  'The company grows ARR fast and pays back capital quickly, so a 3x return works at the asking price.'
const SAY = 'GRR is 85% which trails the peer median of 92% and caps the multiple.'
const RUBRIC_FIVE = 'Leads with a clear call and defends it with retention math under pressure.'
const EVIDENCE = 'Spots that customer concentration hides inside the cohort chart on slide twelve.'

const src: LeakSource = {
  leakSources: [IDEAL, SAY, RUBRIC_FIVE, EVIDENCE],
  deckText: `Overview page.\f${DECK_SENTENCE} Revenue $9.9M ARR.\f`
}

describe('normalizeForGuard', () => {
  it('lowercases, strips punctuation, collapses whitespace', () => {
    expect(normalizeForGuard('  GRR,  is 85%!\nOK ')).toEqual(['grr', 'is', '85', 'ok'])
  })
})

describe('checkUtterance: ngram blocks', () => {
  it.each([
    [
      'ideal answer',
      'So tell me, I would invest because gross retention of 85 percent, right?',
      'i would invest because gross retention of 85'
    ],
    [
      'flag say line',
      'Would you agree GRR is 85% which trails the peer median here?',
      'grr is 85 which trails the peer median'
    ],
    [
      'rubric five line',
      'Can you lead with a clear call and defends it with retention math?',
      'with a clear call and defends it with'
    ],
    [
      'what-it-tests evidence',
      'Did you see customer concentration hides inside the cohort chart on slide twelve?',
      'customer concentration hides inside the cohort chart on'
    ],
    [
      'case and punctuation differ',
      'So, GRR,  IS 85%! which TRAILS the peer median?',
      'grr is 85 which trails the peer median'
    ]
  ])('%s', (_name, text, gram) => {
    expect(checkUtterance(text, src)).toEqual({ ok: false, reason: 'ngram', match: gram })
  })
})

describe('checkUtterance: banned terms', () => {
  it.each([
    ['Let me check the rubric', 'rubric'],
    ['per the ANSWER KEY', 'answer key'],
    ['Flag map says', 'flag map'],
    ['the interviewer package', 'interviewer package'],
    ['your ideal answer', 'ideal answer'],
    ['the scoring sheet', 'scoring sheet'],
    ['Rubric.', 'rubric']
  ])('%s', (text, term) => {
    expect(checkUtterance(text, src)).toEqual({ ok: false, reason: 'banned_term', match: term })
  })

  it('covers every banned term', () => {
    for (const t of BANNED_TERMS) expect(checkUtterance(`about the ${t} now`, src).ok).toBe(false)
  })
})

describe('checkUtterance: passes', () => {
  it.each([
    'What is gross retention?',
    'Walk me through the $9.9M ARR.',
    'Why does NRR exceed GRR here?',
    'How would you back into a 3x return?',
    'What does the deck not show you?',
    'Which comp is the anchor and why?',
    'Is this business interesting?',
    'What would you diligence first?',
    'So what is your call?',
    'Tell me more about churn.',
    // 7 consecutive answer-key words: below the 8 threshold
    'I would invest because gross retention of, hmm, what?',
    // deck sentence that also sits in the answer key: deck grams subtracted
    'You said the company grows ARR fast and pays back capital, true?',
    '',
    // banned terms match whole tokens only
    'Do you use rubrics?',
    'Where are the answer keys?'
  ])('%j', (text) => {
    expect(checkUtterance(text, src)).toEqual({ ok: true })
  })

  it('memoises grams per source: 1000 calls < 200 ms', () => {
    const fresh: LeakSource = { leakSources: [...src.leakSources], deckText: src.deckText }
    const t0 = performance.now()
    for (let i = 0; i < 1000; i++)
      checkUtterance('Why does NRR exceed GRR here, and what would you diligence first?', fresh)
    expect(performance.now() - t0).toBeLessThan(200)
  })
})
