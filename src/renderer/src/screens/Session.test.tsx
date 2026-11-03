import { describe, it, expect, vi, afterEach, type Mock } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import type { Intent, ViewState } from '../../../shared/ipc'
import * as reactPdf from 'react-pdf'
import Session from './Session'
import type { AvatarBinding, AvatarState } from '../avatar/behaviour'

const CLOCK = 1_700_000_000_000

function view(o: Partial<ViewState> = {}): ViewState {
  return {
    sessionId: 's1',
    phase: 'grilling',
    card: {
      id: '99',
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
    expect(id('webcam-tile')).not.toBeNull()
    expect(id('avatar-stage').textContent).toContain('Interviewer')
  })

  it('review shows the deck, countdown and ready button', () => {
    const { onIntent } = setup({ phase: 'review', reviewDeadline: CLOCK + 600_000 })
    expect(id('deck-viewer')).not.toBeNull()
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
    expect(q('score-retry')).toBeNull()
  })

  it('scoring failed shows an alert and a retry button that sends retryScore once', () => {
    const { onIntent } = setup({ phase: 'scoring', canTalk: false, scoringFailed: true })
    expect(screen.getByRole('alert').textContent).toContain('Scoring failed')
    expect(id('score-retry').textContent).toBe('Retry scoring')
    fireEvent.click(id('score-retry'))
    expect(onIntent).toHaveBeenCalledTimes(1)
    expect(onIntent).toHaveBeenCalledWith({ type: 'retryScore' })
  })
})

