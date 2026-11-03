import { useEffect, useRef, useState } from 'react'
import type { Intent, ViewPhase, ViewState } from '../../../shared/ipc'
import DeckViewer from '../deck/DeckViewer'
import WebcamTile from '../media/WebcamTile'
import AvatarStage from '../avatar/AvatarStage'
import { awaitingReply, type AvatarBinding } from '../avatar/behaviour'
import type { MicCapture } from '../mic/capture'
import { brevityBand } from '../../../shared/brevity'
import s from './Session.module.css'

export type SessionProps = {
  view: ViewState
  onIntent(i: Intent): void
  now?: () => number
  avatar?: AvatarBinding
  mic?: Pick<MicCapture, 'start' | 'stop' | 'setMuted'> // whisper mode only; absent = T1 fake STT
  stopSpeech?: () => void // synchronous playback stop for barge-in
}

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

const TALK_PHASES: ViewPhase[] = ['warmup', 'presentation', 'grilling']
const DECK_TOGGLE: ViewPhase[] = ['presentation', 'extraction', 'grilling', 'wrapup']
const TOAST_MS = 8000

type Recv = { view: ViewState; at: number }
type Countdown = { deadline: number | null; ms: number }

const rawRemaining = (r: Recv, t: number): number =>
  r.view.reviewDeadline === null
    ? 0
    : r.view.reviewDeadline - (r.view.clockNow + (t - r.at) * r.view.timeScale)

/** Clamp: for the same deadline the countdown only goes down; a new deadline resets it. */
// eslint-disable-next-line react-refresh/only-export-components -- pure helper, exported for tests
export function nextRemaining(
  prev: Countdown | null,
  deadline: number | null,
  raw: number
): Countdown {
  return { deadline, ms: prev && prev.deadline === deadline ? Math.min(prev.ms, raw) : raw }
}

export default function Session({
  view,
  onIntent,
  now = Date.now,
  avatar,
  mic,
  stopSpeech
}: SessionProps): React.JSX.Element {
  // Anchor the app clock to the local clock at the moment this view arrived.
  const [recv, setRecv] = useState<Recv>(() => ({ view, at: now() }))
  const [countdown, setCountdown] = useState<Countdown>(() =>
    nextRemaining(null, view.reviewDeadline, rawRemaining({ view, at: now() }, now()))
  )
  if (recv.view !== view) {
    const r = { view, at: now() }
    setRecv(r)
    setCountdown(nextRemaining(countdown, view.reviewDeadline, rawRemaining(r, r.at)))
  }
  const recvRef = useRef(recv)
  useEffect(() => {
    recvRef.current = recv
  }, [recv])
  const [, setTick] = useState(0)
  const [deckOpen, setDeckOpen] = useState(false)
  const [camOn, setCamOn] = useState(true)
  const [muted, setMuted] = useState(false)
  useEffect(() => mic?.setMuted(muted), [mic, muted])
  const [warning, setWarning] = useState(false)
  const warnedRef = useRef(view.reviewWarned)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [confirming, setConfirming] = useState(false)
  const recording = startedAt !== null
  const canBargeIn = !!mic && view.speaking && TALK_PHASES.includes(view.phase)
  const talkDisabled = !view.canTalk && !recording && !canBargeIn

  useEffect(() => {
    // The raw value always comes from the deadline; ticks never accumulate.
    const update = (): void =>
      setCountdown((prev) =>
        nextRemaining(
          prev,
          recvRef.current.view.reviewDeadline,
          rawRemaining(recvRef.current, now())
        )
      )
    const h = setInterval(() => {
      update()
      setTick((n) => n + 1)
    }, 250)
    document.addEventListener('visibilitychange', update)
    return () => {
      clearInterval(h)
      document.removeEventListener('visibilitychange', update)
    }
  }, [now])

  useEffect(() => {
    const was = warnedRef.current
    warnedRef.current = view.reviewWarned
    if (was || !view.reviewWarned || view.phase !== 'review') return
    setWarning(true)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setWarning(false), TOAST_MS)
  }, [view.reviewWarned, view.phase])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  const toggleTalk = (): void => {
    if (recording) {
      const ms = Math.round(now() - startedAt)
      setStartedAt(null)
      if (mic)
        void mic
          .stop()
          .then((r) => onIntent({ type: 'answer', ms, answerId: r.answerId, chunks: r.chunks }))
      else onIntent({ type: 'answer', ms })
    } else if (view.canTalk || canBargeIn) {
      if (canBargeIn && !view.canTalk) {
        stopSpeech?.() // synchronous: the avatar goes quiet before main hears the barge-in
        onIntent({ type: 'bargeIn' })
      }
      setStartedAt(now())
      void mic?.start(() => stopRef.current()).catch(() => undefined) // denied mic: stop() still answers
    }
  }
  // onCap (60 s cap) fires from capture; it must hit the latest stop path, not a stale closure.
  const stopRef = useRef<() => void>(() => undefined)
  useEffect(() => {
    stopRef.current = () => recording && toggleTalk()
  })

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
  const deckFile = `app://bundle/cases/${view.card.id}/interviewee.pdf`
  const canToggleDeck = DECK_TOGGLE.includes(phase)
  const showDeck = phase === 'review' || (deckOpen && canToggleDeck)
  const lastInterviewer = [...view.transcript].reverse().find((l) => l.speaker === 'interviewer')

  return (
    <main data-screen="session" data-phase={phase} className={s.layout}>
      <section className={s.stage} aria-label="Main stage">
        {warning && (
          <div data-testid="review-warning" role="status" className={s.toast}>
            10 minutes left
          </div>
        )}
        {phase === 'scoring' ? (
          <div data-testid="scoring" className={s.placeholder} role="status">
            Scoring your session…
          </div>
        ) : showDeck ? (
          <DeckViewer
            file={deckFile}
            initialPage={view.deckPage}
            onPageChange={(page) => onIntent({ type: 'deckPage', page })}
          />
        ) : (
          <AvatarStage
            speaking={view.speaking}
            listening={recording}
            waiting={awaitingReply(view)}
            avatar={avatar}
          />
        )}
      </section>

      <aside className={s.side}>
        <WebcamTile on={camOn && phase !== 'scoring'} />
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
              {mmss(countdown.ms)}
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
            data-band={brevityBand(now() - startedAt)}
            className={`${s.timer} ${s[brevityBand(now() - startedAt)] ?? ''} tabular`}
            aria-label="Answer time"
          >
            {mss(now() - startedAt)}
          </span>
        )}
        {view.transcribing && (
          <span data-testid="transcribing" role="status" className={s.hint}>
            Transcribing…
          </span>
        )}
        <span className={s.hint}>Space to {recording ? 'finish' : 'talk'}</span>
        <button
          type="button"
          data-testid="cam-toggle"
          aria-pressed={camOn}
          onClick={() => setCamOn((v) => !v)}
        >
          {camOn ? 'Camera on' : 'Camera off'}
        </button>
        <button
          type="button"
          data-testid="mic-toggle"
          aria-pressed={muted}
          onClick={() => setMuted((v) => !v)}
        >
          {muted ? 'Unmute' : 'Mute'}
        </button>
        {canToggleDeck && (
          <button
            type="button"
            data-testid="deck-toggle"
            aria-pressed={deckOpen}
            onClick={() => setDeckOpen((v) => !v)}
          >
            {deckOpen ? 'Interviewer' : 'Deck'}
          </button>
        )}
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
