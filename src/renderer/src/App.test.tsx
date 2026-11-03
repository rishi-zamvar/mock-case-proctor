import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { KeyStatus, LibraryView, SaveResult, SpeakEvent, ViewState } from '../../shared/ipc'
import type { TtsDevice, TtsMode } from '../../shared/ipc'
import App from './App'
import { getVoice } from './speech/voice'

const fakeVoice = vi.hoisted(() => {
  const deviceCbs = new Set<(d: string) => void>()
  return {
    host: document.createElement('div'),
    setVisible: vi.fn(),
    setState: vi.fn(),
    isPlaying: vi.fn(() => false),
    onPlaying: vi.fn(() => () => {}),
    enqueue: vi.fn(),
    cancel: vi.fn(),
    clear: vi.fn(),
    warm: vi.fn(async () => {}),
    resume: vi.fn(),
    device: vi.fn(() => null),
    onDevice: vi.fn((cb: (d: string) => void) => {
      deviceCbs.add(cb)
      return (): void => void deviceCbs.delete(cb)
    }),
    emitDevice: (d: string): void => deviceCbs.forEach((cb) => cb(d)),
    deviceCbs
  }
})
vi.mock('./speech/voice', () => ({ getVoice: vi.fn(() => fakeVoice) }))

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
    deckPage: 1,
    reviewWarned: false,
    ...o
  }
}

