import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { KeyStatus, LibraryView, SaveResult, SpeakEvent, ViewState } from '../../shared/ipc'
import App from './App'

const KEY = 'paste-key-' + 'q'.repeat(6)

const CARD = {
  id: '01',
  number: 1,
  slug: 'acme',
  company: 'Acme',
  vertical: 'SaaS',
  level: 1,
  intervieweePdfPath: 'app://cases/01/interviewee.pdf'
}

function libraryView(o: Partial<LibraryView> = {}): LibraryView {
  return {
    cases: [{ card: CARD, completed: null }],
    resumable: null,
    quarantined: 0,
    error: null,
    ...o
  }
}

function viewState(o: Partial<ViewState> = {}): ViewState {
  return {
    sessionId: 's1',
    phase: 'grilling',
    card: CARD,
    reviewDeadline: null,
    clockNow: 0,
    timeScale: 1,
    section: null,
    transcript: [],
    speaking: false,
    canTalk: true,
    endedEarly: false,
    reveal: null,
    ...o
  }
}

const REVEAL: ViewState['reveal'] = {
  scorecard: {
    rubric: [],
    total: 0,
    band: 'weak',
    flags: [],
    graderModel: 'fake',
    promptVersion: 'v0'
  },
  checks: { brevity: [], ledWithCall: false, omitted: [], numbers: [] },
  idealAnswer: 'ideal',
  opening: 'opening',
  keyNumbers: []
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- inferred mock shape
function mockApi(status: KeyStatus, lib: () => Promise<LibraryView> = async () => libraryView()) {
  const cb: { view?: (v: ViewState) => void; speak?: (s: SpeakEvent) => void } = {}
  const offView = vi.fn()
  const offSpeak = vi.fn()
  const api = {
    key: {
      status: vi.fn(async () => status),
      save: vi.fn<(k: string, o?: { force?: boolean }) => Promise<SaveResult>>(),
      clear: vi.fn(async (): Promise<KeyStatus> => ({ hasKey: false, source: 'none' }))
    },
    library: { list: vi.fn(lib) },
    session: {
      start: vi.fn(async () => ({ sessionId: 's1' })),
      intent: vi.fn(async () => {}),
      resume: vi.fn(async () => ({ sessionId: 's1' })),
      discard: vi.fn(async () => {})
    },
    speak: { ack: vi.fn(async () => {}) },
    onView: vi.fn((f: (v: ViewState) => void) => {
      cb.view = f
      return offView
    }),
    onSpeak: vi.fn((f: (s: SpeakEvent) => void) => {
      cb.speak = f
      return offSpeak
    })
  }
  window.api = api as unknown as Window['api']
  return { api, cb, offView, offSpeak }
}

const main = (s: string): Element | null => document.querySelector(`main[data-screen="${s}"]`)
const home = (): Promise<HTMLElement> => screen.findByRole('heading', { name: 'Case library' })

describe('App routing', () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.useRealTimers())

  it('given no key, when opened, then shows settings', async () => {
    mockApi({ hasKey: false, source: 'none' })
    render(<App />)
    await screen.findByRole('heading', { name: 'Anthropic API key' })
    expect(main('settings')).not.toBeNull()
  })

  it('given a key, when opened, then shows the library and navigates to settings and back', async () => {
    const { api } = mockApi({ hasKey: true, source: 'stored' })
    render(<App />)
    await home()
    expect(main('home')).not.toBeNull()
    expect(api.library.list).toHaveBeenCalled()
    await userEvent.click(screen.getByTestId('open-settings'))
    expect(main('settings')).not.toBeNull()
    await userEvent.click(screen.getByTestId('back-btn'))
    await home()
    expect(main('home')).not.toBeNull()
  })

  it('given first-run settings, when a valid key is saved, then shows the library', async () => {
    const { api } = mockApi({ hasKey: false, source: 'none' })
    api.key.save.mockResolvedValue({ result: 'valid', status: { hasKey: true, source: 'stored' } })
    render(<App />)
    await userEvent.type(await screen.findByTestId('key-input'), KEY)
    await userEvent.click(screen.getByTestId('save-btn'))
    await home()
    expect(api.library.list).toHaveBeenCalled()
  })

  it('given the library, when a case is started, then calls session.start with warm-up', async () => {
    const { api } = mockApi({ hasKey: true, source: 'stored' })
    render(<App />)
    await home()
    await userEvent.click(screen.getByTestId('start-01'))
    await userEvent.click(screen.getByTestId('sheet-start'))
    expect(api.session.start).toHaveBeenCalledWith('01', { warmup: true })
  })

  it('given a view push, when grilling, then shows the session and forwards intents', async () => {
    const { api, cb } = mockApi({ hasKey: true, source: 'stored' })
    render(<App />)
    await home()
    act(() => cb.view!(viewState()))
    expect(
      document.querySelector('main[data-screen="session"][data-phase="grilling"]')
    ).not.toBeNull()
    fireEvent.click(screen.getByTestId('talk-btn'))
    fireEvent.click(screen.getByTestId('talk-btn'))
    expect(api.session.intent).toHaveBeenCalledWith(expect.objectContaining({ type: 'answer' }))
    act(() => cb.view!(viewState({ phase: 'review', reviewDeadline: 1000 })))
    fireEvent.click(screen.getByTestId('ready-btn'))
    expect(api.session.intent).toHaveBeenCalledWith({ type: 'ready' })
  })

  it('given a reviewMode push, when back is clicked, then reloads the library', async () => {
    const { api, cb } = mockApi({ hasKey: true, source: 'stored' })
    render(<App />)
    await home()
    act(() => cb.view!(viewState({ phase: 'reviewMode', reveal: REVEAL })))
    expect(main('reviewMode')).not.toBeNull()
    const calls = api.library.list.mock.calls.length
    await userEvent.click(screen.getByTestId('back-to-library'))
    await home()
    expect(api.library.list.mock.calls.length).toBe(calls + 1)
    expect(main('home')).not.toBeNull()
  })

  it('given a speak event, when 120 ms pass, then acks the sentence', async () => {
    const { api, cb } = mockApi({ hasKey: true, source: 'stored' })
    render(<App />)
    await home()
    vi.useFakeTimers()
    act(() => cb.speak!({ turnId: 't', seq: 0, text: 'hi there' }))
    vi.advanceTimersByTime(119)
    expect(api.speak.ack).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(api.speak.ack).toHaveBeenCalledWith('t', 0)
  })

  it('given subscriptions, when unmounted, then unsubscribes both', async () => {
    const { offView, offSpeak } = mockApi({ hasKey: true, source: 'stored' })
    const r = render(<App />)
    await home()
    r.unmount()
    expect(offView).toHaveBeenCalled()
    expect(offSpeak).toHaveBeenCalled()
  })

  it('given library.list rejects, when opened, then shows the library error', async () => {
    mockApi({ hasKey: true, source: 'stored' }, async () => {
      throw new Error('boom')
    })
    render(<App />)
    expect((await screen.findByTestId('library-error')).textContent).toBe(
      'Could not load the case library.'
    )
    expect(main('home')).not.toBeNull()
  })

  it('given a resumable session, when resumed or discarded, then forwards and reloads', async () => {
    const { api } = mockApi({ hasKey: true, source: 'stored' }, async () =>
      libraryView({
        resumable: { sessionId: 's9', caseId: '01', company: 'Acme', phase: 'grilling' }
      })
    )
    render(<App />)
    await userEvent.click(await screen.findByTestId('resume-btn'))
    expect(api.session.resume).toHaveBeenCalledWith('s9')
    const calls = api.library.list.mock.calls.length
    await userEvent.click(screen.getByTestId('discard-btn'))
    expect(api.session.discard).toHaveBeenCalledWith('s9')
    await vi.waitFor(() => expect(api.library.list.mock.calls.length).toBe(calls + 1))
  })
})
