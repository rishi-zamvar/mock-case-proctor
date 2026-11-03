import { describe, expect, it } from 'vitest'
import { splitPages } from './deckText'

describe('splitPages', () => {
  it.each([
    ['a\fb\fc\f', ['a', 'b', 'c']],
    ['a\fb', ['a', 'b']],
    ['a\f\fc\f', ['a', '', 'c']],
    ['', []]
  ])('given %j, when split, then %j', (raw, out) => {
    expect(splitPages(raw)).toEqual(out)
  })
})