describe('Session — Phase 4', () => {
  const rv = (o: Partial<ViewState> = {}): Partial<ViewState> => ({
    phase: 'review',
    reviewDeadline: CLOCK + 600_000,
    ...o
  })

  it('review deck loads the case pdf from app://bundle', () => {
    const doc = vi.spyOn(reactPdf, 'Document')
    setup(rv())
    expect(doc.mock.calls[0][0].file).toBe('app://bundle/cases/99/interviewee.pdf')
    doc.mockRestore()
  })

  it('deck opens on view.deckPage and reports page changes', () => {
    const { onIntent } = setup(rv({ deckPage: 3 }))
    expect(id('deck-viewer').getAttribute('data-page')).toBe('3')
    fireEvent.click(id('thumb-2'))
    expect(onIntent).toHaveBeenCalledWith({ type: 'deckPage', page: 2 })
  })

  it('grilling toggles between the interviewer and the deck', () => {
    setup()
    const t = id('deck-toggle')
    expect(t.getAttribute('aria-pressed')).toBe('false')
    expect(id('avatar-stage')).not.toBeNull()
    fireEvent.click(t)
    expect(id('deck-viewer')).not.toBeNull()
    expect(q('avatar-stage')).toBeNull()
    expect(id('deck-toggle').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(id('deck-toggle'))
    expect(id('avatar-stage')).not.toBeNull()
    expect(q('deck-viewer')).toBeNull()
  })

  it.each(['review', 'scoring', 'warmup'] as const)('no deck toggle in %s', (phase) => {
    setup(rv({ phase }))
    expect(q('deck-toggle')).toBeNull()
  })

  it('countdown never moves backward for the same deadline, resets on a new one', () => {
    let t = 1000
    const onIntent = vi.fn()
    const { rerender } = render(<Session view={view(rv())} onIntent={onIntent} now={() => t} />)
    t += 10_000
    rerender(
      <Session view={view(rv({ clockNow: CLOCK + 10_000 }))} onIntent={onIntent} now={() => t} />
    )
    expect(id('countdown').textContent).toBe('09:50')
    // a new view anchored 2 s in the past would estimate 2 s higher
    rerender(
      <Session view={view(rv({ clockNow: CLOCK + 8000 }))} onIntent={onIntent} now={() => t} />
    )
    expect(id('countdown').textContent).toBe('09:50')
    rerender(
      <Session
        view={view(rv({ reviewDeadline: CLOCK + 1_200_000 }))}
        onIntent={onIntent}
        now={() => t}
      />
    )
    expect(id('countdown').textContent).toBe('20:00')
  })

  it('visibilitychange recomputes the countdown immediately', () => {
    vi.useFakeTimers()
    const { advance } = setup(rv({ timeScale: 60 }))
    advance(1000)
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(id('countdown').textContent).toBe('09:00')
  })

  it('shows the 10-minute toast once when reviewWarned flips, hides after 8 s', () => {
    vi.useFakeTimers()
    const onIntent = vi.fn()
    const { rerender } = render(<Session view={view(rv())} onIntent={onIntent} now={() => 1} />)
    expect(q('review-warning')).toBeNull()
    rerender(<Session view={view(rv({ reviewWarned: true }))} onIntent={onIntent} now={() => 1} />)
    const toast = id('review-warning')
    expect(toast.getAttribute('role')).toBe('status')
    expect(toast.textContent).toBe('10 minutes left')
    act(() => {
      vi.advanceTimersByTime(8000)
    })
    expect(q('review-warning')).toBeNull()
  })

  it('no toast when mounting with reviewWarned already true', () => {
    setup(rv({ reviewWarned: true }))
    expect(q('review-warning')).toBeNull()
  })

  it('camera toggle turns the tile off; scoring forces it off', () => {
    setup()
    const cam = id('cam-toggle')
    expect(cam.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(cam)
    expect(id('cam-toggle').getAttribute('aria-pressed')).toBe('false')
    expect(id('webcam-tile').getAttribute('data-state')).toBe('off')
    expect(id('camera-off')).not.toBeNull()
  })

  it('scoring has the tile off', () => {
    setup({ phase: 'scoring', canTalk: false })
    expect(id('webcam-tile').getAttribute('data-state')).toBe('off')
  })

  it('mic toggle flips its label and sends no intent', () => {
    const { onIntent } = setup()
    const mic = id('mic-toggle')
    expect(mic.getAttribute('aria-pressed')).toBe('false')
    expect(mic.textContent).toBe('Mute')
    fireEvent.click(mic)
    expect(id('mic-toggle').getAttribute('aria-pressed')).toBe('true')
    expect(id('mic-toggle').textContent).toBe('Unmute')
    expect(onIntent).not.toHaveBeenCalled()
  })

  it('deck arrow keys do not trigger talk', () => {
    setup(rv())
    fireEvent.keyDown(document.body, { key: 'ArrowRight', code: 'ArrowRight' })
    fireEvent.keyDown(document.body, { key: 'PageDown', code: 'PageDown' })
    expect(id('talk-btn').textContent).toBe('Talk')
  })
})

describe('Session — avatar stage (05-06)', () => {
  function fake(): AvatarBinding & {
    setState: Mock<(s: AvatarState) => void>
    setVisible: Mock<(v: boolean) => void>
  } {
    return {
      host: document.createElement('div'),
      setVisible: vi.fn<(v: boolean) => void>(),
      setState: vi.fn<(s: AvatarState) => void>(),
      isPlaying: () => false,
      onPlaying: () => () => {}
    }
  }
  const mount = (a: AvatarBinding, o: Partial<ViewState> = {}): ReturnType<typeof render> =>
    render(<Session view={view(o)} onIntent={vi.fn()} now={() => 1000} avatar={a} />)

  it('given an avatar, when Talk is clicked, then the avatar listens', () => {
    const a = fake()
    mount(a)
    expect(a.setState).toHaveBeenLastCalledWith('idle')
    fireEvent.click(id('talk-btn'))
    expect(a.setState).toHaveBeenLastCalledWith('listening')
  })

  it('given an avatar, when an LLM turn is in flight or in extraction, then it thinks', () => {
    const a = fake()
    const { rerender } = mount(a, { speaking: true })
    expect(a.setState).toHaveBeenLastCalledWith('thinking')
    rerender(
      <Session
        view={view({ phase: 'extraction' })}
        onIntent={vi.fn()}
        now={() => 1000}
        avatar={a}
      />
    )
    expect(a.setState).toHaveBeenLastCalledWith('thinking')
  })

  it('given an avatar, when the deck is toggled and back, then the same host is detached and re-attached', () => {
    const a = fake()
    mount(a)
    expect(id('avatar-stage').contains(a.host)).toBe(true)
    fireEvent.click(id('deck-toggle'))
    expect(a.setVisible).toHaveBeenLastCalledWith(false)
    expect(document.contains(a.host)).toBe(false)
    fireEvent.click(id('deck-toggle'))
    expect(a.setVisible).toHaveBeenLastCalledWith(true)
    expect(id('avatar-stage').contains(a.host)).toBe(true)
  })
})
