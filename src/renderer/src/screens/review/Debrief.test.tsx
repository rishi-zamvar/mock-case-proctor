import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { DIMENSION_IDS, type Reveal } from '../../../../shared/ipc'
import Debrief from './Debrief'
import { AT, v2Reveal, v2View } from './fixtures'

function setup(r: Reveal = v2Reveal()): { onQuote: ReturnType<typeof vi.fn> } {
  const onQuote = vi.fn()
  render(<Debrief view={v2View({ reveal: r })} onQuote={onQuote} />)
  return { onQuote }
}
const id = (s: string): HTMLElement => screen.getByTestId(s)
const all = (s: string): HTMLElement[] => screen.queryAllByTestId(s)

describe('Debrief', () => {
  it('header: total, band, case line with date, keep and fix', () => {
    setup()
    const h = id('review-header')
    expect(within(h).getByTestId('score-total').textContent).toBe('22/30')
    const band = within(h).getByTestId('score-band')
    expect(band.textContent).toBe('Close, one fix')
    expect(band.getAttribute('data-band')).toBe('close')
    expect(h.textContent).toContain('Fixturely')
    expect(h.textContent).toContain(`Case 99 · SaaS · ${new Date(AT).toLocaleDateString()}`)
    expect(within(h).getByTestId('keep').textContent).toContain('Leading with the call')
    expect(within(h).getByTestId('fix').textContent).toContain('Compute GRR before NRR')
  })

  it.each([
    ['ready', 'Ready'],
    ['another', 'Run another Level 1 case']
  ] as const)('band %s label', (band, label) => {
    const r = v2Reveal()
    r.scorecard.band = band
    setup(r)
    expect(id('score-band').textContent).toBe(label)
  })

  it('cards follow the debrief order', () => {
    setup()
    const order = ['insight-called-out', 'flag-row', 'intended-read', 'rubric-row', 'summary', 'checks']
    const els = order.map((t) => all(t)[0])
    for (let i = 1; i < els.length; i++) {
      expect(els[i - 1].compareDocumentPosition(els[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(id('review-header').compareDocumentPosition(els[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('insight lists called out and None for an empty missed list', () => {
    setup()
    expect(id('insight-called-out').textContent).toContain('Spotted the cohort churn')
    expect(id('insight-missed').textContent).toContain('None')
  })

  it('reveal: intended read, back-solve, ideal next to opening, key numbers', () => {
    setup()
    expect(id('intended-read').textContent).toContain('Retention is weaker')
    expect(id('back-solve').querySelectorAll('li')).toHaveLength(2)
    expect(id('reveal').contains(id('ideal-answer'))).toBe(true)
    expect(id('ideal-answer').querySelector('p')?.textContent).toBe('Pass at this price.')
    expect(id('your-opening').textContent).toContain('My call is invest.')
    expect(id('key-numbers').textContent).toContain('$9.9M ARR at 3.4x')
    expect(id('summary').textContent).toContain('Solid call, thin back-solve.')
  })

  it('rubric row: dots, score, rationale, quote buttons, answer key', () => {
    const { onQuote } = setup()
    const rows = all('rubric-row')
    expect(rows).toHaveLength(6)
    const r0 = within(rows[0])
    const dots = r0.getByTestId('score-dots')
    expect(dots.getAttribute('aria-label')).toBe('4 of 5')
    expect(dots.children).toHaveLength(5)
    expect(dots.querySelectorAll('[data-filled="true"]')).toHaveLength(4)
    expect(r0.getByTestId('score').textContent).toBe('4/5')
    expect(r0.getByTestId('rationale').textContent).toBe(`why ${DIMENSION_IDS[0]}`)
    const q = r0.getByTestId('evidence-quote')
    expect(q.tagName).toBe('BUTTON')
    expect(q.getAttribute('data-turn')).toBe('c0')
    fireEvent.click(q)
    expect(onQuote).toHaveBeenCalledWith('c0')
    expect(rows[0].textContent).toContain(`key ${DIMENSION_IDS[0]}`)
    expect(r0.queryByTestId('unverified-badge')).toBeNull()
  })

  it('unverified row is labelled with no quote buttons', () => {
    setup()
    const r1 = within(all('rubric-row')[1])
    expect(r1.getByTestId('unverified-badge').textContent).toBe('Unverified evidence')
    expect(r1.queryAllByTestId('evidence-quote')).toHaveLength(0)
    expect(r1.getByTestId('score-dots').getAttribute('aria-label')).toBe('2 of 5')
  })

  it('flag map: status chips and deck location', () => {
    setup()
    const flags = all('flag-row')
    expect(flags.map((f) => f.getAttribute('data-status'))).toEqual(['found', 'hinted', 'missed'])
    expect(flags[0].textContent).toContain('Found')
    expect(flags[1].textContent).toContain('After hint')
    expect(flags[2].textContent).toContain('Missed')
    expect(within(flags[0]).getByTestId('flag-where').textContent).toBe('Deck: S12, A3')
    expect(within(flags[2]).queryByTestId('flag-where')).toBeNull()
  })

  it('checks: numbers table with marks and expected only when wrong', () => {
    setup()
    const rows = all('numbers-row')
    expect(rows.map((r) => r.getAttribute('data-correct'))).toEqual(['true', 'false', 'unverifiable'])
    expect(within(rows[0]).getByLabelText('Correct').textContent).toBe('✓')
    expect(within(rows[1]).getByLabelText('Wrong').textContent).toBe('✗')
    expect(within(rows[2]).getByLabelText('Unverifiable').textContent).toBe('?')
    expect(rows[1].textContent).toContain('GRR of 95%')
    expect(within(rows[1]).getByTestId('number-expected').textContent).toContain('88%')
    expect(within(rows[0]).queryByTestId('number-expected')).toBeNull()
    expect(within(rows[2]).queryByTestId('number-expected')).toBeNull()
  })

  it('checks: empty numbers message', () => {
    const r = v2Reveal()
    r.checks.numbers = []
    setup(r)
    expect(id('checks').textContent).toContain('No case numbers stated')
    expect(all('numbers-row')).toHaveLength(0)
  })

  it('checks: brevity strip bars, rows, led-with-call and omitted', () => {
    setup()
    const bars = all('brevity-bar')
    expect(bars.map((b) => b.getAttribute('data-band'))).toEqual(['ideal', 'long', 'flagged'])
    expect(bars[0].getAttribute('title')).toBe('0:45 · ideal')
    expect(bars[0].style.height).toBe('37.5%')
    expect(bars[2].style.height).toBe('100%')
    expect(all('brevity-row').map((r) => r.textContent)).toEqual([
      '0:45 · ideal',
      '1:20 · long',
      '3:20 · flagged'
    ])
    const led = id('led-with-call')
    expect(led.getAttribute('data-ok')).toBe('true')
    expect(led.textContent).toContain('✓')
    expect(id('checks').textContent).toContain('Diligence')
  })

  it('checks: no call and nothing omitted', () => {
    const r = v2Reveal()
    r.checks.ledWithCall = false
    r.checks.omitted = []
    setup(r)
    expect(id('led-with-call').getAttribute('data-ok')).toBe('false')
    expect(id('led-with-call').textContent).toContain('✗')
    expect(id('checks').textContent).toContain('None')
  })
})
