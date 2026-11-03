import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { readDeckText } from './deckSource'

const FIXTURE_ROOT = join(__dirname, '../../../../tests/fixtures/cases')

describe('readDeckText', () => {
  it('given a sibling deck.txt, when read, then returns it without running pdftotext', () => {
    const run = vi.fn(() => 'pdf text')
    const want = readFileSync(join(FIXTURE_ROOT, 'case_99_fixture/deck.txt'), 'utf8')
    expect(readDeckText(FIXTURE_ROOT, '99', run)).toBe(want)
    expect(run).not.toHaveBeenCalled()
  })

  it('given no deck.txt, when read, then runs pdftotext on the interviewee pdf only', () => {
    const root = mkdtempSync(join(tmpdir(), 'deck-'))
    mkdirSync(join(root, 'case_42_acme'))
    const run = vi.fn(() => 'extracted deck')
    expect(readDeckText(root, '42', run)).toBe('extracted deck')
    expect(run).toHaveBeenCalledTimes(1)
    const [pdf] = run.mock.calls[0] as unknown as [string]
    expect(pdf).toBe(join(root, 'case_42_acme', 'case_42_acme_interviewee_package.pdf'))
    expect(pdf).not.toContain('interviewer')
  })

  it('given an unknown id, when read, then throws case NN not found', () => {
    expect(() => readDeckText(FIXTURE_ROOT, '77', vi.fn())).toThrow('case 77 not found')
  })
})
