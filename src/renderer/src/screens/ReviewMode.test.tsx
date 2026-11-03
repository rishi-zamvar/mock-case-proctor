import { describe, it, expect, vi, type Mock } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DIMENSION_IDS, type Reveal, type ViewState } from '../../../shared/ipc'
import ReviewMode from './ReviewMode'

const DIMS = ['Structure', 'Call', 'Numbers', 'Risks', 'Diligence', 'Communication']

function reveal(): Reveal {
  return {
    scorecard: {
      rubric: DIMS.map((d, i) => ({
        id: DIMENSION_IDS[i],
        dimension: d,
        score: 3,
        evidence: [{ quote: `evidence for ${d}`, turnId: 't1' }],
        answerKey: `key for ${d}`,
        rationale: '',
        unverified: false
      })),
      total: 18,
      band: 'another',
      flags: [
        { id: 'f1', flag: 'Churn hidden in cohorts', status: 'found', where: 'S2' },
        { id: 'f2', flag: 'Customer concentration', status: 'missed', where: '' }
      ],
      keep: '',
      fix: '',
      insight: { calledOut: [], missed: [] },
      summary: '',
      evidenceStats: { proposed: 0, verified: 0, dropped: 0 },
      checksSummary: {
        numbersCorrect: 0,
        numbersWrong: 0,
        numbersUnverifiable: 0,
        brevity: { short: 0, brief: 0, ideal: 0, long: 0, flagged: 0 },
        avgAnswerMs: null,
        ledWithCall: false,
        flagsFound: 0,
        flagsHinted: 0,
        flagsTotal: 0
      },
      graderModel: 'fake',
      promptVersion: 'v0',
      scoredAt: 0
    },
    checks: {
      brevity: [{ turnId: 't1', ms: 45000, band: 'ideal' }],
      ledWithCall: true,
      omitted: ['Diligence'],
      numbers: []
    },
    idealAnswer: 'Pass at this price…',
    opening: 'My call is…',
    keyNumbers: [{ label: 'Deal', text: '$9.9M ARR at 3.4x' }],
    intendedRead: '',
    backSolve: [],
    transcript: []
  }
}

function view(o: Partial<ViewState> = {}): ViewState {
  return {
    sessionId: 's1',
    phase: 'reviewMode',
    card: {
      id: 'case_99',
      number: 99,
      slug: 'fixturely',
      company: 'Fixturely',
      vertical: 'SaaS',
      level: 2,
      intervieweePdfPath: 'app://cases/case_99/interviewee.pdf'
    },
    reviewDeadline: null,
    clockNow: 0,
    timeScale: 1,
    section: null,
    transcript: [
      { id: 'l1', speaker: 'interviewer', text: 'What is your call?' },
      { id: 'l2', speaker: 'candidate', text: 'My call is pass.' },
      { id: 'l3', speaker: 'interviewer', text: 'Why?' }
    ],
    speaking: false,
    canTalk: false,
    endedEarly: false,
    reveal: reveal(),
    deckPage: 1,
    reviewWarned: false,
    ...o
  }
}

function setup(o: Partial<ViewState> = {}): { onBack: Mock<() => void> } {
  const onBack = vi.fn<() => void>()
  render(<ReviewMode view={view(o)} onBack={onBack} />)
  return { onBack }
}

const id = (s: string): HTMLElement => screen.getByTestId(s)
const q = (s: string): HTMLElement | null => screen.queryByTestId(s)
const all = (s: string): HTMLElement[] => screen.queryAllByTestId(s)

describe('ReviewMode', () => {
  it('renders the root and six rubric rows with totals', () => {
    setup()
    expect(document.querySelector('main[data-screen="reviewMode"]')).not.toBeNull()
    const rows = all('rubric-row')
    expect(rows).toHaveLength(6)
    rows.forEach((r, i) => {
      expect(r.textContent).toContain(DIMS[i])
      expect(r.querySelector('[data-testid="score"]')?.textContent).toBe('3/5')
      expect(r.querySelector('blockquote')?.textContent).toContain(`evidence for ${DIMS[i]}`)
      expect(r.textContent).toContain(`key for ${DIMS[i]}`)
    })
    expect(id('score-total').textContent).toBe('18/30')
    expect(id('score-band').textContent).toBe('Run another')
  })

  it('renders the flag map with statuses and text labels', () => {
    setup()
    const flags = all('flag-row')
    expect(flags.map((f) => f.getAttribute('data-status'))).toEqual(['found', 'missed'])
    expect(flags[0].textContent).toContain('Found')
    expect(flags[1].textContent).toContain('Missed')
  })

  it('renders the checks', () => {
    setup()
    expect(id('brevity-row').textContent).toBe('0:45 · ideal')
    expect(id('checks').textContent).toContain('Led with a call: Yes')
    expect(id('checks').textContent).toContain('Diligence')
  })

  it('says None when nothing was omitted and No when no call led', () => {
    const r = reveal()
    r.checks.omitted = []
    r.checks.ledWithCall = false
    setup({ reveal: r })
    expect(id('checks').textContent).toContain('Led with a call: No')
    expect(id('checks').textContent).toContain('None')
  })

  it('renders the reveal side by side and the key numbers', () => {
    setup()
    expect(id('reveal').contains(id('ideal-answer'))).toBe(true)
    expect(id('ideal-answer').textContent).toContain('Pass at this price…')
    expect(id('your-opening').textContent).toContain('My call is…')
    expect(id('key-numbers').textContent).toContain('Deal')
    expect(id('key-numbers').textContent).toContain('$9.9M ARR at 3.4x')
  })

  it('lists the full transcript', () => {
    setup()
    expect(id('full-transcript').querySelectorAll('li')).toHaveLength(3)
  })

  it('switches tabs by click and arrow keys', () => {
    setup()
    expect(screen.getByRole('tablist')).not.toBeNull()
    const sc = id('tab-scorecard')
    const tr = id('tab-trends')
    expect(sc.getAttribute('role')).toBe('tab')
    expect(sc.getAttribute('aria-selected')).toBe('true')
    expect(screen.queryByText('Trends arrive in Phase 8')).toBeNull()
    fireEvent.click(tr)
    expect(tr.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Trends arrive in Phase 8')).not.toBeNull()
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

  it('does not crash without a reveal', () => {
    const { onBack } = setup({ reveal: null })
    expect(q('rubric-row')).toBeNull()
    fireEvent.click(id('back-to-library'))
    expect(onBack).toHaveBeenCalled()
  })
})
