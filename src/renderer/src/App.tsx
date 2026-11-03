import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyStatus, LibraryView, SttStatus, TtsDevice, ViewState } from '../../shared/ipc'
import Settings from './screens/Settings'
import Library from './screens/Library'
import Session from './screens/Session'
import ReviewMode from './screens/ReviewMode'
import { createFakeSpeechQueue } from './speech/fakeSpeechQueue'
import { getVoice, type Voice } from './speech/voice'
import { createMicCapture } from './mic/capture'
import styles from './App.module.css'

type Screen = 'loading' | 'settings' | 'home' | 'session' | 'reviewMode'

const LIBRARY_ERROR: LibraryView = {
  cases: [],
  resumable: null,
  quarantined: 0,
  error: 'Could not load the case library.'
}

const BANNER: Partial<Record<TtsDevice, string>> = {
  wasm: 'Voice is running on CPU — replies will be slow',
  none: 'Voice failed to load — interviewer lines will appear as captions only'
}

const STT_BANNER: Partial<Record<SttStatus, string>> = {
  cpu: 'Speech recognition is running on CPU — transcripts will be slow',
  failed: 'Speech recognition failed to load — answers cannot be transcribed'
}

// Routing only: every action is forwarded to main over window.api.
export default function App(): React.JSX.Element {
  const [status, setStatus] = useState<KeyStatus | null>(null)
  const [screen, setScreen] = useState<Screen>('loading')
  const [library, setLibrary] = useState<LibraryView | null>(null)
  const [view, setView] = useState<ViewState | null>(null)
  const [device, setDevice] = useState<TtsDevice | null>(null)
  // The only getVoice caller: one runtime per app lifetime, never created in fake mode.
  const [voice] = useState<Voice | null>(() =>
    (window.api.config?.tts ?? 'fake') === 'headtts'
      ? getVoice({
          ack: (t, s, sp) => void window.api.speak.ack(t, s, sp),
          started: (t, s) => void window.api.speak.started?.(t, s)
        })
      : null
  )
  const sttMode = window.api.config?.stt ?? 'fake'
  // Real capture only in whisper mode; T1 (fake STT) keeps the timer-only Talk button.
  const [mic] = useState(() =>
    sttMode === 'whisper'
      ? createMicCapture({ send: (id, i, p) => void window.api.stt?.chunk(id, i, p) })
      : null
  )
  const [sttStatus, setSttStatus] = useState<SttStatus | null>(null)
  const speechRef = useRef<{ clear(): void } | null>(null)
  const lastTurn = useRef<string | null>(null)
  // ponytail: cut turn ids grow for the app lifetime; a few strings per barge-in
  const cut = useRef(new Set<string>())
  const stopSpeech = useCallback((): void => {
    if (lastTurn.current) cut.current.add(lastTurn.current)
    speechRef.current?.clear()
  }, [])

  const goHome = useCallback((): void => {
    window.api.library.list().then(setLibrary, () => setLibrary(LIBRARY_ERROR))
    setScreen('home')
  }, [])

  useEffect(() => {
    void window.api.key.status().then((s) => {
      setStatus(s)
      if (s.hasKey) goHome()
      else setScreen('settings')
    })
  }, [goHome])

  useEffect(() => {
    if (sttMode === 'whisper')
      void window.api.stt?.status().then(setSttStatus, () => setSttStatus('failed'))
  }, [sttMode])

  useEffect(() => {
    const speech =
      voice ?? createFakeSpeechQueue({ ack: (t, s) => void window.api.speak.ack(t, s) })
    speechRef.current = speech
    const offView = window.api.onView((v) => {
      setView(v)
      setScreen((cur) =>
        cur === 'settings' ? cur : v.phase === 'reviewMode' ? 'reviewMode' : 'session'
      )
    })
    const offSpeak = window.api.onSpeak((s) => {
      lastTurn.current = s.turnId
      if (!cut.current.has(s.turnId)) speech.enqueue(s) // late sentences of a barged-in turn
    })
    let offDevice = (): void => {}
    let offCancel = (): void => {}
    if (voice) {
      void voice.warm()
      offDevice = voice.onDevice(setDevice)
      offCancel = window.api.onSpeakCancel((c) => voice.cancel(c.turnId))
    }
    return () => {
      offView()
      offSpeak()
      offDevice()
      offCancel()
      speech.clear() // the voice runtime itself persists
    }
  }, [voice])

  const bannerText = device ? BANNER[device] : undefined
  const banner = bannerText ? (
    <div data-testid="voice-banner" role="alert" className={styles.banner}>
      {bannerText}
    </div>
  ) : null
  const sttText = sttStatus ? STT_BANNER[sttStatus] : undefined

  let el: React.JSX.Element
  if (screen === 'loading' || !status) el = <main data-screen="loading" />
  else if (screen === 'settings')
    el = <Settings status={status} onStatus={setStatus} onDone={goHome} onBack={goHome} />
  else if (screen === 'session' && view)
    el = (
      <Session
        view={view}
        onIntent={(i) => void window.api.session.intent(i)}
        avatar={voice ?? undefined}
        mic={mic ?? undefined}
        stopSpeech={stopSpeech}
      />
    )
  else if (screen === 'reviewMode' && view)
    el = (
      <ReviewMode
        view={view}
        onBack={() => {
          setView(null)
          goHome()
        }}
      />
    )
  else if (!library) el = <main data-screen="loading" />
  else
    el = (
      <Library
        view={library}
        onStart={(id, opts) => {
          voice?.resume() // the user gesture unlocks the AudioContext
          void window.api.session.start(id, opts)
        }}
        onResume={(id) => {
          voice?.resume()
          void window.api.session.resume(id)
        }}
        onDiscard={(id) => void window.api.session.discard(id).then(goHome)}
        onOpenSettings={() => setScreen('settings')}
      />
    )
  return (
    <>
      {banner}
      {sttText && (
        <div data-testid="stt-banner" role="alert" className={styles.banner}>
          {sttText}
        </div>
      )}
      {el}
    </>
  )
}
