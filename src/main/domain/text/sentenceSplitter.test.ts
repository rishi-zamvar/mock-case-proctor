// VOUT-02: stream Claude's text to TTS a sentence at a time without breaking finance numbers.
import { describe, expect, it } from 'vitest'
import { createSentenceSplitter } from './sentenceSplitter'

function all(chunks: string | string[], opts?: { earlyFirstWords?: number }): string[] {
  const s = createSentenceSplitter(opts)
  const out: string[] = []
  for (const c of typeof chunks === 'string' ? [chunks] : chunks) out.push(...s.push(c))
  return [...out, ...s.flush()]
}

describe('createSentenceSplitter', () => {
  it.each<[string, string | string[], string[]]>([
    [
      'two sentences',
      'Revenue is $1.5B. Growth is 48.2%. ',
      ['Revenue is $1.5B.', 'Growth is 48.2%.']
    ],
    [
      'a decimal multiple',
      'It trades at 4.1x revenue. Fine.',
      ['It trades at 4.1x revenue.', 'Fine.']
    ],
    [
      'a chunk boundary inside a decimal',
      ['It trades at 4.', '1x revenue. Next one.'],
      ['It trades at 4.1x revenue.', 'Next one.']
    ],
    ['e.g.', 'Peers, e.g. Toast, grew. Then stop.', ['Peers, e.g. Toast, grew.', 'Then stop.']],
    ['i.e.', 'i.e. That', ['i.e. That']],
    ['vs.', 'vs. Peers', ['vs. Peers']],
    ['approx.', 'approx. Ten', ['approx. Ten']],
    ['U.S.', 'U.S. Bank deposits rose. Ok.', ['U.S. Bank deposits rose.', 'Ok.']],
    ['n.a.', 'n.a. Next', ['n.a. Next']],
    ['Inc.', 'Acme Inc. Was sold.', ['Acme Inc. Was sold.']],
    ['a lowercase follower', 'It is 9 a.m. here.', ['It is 9 a.m. here.']],
    ['straight quotes', 'He said "Stop. Go." Then left.', ['He said "Stop. Go."', 'Then left.']],
    ['curly quotes', 'He said “Stop. Go.” Then left.', ['He said “Stop. Go.”', 'Then left.']],
    ['? and !', 'Why? Because! Ok.', ['Why?', 'Because!', 'Ok.']]
  ])('given %s, when split, then sentences are correct', (_name, input, expected) => {
    expect(all(input)).toEqual(expected)
  })

  it('given a trailing period at chunk end, when pushed, then it is held until flush', () => {
    const s = createSentenceSplitter()
    expect(s.push('Done.')).toEqual([])
    expect(s.flush()).toEqual(['Done.'])
  })

  it('given a boundary not yet confirmed by a capital, when pushed, then nothing is emitted', () => {
    const s = createSentenceSplitter()
    expect(s.push('Margins look thin. ')).toEqual([])
    expect(s.push('W')).toEqual(['Margins look thin.'])
  })

  it('given 6+ words before a comma, when pushed first, then an early chunk is emitted once', () => {
    const s = createSentenceSplitter()
    expect(s.push('So when I look at the retention numbers, the')).toEqual([
      'So when I look at the retention numbers,'
    ])
    expect(s.push(' cohorts look strong, really strong overall')).toEqual([])
    expect(s.flush()).toEqual(['the cohorts look strong, really strong overall'])
  })

  it('given one word before the first comma, when pushed, then no early chunk', () => {
    const s = createSentenceSplitter()
    expect(s.push('Yes, I agree with that view entirely')).toEqual([])
  })

  it('given a short first comma and a later qualifying comma, when pushed, then it emits at the later comma', () => {
    const s = createSentenceSplitter()
    expect(s.push('Yes, I agree with that view entirely, but the')).toEqual([
      'Yes, I agree with that view entirely,'
    ])
  })

  it('given a thousands comma, when pushed, then it is not an early boundary', () => {
    const s = createSentenceSplitter()
    expect(s.push('They now have roughly one thousand and 1,')).toEqual([])
  })

  it('given earlyFirstWords 3, when pushed, then a 3-word clause emits early', () => {
    const s = createSentenceSplitter({ earlyFirstWords: 3 })
    expect(s.push('Fair point there, but')).toEqual(['Fair point there,'])
  })

  it.each(['', '   '])('given remainder %j, when flushed, then nothing is returned', (rest) => {
    const s = createSentenceSplitter()
    s.push(rest)
    expect(s.flush()).toEqual([])
  })

  it('given 1-char chunks, when streamed, then sentences equal the one-chunk split', () => {
    const text = 'ARR grew to $60.0M in FY2026. NRR was 118% vs. 112% before. Is 4.1x fair?'
    expect(all(text.split(''))).toEqual(all(text))
    expect(all(text)).toEqual([
      'ARR grew to $60.0M in FY2026.',
      'NRR was 118% vs. 112% before.',
      'Is 4.1x fair?'
    ])
  })
})
