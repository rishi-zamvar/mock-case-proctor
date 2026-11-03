import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import type { Reveal, ViewState } from '../../../shared/ipc'
import ReviewMode from './ReviewMode'
import { v2Reveal, v2View } from './review/fixtures'

function reveal(): Reveal {
  return {
    ...v2Reveal(),
    transcript: [
      {
        id: 'i0',
        speaker: 'interviewer',
        text: 'What is your call?',
        offsetMs: 0,
        ms: null,
        section: null
      },
      {
        id: 'c0',
        speaker: 'candidate',
        text: 'Retention is the story. Gross RETENTION is 88%.',
        offsetMs: 5000,
        ms: 45000,
        section: 'opening'
      },
      {
        id: 'i1',
        speaker: 'interviewer',
        text: 'Why?',
        offsetMs: 65000,
        ms: null,
        section: 'opening'
      },
      {
        id: 'c2',
        speaker: 'candidate',
        text: 'Because the price is high.',
        offsetMs: 70000,
        ms: 12000,
        section: 'valuation'
      }
    ]
  }
}

const view = (o: Partial<ViewState> = {}): ViewState => v2View({ reveal: reveal(), ...o })

function setup(o: Partial<ViewState> = {}): { onBack: Mock<() => void> } {
  const onBack = vi.fn<() => void>()
  render(<ReviewMode view={view(o)} onBack={onBack} />)
  return { onBack }
}

const id = (s: string): HTMLElement => screen.getByTestId(s)
const q = (s: string): HTMLElement | null => screen.queryByTestId(s)
const all = (s: string): HTMLElement[] => screen.queryAllByTestId(s)
const line = (turn: string): HTMLElement =>
  all('transcript-line').find((l) => l.getAttribute('data-turn') === turn)!

let scroll: Mock
beforeEach(() => {
  scroll = vi.fn()
  Element.prototype.scrollIntoView = scroll as unknown as Element['scrollIntoView']
})

describe('ReviewMode', () => {
  it('renders the root, header and six rubric rows', () => {
    setup()
    expect(document.querySelector('main[data-screen="reviewMode"]')).not.toBeNull()
    expect(all('rubric-row')).toHaveLength(6)
    expect(id('score-total').textContent).toBe('22/30')
    expect(id('score-band').textContent).toBe('Close, one fix')
    expect(id('review-header').textContent).toContain('Fixturely')
  })

  it('renders the timed transcript with speakers, times and durations', () => {
    setup()
    const lines = all('transcript-line')
    expect(id('full-transcript').tagName).toBe('OL')
    expect(id('full-transcript').querySelectorAll('li')).toHaveLength(4)
    expect(lines.map((l) => l.getAttribute('data-turn'))).toEqual(['i0', 'c0', 'i1', 'c2'])
    expect(lines[0].getAttribute('data-speaker')).toBe('interviewer')
    expect(lines[0].textContent).toContain('Interviewer')
    expect(lines[1].textContent).toContain('You')
    expect(within(lines[1]).getByTestId('transcript-time').textContent).toBe('0:05')
    expect(within(lines[2]).getByTestId('transcript-time').textContent).toBe('1:05')
    expect(lines[1].textContent).toContain('(45s)')
    expect(lines[0].textContent).not.toMatch(/\(\d+s\)/)
    expect(lines.every((l) => l.getAttribute('data-highlighted') === 'false')).toBe(true)
  })

  it('clicking an evidence quote highlights and scrolls to its transcript line', () => {
    setup()
    const quote = all('evidence-quote').find((b) => b.getAttribute('data-turn') === 'c0')!
    fireEvent.click(quote)
    expect(line('c0').getAttribute('data-highlighted')).toBe('true')
    expect(line('i0').getAttribute('data-highlighted')).toBe('false')
    expect(scroll).toHaveBeenCalledTimes(1)
    expect(scroll).toHaveBeenCalledWith({ block: 'center' })
    expect(scroll.mock.contexts[0]).toBe(line('c0'))
  })

  it('search marks case-insensitive matches and counts matching lines', () => {
    setup()
    const box = id('transcript-search')
    expect(box.tagName).toBe('INPUT')
    expect(id('full-transcript').querySelectorAll('mark')).toHaveLength(0)
    fireEvent.change(box, { target: { value: 'retention' } })
    expect(all('transcript-line')).toHaveLength(4)
    const marks = line('c0').querySelectorAll('mark')
    expect([...marks].map((m) => m.textContent)).toEqual(['Retention', 'RETENTION'])
    expect(line('c0').textContent).toContain('Retention is the story. Gross RETENTION is 88%.')
    expect(id('full-transcript').querySelectorAll('mark')).toHaveLength(2)
    expect(screen.getByText('1 match')).not.toBeNull()
    fireEvent.change(box, { target: { value: 'is' } })
    expect(screen.getByText('3 matches')).not.toBeNull()
    fireEvent.change(box, { target: { value: '' } })
    expect(id('full-transcript').querySelectorAll('mark')).toHaveLength(0)
  })

  it('search treats regex characters literally', () => {
    setup()
    fireEvent.change(id('transcript-search'), { target: { value: '88%.' } })
    expect([...line('c0').querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['88%.'])
    fireEvent.change(id('transcript-search'), { target: { value: '(' } })
    expect(id('full-transcript').querySelectorAll('mark')).toHaveLength(0)
  })

  it('switches tabs by click and arrow keys', () => {
    setup()
    const sc = id('tab-scorecard')
    const tr = id('tab-trends')
    expect(sc.getAttribute('role')).toBe('tab')
    expect(sc.getAttribute('aria-selected')).toBe('true')
    fireEvent.click(tr)
    expect(tr.getAttribute('aria-selected')).toBe('true')
    expect(id('trends')).not.toBeNull()
    expect(q('rubric-row')).toBeNull()
    fireEvent.keyDown(tr, { key: 'ArrowLeft' })
    expect(sc.getAttribute('aria-selected')).toBe('true')
    expect(document.activeElement).toBe(sc)
    expect(all('rubric-row')).toHaveLength(6)
    fireEvent.keyDown(sc, { key: 'ArrowRight' })
    expect(tr.getAttribute('aria-selected')).toBe('true')
  })

  it('shows the ended-early notice only when ended early', () => {
    setup()
    expect(q('ended-early')).toBeNull()
  })

  it('shows the ended-early notice', () => {
    setup({ endedEarly: true })
    expect(id('ended-early').textContent).toBe('Session ended early, partial scorecard.')
  })

  it('back to library calls onBack', () => {
    const { onBack } = setup()
    fireEvent.click(id('back-to-library'))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('renders only back-to-library without a reveal', () => {
    const { onBack } = setup({ reveal: null })
    expect(q('rubric-row')).toBeNull()
    expect(q('full-transcript')).toBeNull()
    expect(q('tab-scorecard')).toBeNull()
    fireEvent.click(id('back-to-library'))
    expect(onBack).toHaveBeenCalled()
  })
})
