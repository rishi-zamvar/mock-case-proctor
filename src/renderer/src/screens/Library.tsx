import { useEffect, useRef, useState } from 'react'
import type { LibraryView, StartOptions, ViewPhase } from '../../../shared/ipc'
import styles from './Library.module.css'

export type LibraryProps = {
  view: LibraryView
  onStart(caseId: string, opts: StartOptions): void
  onResume(sessionId: string): void
  onDiscard(sessionId: string): void
  onOpenSettings(): void
}

const PHASE_LABEL: Record<ViewPhase, string> = {
  warmup: 'warm-up',
  review: 'review',
  presentation: 'presentation',
  extraction: 'presentation',
  grilling: 'grilling',
  wrapup: 'wrap-up',
  scoring: 'scoring',
  reviewMode: 'review mode'
}

const fmtDate = (at: number): string =>
  new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

export default function Library(p: LibraryProps): React.JSX.Element {
  const { view } = p
  const [sheet, setSheet] = useState<{ caseId: string; company: string } | null>(null)
  const [warmup, setWarmup] = useState(true)
  const startRef = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (sheet) startRef.current?.focus()
  }, [sheet])

  const open = (caseId: string, company: string): void => {
    returnFocus.current = document.activeElement as HTMLElement | null
    setWarmup(true)
    setSheet({ caseId, company })
  }
  const close = (): void => {
    setSheet(null)
    returnFocus.current?.focus()
  }
  const start = (): void => {
    if (!sheet) return
    p.onStart(sheet.caseId, { warmup })
    setSheet(null)
  }

  return (
    <main data-screen="home" className={styles.page}>
      {view.resumable && (
        <div data-testid="resume-banner" className={styles.strip}>
          <span>
            Resume your {view.resumable.company} session from {PHASE_LABEL[view.resumable.phase]}?
          </span>
          <span className={styles.actions}>
            <button
              data-testid="resume-btn"
              type="button"
              className={styles.primary}
              onClick={() => p.onResume(view.resumable!.sessionId)}
            >
              Resume
            </button>
            <button
              data-testid="discard-btn"
              type="button"
              onClick={() => p.onDiscard(view.resumable!.sessionId)}
            >
              Discard
            </button>
          </span>
        </div>
      )}
      {view.quarantined > 0 && (
        <div data-testid="quarantine-notice" role="status" className={styles.strip}>
          {view.quarantined} corrupt session file(s) were set aside.
        </div>
      )}
      {view.error !== null && (
        <div data-testid="library-error" role="alert" className={`${styles.strip} ${styles.error}`}>
          {view.error}
        </div>
      )}

      <header className={styles.header}>
        <h1>Case library</h1>
        <button
          data-testid="open-settings"
          type="button"
          aria-label="Settings"
          className={styles.gear}
          onClick={p.onOpenSettings}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
            <path
              fill="currentColor"
              d="M19.4 13a7.6 7.6 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.4 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.6 7.6 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.4-2.9a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z"
              transform="translate(-1 0)"
            />
          </svg>
        </button>
      </header>

      <section className={styles.grid} aria-label="Cases">
        {view.cases.map(({ card, completed }) => (
          <article
            key={card.id}
            data-testid={`case-card-${card.id}`}
            data-completed={completed ? 'true' : 'false'}
            className={completed ? `${styles.card} ${styles.completed}` : styles.card}
          >
            <div className={styles.meta}>
              <span data-testid="case-number" className={`${styles.muted} tabular`}>
                Case {String(card.number).padStart(2, '0')}
              </span>
              <span data-testid="case-level" className={styles.level}>
                Level {card.level}
              </span>
            </div>
            <h2 data-testid="case-company" className={styles.company}>
              {card.company}
            </h2>
            <p data-testid="case-vertical" className={styles.muted}>
              {card.vertical}
            </p>
            {completed && (
              <p data-testid={`completed-${card.id}`} className={`${styles.muted} tabular`}>
                Completed {fmtDate(completed.at)} · {completed.score}/30
              </p>
            )}
            {completed ? (
              <button
                data-testid={`retake-${card.id}`}
                type="button"
                className={styles.cta}
                onClick={() => open(card.id, card.company)}
              >
                Retake
              </button>
            ) : (
              <button
                data-testid={`start-${card.id}`}
                type="button"
                className={`${styles.cta} ${styles.primary}`}
                onClick={() => open(card.id, card.company)}
              >
                Start
              </button>
            )}
          </article>
        ))}
      </section>

      {sheet && (
        <div className={styles.overlay}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Start ${sheet.company}`}
            data-testid="start-sheet"
            className={styles.sheet}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation()
                close()
              }
            }}
          >
            <h2 className={styles.company}>Start {sheet.company}</h2>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                data-testid="warmup-toggle"
                checked={warmup}
                onChange={(e) => setWarmup(e.target.checked)}
              />
              Include 5–10 min warm-up chat
            </label>
            <div className={styles.actions}>
              <button data-testid="sheet-cancel" type="button" onClick={close}>
                Cancel
              </button>
              <button
                ref={startRef}
                data-testid="sheet-start"
                type="button"
                className={styles.primary}
                onClick={start}
              >
                Start
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
