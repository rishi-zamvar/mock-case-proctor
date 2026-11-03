import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import type { Intent, ViewState } from '../../../shared/ipc'
import Session from './Session'

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
    transcript: [],
    speaking: false,
    canTalk: true,
    endedEarly: false,
    reveal: null,
    deckPage: 1,
    reviewWarned: false,
    ...o
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- test harness
function setup(o: Partial<ViewState> = {}, opts: { mic?: boolean; startFails?: boolean } = {}) {
  let t = 1000
  const order: string[] = []
  let onCap: (() => void) | null = null
  const mic = {
    start: vi.fn((cb: () => void) => {
      order.push('start')
      onCap = cb
      return opts.startFails ? Promise.reject(new Error('denied')) : Promise.resolve()
    }),
    stop: vi.fn(async () => ({ answerId: 'a1', chunks: 2, ms: 0 })),
    setMuted: vi.fn()
  }
  const stopSpeech = vi.fn(() => order.push('stopSpeech'))
  const onIntent = vi.fn((i: Intent) => order.push(`intent:${i.type}`))
  const r = render(
    <Session
      view={view(o)}
      onIntent={onIntent}
      now={() => t}
      mic={opts.mic === false ? undefined : mic}
      stopSpeech={stopSpeech}
    />
  )
  return {
    ...r,
    mic,
    stopSpeech,
    onIntent,
    order,
    cap: () => onCap!(),
    advance: (ms: number) => (t += ms)
  }
}

const id = (s: string): HTMLElement => screen.getByTestId(s)
const q = (s: string): HTMLElement | null => screen.queryByTestId(s)

afterEach(() => vi.useRealTimers())

describe('Session voice', () => {
  it('given a mic, when Talk is clicked twice, then capture starts, the timer shows, and the answer carries answerId and chunks', async () => {
    const s = setup()
    fireEvent.click(id('talk-btn'))
    expect(s.mic.start).toHaveBeenCalledTimes(1)
    expect(id('answer-timer')).not.toBeNull()
    s.advance(4200)
    fireEvent.click(id('talk-btn'))
    expect(s.mic.stop).toHaveBeenCalledTimes(1)
    await waitFor(() =>
      expect(s.onIntent).toHaveBeenCalledWith({
        type: 'answer',
        ms: 4200,
        answerId: 'a1',
        chunks: 2
      })
    )
  })

  it('given a mic, when Space is pressed twice, then it behaves like the Talk button', async () => {
    const s = setup()
    fireEvent.keyDown(window, { code: 'Space', key: ' ' })
    expect(s.mic.start).toHaveBeenCalledTimes(1)
    s.advance(1000)
    fireEvent.keyDown(window, { code: 'Space', key: ' ' })
    await waitFor(() =>
      expect(s.onIntent).toHaveBeenCalledWith({
        type: 'answer',
        ms: 1000,
        answerId: 'a1',
        chunks: 2
      })
    )
  })

  it('given a mic and the avatar speaking in grilling, when Talk is clicked, then speech stops before bargeIn and recording starts', () => {
    const s = setup({ speaking: true, canTalk: false })
    expect((id('talk-btn') as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(id('talk-btn'))
    expect(s.order).toEqual(['stopSpeech', 'intent:bargeIn', 'start'])
    expect(s.onIntent).toHaveBeenCalledWith({ type: 'bargeIn' })
    expect(id('talk-btn').textContent).toBe('Done')
  })

  it('given no mic and the avatar speaking, when rendered, then Talk is disabled (T1 unchanged)', () => {
    setup({ speaking: true, canTalk: false }, { mic: false })
    expect((id('talk-btn') as HTMLButtonElement).disabled).toBe(true)
  })

  it.each(['review', 'scoring'] as const)(
    'given a mic and speaking in %s, when rendered, then barge-in is not offered',
    (phase) => {
      setup({ speaking: true, canTalk: false, phase })
      expect((id('talk-btn') as HTMLButtonElement).disabled).toBe(true)
    }
  )

  it('given recording, when time passes, then the timer data-band follows the brevity band', () => {
    vi.useFakeTimers()
    const s = setup()
    fireEvent.click(id('talk-btn'))
    const at = (ms: number): string | null => {
      s.advance(ms)
      act(() => vi.advanceTimersByTime(250))
      return id('answer-timer').getAttribute('data-band')
    }
    expect(at(5000)).toBe('short')
    expect(at(40_000)).toBe('ideal')
    expect(at(50_000)).toBe('flagged')
  })

  it('given view.transcribing, when rendered, then a Transcribing status shows; otherwise it is absent', () => {
    const s = setup({ transcribing: true })
    expect(id('transcribing').getAttribute('role')).toBe('status')
    expect(id('transcribing').textContent).toBe('Transcribing…')
    s.rerender(
      <Session view={view({ transcribing: false })} onIntent={s.onIntent} mic={s.mic} />
    )
    expect(q('transcribing')).toBeNull()
  })

  it('given a mic, when Mute is toggled on and off, then setMuted(true) then setMuted(false)', () => {
    const s = setup()
    s.mic.setMuted.mockClear()
    fireEvent.click(id('mic-toggle'))
    fireEvent.click(id('mic-toggle'))
    expect(s.mic.setMuted.mock.calls).toEqual([[true], [false]])
  })

  it('given recording, when the mic cap fires, then the answer is sent once as if Done was clicked', async () => {
    const s = setup()
    fireEvent.click(id('talk-btn'))
    s.advance(2000)
    act(() => s.cap())
    await waitFor(() => expect(s.onIntent).toHaveBeenCalledTimes(1))
    expect(s.onIntent).toHaveBeenCalledWith({
      type: 'answer',
      ms: 2000,
      answerId: 'a1',
      chunks: 2
    })
    expect(id('talk-btn').textContent).toBe('Talk')
  })

  it('given mic.start rejects, when the user stops, then the answer is still sent with stop() chunks', async () => {
    const s = setup({}, { startFails: true })
    fireEvent.click(id('talk-btn'))
    s.advance(500)
    fireEvent.click(id('talk-btn'))
    await waitFor(() =>
      expect(s.onIntent).toHaveBeenCalledWith({
        type: 'answer',
        ms: 500,
        answerId: 'a1',
        chunks: 2
      })
    )
  })
})
