import { useEffect, useState } from 'react'
import type { Intent, ViewPhase, ViewState } from '../../../shared/ipc'
import s from './Session.module.css'

export type SessionProps = { view: ViewState; onIntent(i: Intent): void; now?: () => number }

const LABELS: Record<ViewPhase, string> = {
  warmup: 'Warm-up',
  review: 'Review',
  presentation: 'Presentation',
  extraction: 'Presentation',
  grilling: 'Grilling',
  wrapup: 'Wrap-up',
  scoring: 'Scoring',
  reviewMode: 'Review mode'
}

const pad = (n: number): string => String(n).padStart(2, '0')
const mmss = (ms: number): string => {
  const t = Math.floor(Math.max(0, ms) / 1000)
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`
}
const mss = (ms: number): string => {
  const t = Math.floor(Math.max(0, ms) / 1000)
  return `${Math.floor(t / 60)}:${pad(t % 60)}`
}

export default function Session({
  view,
  onIntent,
  now = Date.now
}: SessionProps): React.JSX.Element {
  // Anchor the app clock to the local clock at the moment this view arrived.
  const [recv, setRecv] = useState(() => ({ view, at: now() }))
  if (recv.view !== view) setRecv({ view, at: now() })
  const [, setTick] = useState(0)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [confirming, setConfirming] = useState(false)
  const recording = startedAt !== null
  const talkDisabled = !view.canTalk && !recording

  useEffect(() => {
    const h = setInterval(() => setTick((n) => n + 1), 250)
    return () => clearInterval(h)
  }, [])

  const toggleTalk = (): void => {
    if (recording) {
      onIntent({ type: 'answer', ms: Math.round(now() - startedAt) })
      setStartedAt(null)
    } else if (view.canTalk) {
      setStartedAt(now())
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.code !== 'Space' && e.key !== ' ') return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return
      if (confirming) return
      e.preventDefault()
      toggleTalk()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const { phase } = view
  const remaining =
    view.reviewDeadline === null
      ? 0
      : view.reviewDeadline - (view.clockNow + (now() - recv.at) * view.timeScale)
  const lastInterviewer = [...view.transcript].reverse().find((l) => l.speaker === 'interviewer')

  return (
    <main data-screen="session" data-phase={phase} className={s.layout}>
      <section className={s.stage} aria-label="Main stage">
        {phase === 'review' ? (
          <div data-testid="deck-placeholder" className={s.placeholder}>
            Deck viewer — Phase 4
          </div>
        ) : phase === 'scoring' ? (
          <div data-testid="scoring" className={s.placeholder} role="status">
            Scoring your session…
          </div>
        ) : (
          <div data-testid="avatar-stage" className={s.placeholder}>
            <div
              data-testid="speaking-ring"
              data-speaking={String(view.speaking)}
              className={s.ring}
              aria-hidden="true"
            />
            <span>Interviewer</span>
          </div>
        )}
      </section>

      <aside className={s.side}>
        <div data-testid="webcam-tile" className={s.webcam}>
          Camera — Phase 4
        </div>
        <header className={s.header}>
          <div>
            <h1 data-testid="phase-label" className={s.phase}>
              {LABELS[phase]}
            </h1>
            <div className={s.muted}>{view.card.company}</div>
          </div>
          {phase === 'review' && (
            <div
              data-testid="countdown"
              className={`${s.countdown} tabular`}
              aria-label="Review time left"
            >
              {mmss(remaining)}
            </div>
          )}
          {phase === 'grilling' && view.section && (
            <div data-testid="section-label" className={s.section}>
              {`${view.section.label} · ${view.section.index + 1}/${view.section.total}`}
            </div>
          )}
        </header>
        <ol data-testid="transcript" className={s.transcript} aria-label="Transcript">
          {view.transcript.map((l) => (
            <li key={l.id} data-speaker={l.speaker} className={s[l.speaker]}>
              <span className={s.who}>{l.speaker === 'interviewer' ? 'Interviewer' : 'You'}</span>
              {l.text}
            </li>
          ))}
        </ol>
        <div data-testid="live-region" aria-live="polite" className={s.srOnly}>
          {lastInterviewer?.text ?? ''}
        </div>
      </aside>

      <footer className={s.bar}>
        <button
          type="button"
          data-testid="talk-btn"
          className={`${s.talk} ${recording ? s.recording : ''}`}
          aria-pressed={recording}
          disabled={talkDisabled}
          onClick={toggleTalk}
        >
          {recording ? 'Done' : 'Talk'}
        </button>
        {recording && (
          <span
            data-testid="answer-timer"
            className={`${s.timer} tabular`}
            aria-label="Answer time"
          >
            {mss(now() - startedAt)}
          </span>
        )}
        <span className={s.hint}>Space to {recording ? 'finish' : 'talk'}</span>
        <div className={s.spacer} />
        {phase === 'review' && (
          <button type="button" data-testid="ready-btn" onClick={() => onIntent({ type: 'ready' })}>
            Ready — start presenting
          </button>
        )}
        {phase === 'warmup' && (
          <button
            type="button"
            data-testid="skip-warmup"
            onClick={() => onIntent({ type: 'skipWarmup' })}
          >
            Skip warm-up
          </button>
        )}
        <button
          type="button"
          data-testid="end-btn"
          className={s.end}
          onClick={() => setConfirming(true)}
        >
          End session
        </button>
      </footer>

      {confirming && (
        <div className={s.backdrop}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="end-confirm-text"
            data-testid="end-confirm-dialog"
            className={s.dialog}
            onKeyDown={(e) => e.key === 'Escape' && setConfirming(false)}
          >
            <p id="end-confirm-text">End the session now? You will still get a scorecard.</p>
            <div className={s.actions}>
              <button
                type="button"
                data-testid="end-cancel"
                autoFocus
                onClick={() => setConfirming(false)}
              >
                Keep going
              </button>
              <button
                type="button"
                data-testid="end-confirm"
                className={s.danger}
                onClick={() => {
                  setConfirming(false)
                  onIntent({ type: 'end' })
                }}
              >
                End session
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
