import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'
import type { KeyStatus, LibraryView, SpeakEvent, ViewState } from '../../shared/ipc'
import App from './App'
import { getVoice } from './speech/voice'
import { createMicCapture } from './mic/capture'

const fakeVoice = vi.hoisted(() => ({
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
  onDevice: vi.fn(() => () => {})
}))
vi.mock('./speech/voice', () => ({ getVoice: vi.fn(() => fakeVoice) }))

const fakeMic = vi.hoisted(() => ({
  start: vi.fn(async () => {}),
  stop: vi.fn(async () => ({ answerId: 'a1', chunks: 1, ms: 10 })),
  setMuted: vi.fn(),
  close: vi.fn()
}))
vi.mock('./mic/capture', () => ({ createMicCapture: vi.fn(() => fakeMic) }))

const CARD = {
  id: '01',
  number: 1,
  slug: 'acme',
  company: 'Acme',
  vertical: 'SaaS',
  level: 1,
  intervieweePdfPath: 'app://cases/01/interviewee.pdf'
}
const LIB: LibraryView = {
  cases: [{ card: CARD, completed: null }],
  resumable: null,
  quarantined: 0,
  error: null
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

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type -- inferred mock shape
function mockApi(stt?: 'whisper' | 'fake', status: string = 'cpu') {
  const cb: { view?: (v: ViewState) => void; speak?: (s: SpeakEvent) => void } = {}
  const api = {
    config: { tts: 'headtts', ...(stt ? { stt } : {}) },
    key: { status: vi.fn(async (): Promise<KeyStatus> => ({ hasKey: true, source: 'stored' })) },
    library: { list: vi.fn(async () => LIB) },
    session: { intent: vi.fn(async () => {}) },
    speak: { ack: vi.fn(async () => {}), started: vi.fn(async () => {}) },
    stt: { chunk: vi.fn(async () => {}), status: vi.fn(async () => status) },
    onView: vi.fn((f: (v: ViewState) => void) => ((cb.view = f), () => {})),
    onSpeak: vi.fn((f: (s: SpeakEvent) => void) => ((cb.speak = f), () => {})),
    onSpeakCancel: vi.fn(() => () => {})
  }
  window.api = api as unknown as Window['api']
  return { api, cb }
}

const home = (): Promise<HTMLElement> => screen.findByRole('heading', { name: 'Case library' })
const sp = (turnId: string, seq: number): SpeakEvent => ({ turnId, seq, text: `${turnId}${seq}` })

describe('App voice wiring', () => {
  beforeEach(() => vi.clearAllMocks())

  it('given stt whisper, when rendered, then one mic is created, its send forwards to stt.chunk, and Session gets it', async () => {
    const { api, cb } = mockApi('whisper')
    render(<App />)
    await home()
    expect(createMicCapture).toHaveBeenCalledTimes(1)
    const pcm = new Float32Array(4)
    vi.mocked(createMicCapture).mock.calls[0][0].send('a1', 3, pcm)
    expect(api.stt.chunk).toHaveBeenCalledWith('a1', 3, pcm)
    act(() => cb.view!(viewState()))
    fireEvent.click(screen.getByTestId('talk-btn'))
    expect(fakeMic.start).toHaveBeenCalledTimes(1)
  })

  it.each([['fake'], [undefined]] as const)(
    'given stt %s, when rendered, then no mic is created and status is never asked',
    async (stt) => {
      const { api } = mockApi(stt)
      render(<App />)
      await home()
      expect(createMicCapture).not.toHaveBeenCalled()
      expect(api.stt.status).not.toHaveBeenCalled()
      expect(screen.queryByTestId('stt-banner')).toBeNull()
    }
  )

  it('given headtts, when the voice reports started, then speak.started is forwarded', async () => {
    const { api } = mockApi('whisper')
    render(<App />)
    await home()
    const opts = vi.mocked(getVoice).mock.calls[0][0] as {
      started?(t: string, s: number): void
    }
    opts.started!('t1', 2)
    expect(api.speak.started).toHaveBeenCalledWith('t1', 2)
  })

  it.each([
    ['cpu', 'Speech recognition is running on CPU — transcripts will be slow'],
    ['failed', 'Speech recognition failed to load — answers cannot be transcribed'],
    ['metal', null],
    ['off', null]
  ])('given stt status %s, when rendered, then the STT banner matches', async (status, text) => {
    const { api } = mockApi('whisper', status)
    render(<App />)
    await home()
    await waitFor(() => expect(api.stt.status).toHaveBeenCalled())
    if (text) expect((await screen.findByTestId('stt-banner')).textContent).toBe(text)
    else {
      await act(async () => {})
      expect(screen.queryByTestId('stt-banner')).toBeNull()
    }
  })

  it('given a barge-in, when late sentences of the cut turn arrive, then they are dropped but a new turn plays', async () => {
    const { cb } = mockApi('whisper')
    render(<App />)
    await home()
    act(() => cb.view!(viewState({ speaking: true, canTalk: false })))
    act(() => cb.speak!(sp('T', 0)))
    expect(fakeVoice.enqueue).toHaveBeenCalledWith(sp('T', 0))
    fireEvent.click(screen.getByTestId('talk-btn')) // barge-in
    expect(fakeVoice.clear).toHaveBeenCalled()
    act(() => cb.speak!(sp('T', 1)))
    act(() => cb.speak!(sp('U', 0)))
    expect(fakeVoice.enqueue).not.toHaveBeenCalledWith(sp('T', 1))
    expect(fakeVoice.enqueue).toHaveBeenCalledWith(sp('U', 0))
  })
})
