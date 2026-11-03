import { useCallback, useEffect, useState } from 'react'
import type { KeyStatus, LibraryView, TtsDevice, ViewState } from '../../shared/ipc'
import Settings from './screens/Settings'
import Library from './screens/Library'
import Session from './screens/Session'
import ReviewMode from './screens/ReviewMode'
import { createFakeSpeechQueue } from './speech/fakeSpeechQueue'
import { getVoice, type Voice } from './speech/voice'
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
      ? getVoice({ ack: (t, s, sp) => void window.api.speak.ack(t, s, sp) })
      : null
  )

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
    const speech =
      voice ?? createFakeSpeechQueue({ ack: (t, s) => void window.api.speak.ack(t, s) })
    const offView = window.api.onView((v) => {
      setView(v)
      setScreen((cur) =>
        cur === 'settings' ? cur : v.phase === 'reviewMode' ? 'reviewMode' : 'session'
      )
    })
    const offSpeak = window.api.onSpeak((s) => speech.enqueue(s))
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
      {el}
    </>
  )
}
