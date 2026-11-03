import { useEffect, useState } from 'react'
import type { KeyStatus } from '../../shared/ipc'
import Settings from './screens/Settings'
import Home from './screens/Home'

type Screen = 'loading' | 'settings' | 'home'

export default function App(): React.JSX.Element {
  const [status, setStatus] = useState<KeyStatus | null>(null)
  const [screen, setScreen] = useState<Screen>('loading')

  useEffect(() => {
    void window.api.key.status().then((s) => {
      setStatus(s)
      setScreen(s.hasKey ? 'home' : 'settings')
    })
  }, [])

  if (screen === 'loading' || !status) return <main data-screen="loading" />
  if (screen === 'home') return <Home onOpenSettings={() => setScreen('settings')} />
  return (
    <Settings
      status={status}
      onStatus={setStatus}
      onDone={() => setScreen('home')}
      onBack={() => setScreen('home')}
    />
  )
}
