import { describe, expect, it } from 'vitest'
import { cleanTranscript, collapseRepeats, isHallucination } from './clean'

describe('isHallucination / cleanTranscript', () => {
  it.each([
    'Thank you.',
    ' you',
    ' .',
    ' dollars.',
    ' money.',
    'Thanks for watching!',
    'Transcription by CastingWords',
    '[BLANK_AUDIO]',
    '(silence)',
    '♪',
    '♪♪ ♪'
  ])('given whole output %j, when cleaned, then it is a hallucination and becomes empty', (t) => {
    expect(isHallucination(t)).toBe(true)
    expect(cleanTranscript(t)).toBe('')
  })

  it('given a real answer that starts with a hallucination phrase, when cleaned, then it is kept', () => {
    const t = 'Thank you for the question, retention is 85%.'
    expect(isHallucination(t)).toBe(false)
    expect(cleanTranscript(` ${t} `)).toBe(t)
  })
})

describe('collapseRepeats', () => {
  it('given a bigram repeated 3x, when collapsed, then one copy remains', () => {
    expect(collapseRepeats('the churn the churn the churn is high')).toBe('the churn is high')
  })

  it('given a word repeated 4x, when collapsed, then one copy remains', () => {
    expect(collapseRepeats('so so so so we pass')).toBe('so we pass')
  })

  it('given a word repeated only 2x, when collapsed, then it is unchanged', () => {
    expect(collapseRepeats('very very good')).toBe('very very good')
  })

  it('given an 8-gram repeated 3x, when collapsed, then one copy remains', () => {
    const g = 'a b c d e f g h'
    expect(collapseRepeats(`${g} ${g} ${g} end`)).toBe(`${g} end`)
  })

  it('given a 9-gram repeated 3x, when collapsed, then it is left alone', () => {
    const g = 'a b c d e f g h i'
    const t = `${g} ${g} ${g} end`
    expect(collapseRepeats(t)).toBe(t)
  })

  it('given repeats differing in case and punctuation, when collapsed, then the first copy is kept verbatim', () => {
    expect(collapseRepeats('The Churn, the churn the churn. is high')).toBe('The Churn, is high')
  })
})
