// VOUT-02: finance text becomes speakable words before it reaches Kokoro.
import { describe, expect, it } from 'vitest'
import { speakable } from './speakable'

const LOCKED: [string, string][] = [
  ['$184M', '184 million dollars'],
  ['$1.5B', '1.5 billion dollars'],
  ['$7.5K', '7.5 thousand dollars'],
  ['4.1x', '4.1 times'],
  ['48.2%', '48.2 percent'],
  ['+30%', 'plus 30 percent'],
  ['25 bps', '25 basis points'],
  ['$158M–$200M', '158 to 200 million dollars'],
  ['FY2026A', 'fiscal 2026'],
  ['FY27E', 'fiscal 2027 estimate'],
  ['~$45M', 'about 45 million dollars']
]

const EXTRAS: [string, string][] = [
  ['($9.9M)', 'negative 9.9 million dollars'],
  ['(9%)', 'negative 9 percent'],
  ['$1.2T', '1.2 trillion dollars'],
  ['$1T', '1 trillion dollars'],
  ['n.a.', 'not available'],
  ['<9%', 'under 9 percent'],
  ['$1,234.5B', '1234.5 billion dollars'],
  ['~1,100', 'about 1100'],
  ['9.9M', '9.9 million'],
  ['12–15%', '12 to 15 percent'],
  ['9% / 12%', '9 percent / 12 percent'],
  ['9+', '9 plus'],
  ['1,000+', '1000 plus'],
  ['$45', '45 dollars'],
  ['2x', '2 times'],
  ['100–999', '100 to 999'],
  ['$500K–$1.2M', '500 thousand to 1.2 million dollars']
]

const ACRONYMS: [string, string][] = [
  ['ARR grew', 'A R R grew'],
  ['NRR and GRR', 'N R R and G R R'],
  ['a 30% CAGR', 'a 30 percent kagger'],
  ['EV / NTM revenue', 'E V / N T M revenue'],
  ['LTM EBITDA', 'L T M ee-bit-dah'],
  ['MOIC', 'moyk'],
  ['SaaS', 'sass'],
  ['PIMS', 'pims'],
  ['Rule of 40', 'rule of forty']
]

const UNTOUCHED = ['box', 'every', 'Fax', 'Evan', 'Mix tape', 'the 3 sections']

describe('speakable', () => {
  it.each(LOCKED)('given the locked form %s, when normalised, then it reads "%s"', (input, expected) => {
    expect(speakable(input)).toBe(expected)
  })

  it.each(EXTRAS)('given the census form %s, when normalised, then it reads "%s"', (input, expected) => {
    expect(speakable(input)).toBe(expected)
  })

  it.each(ACRONYMS)('given acronym text %s, when normalised, then it reads "%s"', (input, expected) => {
    expect(speakable(input)).toBe(expected)
  })

  it.each(UNTOUCHED)('given ordinary text %s, when normalised, then it is unchanged', (input) => {
    expect(speakable(input)).toBe(input)
  })

  it('given a full sentence, when normalised, then every form inside it is spoken', () => {
    expect(speakable('ARR hit $60.0M, up +40%, at 4.1x EV / NTM revenue.')).toBe(
      'A R R hit 60.0 million dollars, up plus 40 percent, at 4.1 times E V / N T M revenue.'
    )
  })

  it.each(LOCKED.map(([i]) => i))('given %s already spoken, when normalised again, then it is unchanged', (input) => {
    const once = speakable(input)
    expect(speakable(once)).toBe(once)
  })
})
