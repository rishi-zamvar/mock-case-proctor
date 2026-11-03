import { useState } from 'react'
import styles from './Settings.module.css'
import type { KeySource, KeyStatus, SaveOutcome } from '../../../shared/ipc'

type Props = {
  status: KeyStatus
  onStatus(s: KeyStatus): void
  onDone(): void
  onBack(): void
}

const MESSAGES: Record<Exclude<SaveOutcome, 'valid'>, string> = {
  invalid: 'Anthropic rejected that key.',
  unverified: "Couldn't verify the key. Check your connection.",
  unavailable: 'Secure storage is unavailable. Key not saved.',
  empty: 'Paste a key first.'
}

const SOURCES: Record<Exclude<KeySource, 'none'>, string> = {
  stored: 'Stored encrypted in macOS Keychain',
  env: 'Loaded from ANTHROPIC_API_KEY',
  dotenv: 'Loaded from .env'
}

export default function Settings({ status, onStatus, onDone, onBack }: Props): React.JSX.Element {
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [message, setMessage] = useState<SaveOutcome | null>(null)
  const [busy, setBusy] = useState(false)
  const showInput = !status.hasKey || editing

  async function save(force: boolean): Promise<void> {
    setBusy(true)
    try {
      const res = await (force
        ? window.api.key.save(draft, { force: true })
        : window.api.key.save(draft))
      onStatus(res.status)
      if (res.result === 'valid' || (force && res.status.hasKey)) {
        setDraft('')
        setEditing(false)
        setMessage(null)
        onDone()
      } else {
        setMessage(res.result)
      }
    } finally {
      setBusy(false)
    }
  }

  async function clear(): Promise<void> {
    setBusy(true)
    try {
      onStatus(await window.api.key.clear())
      setEditing(false)
      setMessage(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main data-screen="settings" className={styles.page}>
      <div className={styles.card}>
        <h1>Anthropic API key</h1>
        <p data-testid="key-status" className={status.hasKey ? styles.ok : styles.muted}>
          {status.hasKey ? 'Key saved ✓' : 'No key saved'}
        </p>
        {status.source !== 'none' && (
          <p data-testid="key-source" className={styles.muted}>
            {SOURCES[status.source]}
          </p>
        )}

        {showInput ? (
          <form
            className={styles.row}
            onSubmit={(e) => {
              e.preventDefault()
              void save(false)
            }}
          >
            <input
              data-testid="key-input"
              type="password"
              aria-label="Anthropic API key"
              autoComplete="off"
              spellCheck={false}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button data-testid="save-btn" type="submit" disabled={busy}>
              Save & verify
            </button>
          </form>
        ) : (
          <div className={styles.row}>
            <button
              data-testid="replace-btn"
              type="button"
              disabled={busy}
              onClick={() => setEditing(true)}
            >
              Replace
            </button>
            <button
              data-testid="clear-btn"
              type="button"
              disabled={busy}
              onClick={() => void clear()}
            >
              Clear
            </button>
          </div>
        )}

        {message && message !== 'valid' && (
          <p
            data-testid="key-message"
            role="status"
            className={message === 'unverified' ? styles.warning : styles.danger}
          >
            {MESSAGES[message]}
          </p>
        )}
        {message === 'unverified' && (
          <button
            data-testid="save-anyway-btn"
            type="button"
            disabled={busy}
            onClick={() => void save(true)}
          >
            Save anyway
          </button>
        )}
        {status.hasKey && (
          <button data-testid="back-btn" type="button" onClick={onBack}>
            Back
          </button>
        )}
      </div>
    </main>
  )
}
