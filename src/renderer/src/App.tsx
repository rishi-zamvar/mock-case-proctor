import { useCallback, useEffect, useState } from 'react'
import type { KeyStatus, LibraryView, ViewState } from '../../shared/ipc'
import Settings from './screens/Settings'
import Library from './screens/Library'
import Session from './screens/Session'
import ReviewMode from './screens/ReviewMode'
import { createFakeSpeechQueue } from './speech/fakeSpeechQueue'

type Screen = 'loading' | 'settings' | 'home' | 'session' | 'reviewMode'

const LIBRARY_ERROR: LibraryView = {
  cases: [],
  resumable: null,
  quarantined: 0,
  error: 'Could not load the case library.'
}

// Routing only: every action is forwarded to main over window.api.
export default function App(): React.JSX.Element {
  const [status, setStatus] = useState<KeyStatus | null>(null)
  const [screen, setScreen] = useState<Screen>('loading')
  const [library, setLibrary] = useState<LibraryView | null>(null)
  const [view, setView] = useState<ViewState | null>(null)

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
    const queue = createFakeSpeechQueue({ ack: (t, s) => void window.api.speak.ack(t, s) })
    const offView = window.api.onView((v) => {
      setView(v)
      setScreen((cur) =>
        cur === 'settings' ? cur : v.phase === 'reviewMode' ? 'reviewMode' : 'session'
      )
    })
    const offSpeak = window.api.onSpeak((s) => queue.enqueue(s))
    return () => {
      offView()
      offSpeak()
      queue.clear()
    }
  }, [])

  if (screen === 'loading' || !status) return <main data-screen="loading" />
  if (screen === 'settings')
    return <Settings status={status} onStatus={setStatus} onDone={goHome} onBack={goHome} />
  if (screen === 'session' && view)
    return <Session view={view} onIntent={(i) => void window.api.session.intent(i)} />
  if (screen === 'reviewMode' && view)
    return (
      <ReviewMode
        view={view}
        onBack={() => {
          setView(null)
          goHome()
        }}
      />
    )
  if (!library) return <main data-screen="loading" />
  return (
    <Library
      view={library}
      onStart={(id, opts) => void window.api.session.start(id, opts)}
      onResume={(id) => void window.api.session.resume(id)}
      onDiscard={(id) => void window.api.session.discard(id).then(goHome)}
      onOpenSettings={() => setScreen('settings')}
    />
  )
}