const REVEAL: ViewState['reveal'] = {
  scorecard: {
    rubric: [],
    total: 0,
    band: 'another',
    flags: [],
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
  checks: { brevity: [], ledWithCall: false, omitted: [], numbers: [] },
  idealAnswer: 'ideal',
  opening: 'opening',
  keyNumbers: [],
  intendedRead: '',
  backSolve: [],
  transcript: []
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- inferred mock shape
function mockApi(
  status: KeyStatus,
  lib: () => Promise<LibraryView> = async () => libraryView(),
  tts?: TtsMode
) {
  const cb: {
    view?: (v: ViewState) => void
    speak?: (s: SpeakEvent) => void
    cancel?: (c: { turnId: string }) => void
  } = {}
  const offView = vi.fn()
  const offSpeak = vi.fn()
  const offCancel = vi.fn()
  const api = {
    ...(tts ? { config: { tts } } : {}),
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
    }),
    onSpeakCancel: vi.fn((f: (c: { turnId: string }) => void) => {
      cb.cancel = f
      return offCancel
    })
  }
  window.api = api as unknown as Window['api']
  return { api, cb, offView, offSpeak, offCancel }
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

describe('App voice wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    fakeVoice.deviceCbs.clear()
  })
  afterEach(() => vi.useRealTimers())

  const banner = (): HTMLElement | null => screen.queryByTestId('voice-banner')

  it('given tts fake, when a speak event arrives, then getVoice is never called and the fake queue acks', async () => {
    const { api, cb } = mockApi({ hasKey: true, source: 'stored' }, undefined, 'fake')
    render(<App />)
    await home()
    vi.useFakeTimers()
    act(() => cb.speak!({ turnId: 't', seq: 0, text: 'hi' }))
    vi.advanceTimersByTime(120)
    expect(api.speak.ack).toHaveBeenCalledWith('t', 0)
    expect(getVoice).not.toHaveBeenCalled()
    expect(api.onSpeakCancel).not.toHaveBeenCalled()
  })

  it('given no config (old mock), when opened, then getVoice is never called', async () => {
    mockApi({ hasKey: true, source: 'stored' })
    render(<App />)
    await home()
    expect(getVoice).not.toHaveBeenCalled()
  })

  it('given tts headtts, when mounted, then creates one voice with a forwarding ack and warms it', async () => {
    const { api } = mockApi({ hasKey: true, source: 'stored' }, undefined, 'headtts')
    render(<App />)
    await home()
    expect(getVoice).toHaveBeenCalledTimes(1)
    expect(fakeVoice.warm).toHaveBeenCalledTimes(1)
    const { ack } = vi.mocked(getVoice).mock.calls[0][0]
    ack('t1', 2, false)
    expect(api.speak.ack).toHaveBeenCalledWith('t1', 2, false)
  })

  it('given tts headtts, when speak and cancel events arrive, then routes them to the voice', async () => {
    const { api, cb } = mockApi({ hasKey: true, source: 'stored' }, undefined, 'headtts')
    render(<App />)
    await home()
    const ev = { turnId: 't', seq: 0, text: 'hi' }
    act(() => cb.speak!(ev))
    expect(fakeVoice.enqueue).toHaveBeenCalledWith(ev)
    act(() => cb.cancel!({ turnId: 't' }))
    expect(fakeVoice.cancel).toHaveBeenCalledWith('t')
    expect(api.speak.ack).not.toHaveBeenCalled()
  })

  it.each<[TtsDevice, string | null]>([
    ['wasm', 'Voice is running on CPU — replies will be slow'],
    ['none', 'Voice failed to load — interviewer lines will appear as captions only'],
    ['webgpu', null]
  ])('given device %s, when reported, then the banner is %s', async (device, text) => {
    mockApi({ hasKey: true, source: 'stored' }, undefined, 'headtts')
    render(<App />)
    await home()
    expect(banner()).toBeNull()
    act(() => fakeVoice.emitDevice(device))
    if (text === null) expect(banner()).toBeNull()
    else {
      expect(banner()!.getAttribute('role')).toBe('alert')
      expect(banner()!.textContent).toBe(text)
    }
  })

  it('given headtts, when Start is clicked, then resumes audio before session.start', async () => {
    const { api } = mockApi({ hasKey: true, source: 'stored' }, undefined, 'headtts')
    let resumedFirst = false
    api.session.start.mockImplementation(async () => {
      resumedFirst = fakeVoice.resume.mock.calls.length === 1
      return { sessionId: 's1' }
    })
    render(<App />)
    await home()
    await userEvent.click(screen.getByTestId('start-01'))
    await userEvent.click(screen.getByTestId('sheet-start'))
    expect(api.session.start).toHaveBeenCalled()
    expect(resumedFirst).toBe(true)
  })

  it('given headtts and a resumable session, when Resume is clicked, then resumes audio', async () => {
    const { api } = mockApi(
      { hasKey: true, source: 'stored' },
      async () =>
        libraryView({
          resumable: { sessionId: 's9', caseId: '01', company: 'Acme', phase: 'grilling' }
        }),
      'headtts'
    )
    render(<App />)
    await userEvent.click(await screen.findByTestId('resume-btn'))
    expect(fakeVoice.resume).toHaveBeenCalled()
    expect(api.session.resume).toHaveBeenCalledWith('s9')
  })

  it('given headtts, when the session shows, then the avatar stage hosts the voice', async () => {
    const { cb } = mockApi({ hasKey: true, source: 'stored' }, undefined, 'headtts')
    render(<App />)
    await home()
    act(() => cb.view!(viewState()))
    expect(screen.getByTestId('avatar-slot').contains(fakeVoice.host)).toBe(true)
  })

  it('given fake mode, when the session shows, then no avatar slot is mounted', async () => {
    const { cb } = mockApi({ hasKey: true, source: 'stored' }, undefined, 'fake')
    render(<App />)
    await home()
    act(() => cb.view!(viewState()))
    expect(screen.queryByTestId('avatar-slot')).toBeNull()
  })

  it('given headtts, when unmounted, then unsubscribes everything and clears the voice', async () => {
    const { offView, offSpeak, offCancel } = mockApi(
      { hasKey: true, source: 'stored' },
      undefined,
      'headtts'
    )
    const r = render(<App />)
    await home()
    r.unmount()
    expect(offView).toHaveBeenCalled()
    expect(offSpeak).toHaveBeenCalled()
    expect(offCancel).toHaveBeenCalled()
    expect(fakeVoice.clear).toHaveBeenCalled()
    expect(fakeVoice.deviceCbs.size).toBe(0)
  })
})
