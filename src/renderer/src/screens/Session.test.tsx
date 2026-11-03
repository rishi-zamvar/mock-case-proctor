import { describe, it, expect, vi, afterEach, type Mock } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import type { Intent, ViewState } from '../../../shared/ipc'
import Session from './Session'

const CLOCK = 1_700_000_000_000

function view(o: Partial<ViewState> = {}): ViewState {
  return {
    sessionId: 's1',
    phase: 'grilling',
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
    clockNow: CLOCK,
    timeScale: 1,
    section: null,
    transcript: [
      { id: 'l1', speaker: 'interviewer', text: 'Walk me through retention.' },
      { id: 'l2', speaker: 'candidate', text: 'Net retention is 118%.' }
    ],
    speaking: false,
    canTalk: true,
    endedEarly: false,
    reveal: null,
    deckPage: 1,
    reviewWarned: false,
    ...o
  }
}

function setup(o: Partial<ViewState> = {}): ReturnType<typeof render> & {
  onIntent: Mock<(i: Intent) => void>
  advance: (ms: number) => number
} {
  let t = 1000
  const now = (): number => t
  const onIntent = vi.fn<(i: Intent) => void>()
  const r = render(<Session view={view(o)} onIntent={onIntent} now={now} />)
  return { onIntent, advance: (ms: number) => (t += ms), ...r }
}

const id = (s: string): HTMLElement => screen.getByTestId(s)
const q = (s: string): HTMLElement | null => screen.queryByTestId(s)

afterEach(() => vi.useRealTimers())

describe('Session', () => {
  it('renders the root with phase', () => {
    setup()
    expect(
      document.querySelector('main[data-screen="session"][data-phase="grilling"]')
    ).not.toBeNull()
    expect(id('phase-label').textContent).toBe('Grilling')
    expect(id('webcam-tile').textContent).toContain('Camera — Phase 4')
    expect(id('avatar-stage').textContent).toContain('Interviewer')
  })

  it('review shows the deck placeholder, countdown and ready button', () => {
    const { onIntent } = setup({ phase: 'review', reviewDeadline: CLOCK + 600_000 })
    expect(id('deck-placeholder').textContent).toContain('Deck viewer — Phase 4')
    expect(q('avatar-stage')).toBeNull()
    expect(id('phase-label').textContent).toBe('Review')
    expect(id('countdown').textContent).toBe('10:00')
    expect(q('skip-warmup')).toBeNull()
    fireEvent.click(id('ready-btn'))
    expect(onIntent).toHaveBeenCalledWith({ type: 'ready' })
  })

  it('countdown advances with the time scale and clamps at zero', () => {
    vi.useFakeTimers()
    const { advance, rerender, onIntent } = setup({
      phase: 'review',
      reviewDeadline: CLOCK + 600_000,
      timeScale: 60
    })
    advance(1000)
    act(() => {
      vi.advanceTimersByTime(250)
    })
    expect(id('countdown').textContent).toBe('09:00')
    rerender(
      <Session
        view={view({ phase: 'review', reviewDeadline: CLOCK - 5000 })}
        onIntent={onIntent}
        now={() => 5000}
      />
    )
    expect(id('countdown').textContent).toBe('00:00')
  })

  it('warmup shows skip warm-up and no ready button', () => {
    const { onIntent } = setup({ phase: 'warmup' })
    expect(id('phase-label').textContent).toBe('Warm-up')
    expect(q('ready-btn')).toBeNull()
    fireEvent.click(id('skip-warmup'))
    expect(onIntent).toHaveBeenCalledWith({ type: 'skipWarmup' })
  })

  it('grilling shows the section label', () => {
    setup({ section: { id: 'retention', label: 'Retention', index: 2, total: 7 } })
    expect(id('section-label').textContent).toBe('Retention · 3/7')
  })

  it('talk records and submits the answer duration', () => {
    const { onIntent, advance } = setup()
    const btn = id('talk-btn')
    expect(btn.textContent).toBe('Talk')
    expect(q('answer-timer')).toBeNull()
    fireEvent.click(btn)
    expect(btn.textContent).toBe('Done')
    expect(btn.getAttribute('aria-pressed')).toBe('true')
    expect(id('answer-timer')).not.toBeNull()
    advance(4200)
    fireEvent.click(btn)
    expect(onIntent).toHaveBeenCalledWith({ type: 'answer', ms: 4200 })
    expect(btn.textContent).toBe('Talk')
    expect(btn.getAttribute('aria-pressed')).toBe('false')
  })

  it('space on the body toggles talk, but not when a button has focus', () => {
    const { onIntent, advance } = setup()
    fireEvent.keyDown(document.body, { key: ' ', code: 'Space' })
    expect(id('talk-btn').textContent).toBe('Done')
    advance(1500)
    fireEvent.keyDown(document.body, { key: ' ', code: 'Space' })
    expect(onIntent).toHaveBeenCalledWith({ type: 'answer', ms: 1500 })
    fireEvent.keyDown(id('end-btn'), { key: ' ', code: 'Space' })
    expect(id('talk-btn').textContent).toBe('Talk')
    expect(onIntent).toHaveBeenCalledTimes(1)
  })

  it('disables talk when the candidate cannot talk', () => {
    setup({ canTalk: false })
    expect((id('talk-btn') as HTMLButtonElement).disabled).toBe(true)
  })

  it('renders the transcript and the live region', () => {
    setup({
      transcript: [
        { id: 'a', speaker: 'interviewer', text: 'First.' },
        { id: 'b', speaker: 'candidate', text: 'Answer.' },
        { id: 'c', speaker: 'interviewer', text: 'Second question.' },
        { id: 'd', speaker: 'candidate', text: 'Another.' }
      ]
    })
    const items = id('transcript').querySelectorAll('li')
    expect(Array.from(items).map((li) => li.getAttribute('data-speaker'))).toEqual([
      'interviewer',
      'candidate',
      'interviewer',
      'candidate'
    ])
    expect(id('live-region').getAttribute('aria-live')).toBe('polite')
    expect(id('live-region').textContent).toBe('Second question.')
  })

  it('reflects speaking on the ring', () => {
    setup({ speaking: true })
    expect(id('speaking-ring').getAttribute('data-speaking')).toBe('true')
  })

  it('end session confirms before ending', () => {
    const { onIntent } = setup()
    fireEvent.click(id('end-btn'))
    const dlg = id('end-confirm-dialog')
    expect(dlg.getAttribute('role')).toBe('alertdialog')
    expect(dlg.textContent).toContain('End the session now? You will still get a scorecard.')
    fireEvent.click(id('end-cancel'))
    expect(q('end-confirm-dialog')).toBeNull()
    expect(onIntent).not.toHaveBeenCalled()
    fireEvent.click(id('end-btn'))
    fireEvent.click(id('end-confirm'))
    expect(onIntent).toHaveBeenCalledWith({ type: 'end' })
  })

  it('scoring phase shows the placeholder and disables talk', () => {
    setup({ phase: 'scoring', canTalk: false })
    expect(id('scoring').textContent).toBe('Scoring your session…')
    expect(id('phase-label').textContent).toBe('Scoring')
    expect((id('talk-btn') as HTMLButtonElement).disabled).toBe(true)
  })
})
