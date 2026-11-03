import { useRef, useState } from 'react'
import type { Band, FlagStatus, Reveal, ViewState } from '../../../shared/ipc'
import s from './ReviewMode.module.css'

export type ReviewModeProps = { view: ViewState; onBack(): void }

type Tab = 'scorecard' | 'trends'
const TABS: { id: Tab; label: string }[] = [
  { id: 'scorecard', label: 'Scorecard' },
  { id: 'trends', label: 'Trends' }
]
const BAND_TEXT: Record<Band, string> = {
  ready: 'Ready',
  close: 'Close, one fix',
  another: 'Run another'
}
const STATUS: Record<FlagStatus, string> = { found: 'Found', hinted: 'Hinted', missed: 'Missed' }

const mss = (ms: number): string => {
  const t = Math.floor(Math.max(0, ms) / 1000)
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

function Scorecard({ reveal, view }: { reveal: Reveal; view: ViewState }): React.JSX.Element {
  const { scorecard, checks } = reveal
  return (
    <>
      <section className={s.card} aria-labelledby="rubric-h">
        <div className={s.totalRow}>
          <h2 id="rubric-h">Rubric</h2>
          <div>
            <span data-testid="score-total" className={`${s.total} tabular`}>
              {`${scorecard.total}/30`}
            </span>{' '}
            <span data-testid="score-band" className={`${s.chip} ${s[scorecard.band]}`}>
              {BAND_TEXT[scorecard.band]}
            </span>
          </div>
        </div>
        <table className={s.table}>
          <thead>
            <tr>
              <th scope="col">Dimension</th>
              <th scope="col">Score</th>
              <th scope="col">Evidence</th>
              <th scope="col">Answer key</th>
            </tr>
          </thead>
          <tbody>
            {scorecard.rubric.map((r) => (
              <tr key={r.dimension} data-testid="rubric-row">
                <th scope="row">{r.dimension}</th>
                <td data-testid="score" className="tabular">{`${r.score}/5`}</td>
                <td>
                  <blockquote className={s.quote}>
                    {r.evidence.map((e) => e.quote).join(' … ')}
                  </blockquote>
                </td>
                <td className={s.muted}>{r.answerKey}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className={s.twoCol}>
        <section className={s.card} aria-labelledby="flags-h">
          <h2 id="flags-h">Flag map</h2>
          <ul className={s.list}>
            {scorecard.flags.map((f) => (
              <li key={f.id} data-testid="flag-row" data-status={f.status} className={s.flag}>
                <span>{f.flag}</span>
                <span className={`${s.chip} ${s[f.status]}`}>{STATUS[f.status]}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className={s.card} data-testid="checks" aria-labelledby="checks-h">
          <h2 id="checks-h">Checks</h2>
          <p>{`Led with a call: ${checks.ledWithCall ? 'Yes' : 'No'}`}</p>
          <h3>Answer lengths</h3>
          <ul className={s.list}>
            {checks.brevity.map((b) => (
              <li key={b.turnId} data-testid="brevity-row" className="tabular">
                {`${mss(b.ms)} · ${b.band}`}
              </li>
            ))}
          </ul>
          <h3>Omitted sections</h3>
          {checks.omitted.length ? (
            <ul className={s.list}>
              {checks.omitted.map((o) => (
                <li key={o}>{o}</li>
              ))}
            </ul>
          ) : (
            <p className={s.muted}>None</p>
          )}
        </section>
      </div>

      <section className={s.card} data-testid="reveal" aria-labelledby="reveal-h">
        <h2 id="reveal-h">The reveal</h2>
        <div className={s.twoCol}>
          <div data-testid="ideal-answer">
            <h3>Ideal answer</h3>
            <p>{reveal.idealAnswer}</p>
          </div>
          <div data-testid="your-opening">
            <h3>Your opening</h3>
            <p>{reveal.opening}</p>
          </div>
        </div>
        <h3>Key numbers</h3>
        <dl data-testid="key-numbers" className={s.numbers}>
          {reveal.keyNumbers.map((k) => (
            <div key={k.label}>
              <dt>{k.label}</dt>
              <dd>{k.text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={s.card} aria-labelledby="transcript-h">
        <h2 id="transcript-h">Transcript</h2>
        <ol data-testid="full-transcript" className={s.transcript}>
          {view.transcript.map((l) => (
            <li key={l.id} data-speaker={l.speaker}>
              <span className={s.who}>{l.speaker === 'interviewer' ? 'Interviewer' : 'You'}</span>{' '}
              {l.text}
            </li>
          ))}
        </ol>
      </section>
    </>
  )
}

export default function ReviewMode({ view, onBack }: ReviewModeProps): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('scorecard')
  const refs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({})
  const { reveal } = view

  const onKey = (e: React.KeyboardEvent): void => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const i = TABS.findIndex((t) => t.id === tab)
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length].id
    setTab(next)
    refs.current[next]?.focus()
  }

  const back = (
    <button type="button" data-testid="back-to-library" onClick={onBack}>
      Back to library
    </button>
  )
  if (!reveal) {
    return (
      <main data-screen="reviewMode" className={s.page}>
        {back}
      </main>
    )
  }

  return (
    <main data-screen="reviewMode" className={s.page}>
      <header className={s.header}>
        <div>
          <h1>{view.card.company}</h1>
          <div className={s.muted}>{`Case ${view.card.number} · ${view.card.vertical}`}</div>
        </div>
        {back}
      </header>
      {view.endedEarly && (
        <p data-testid="ended-early" className={s.notice} role="note">
          Session ended early, partial scorecard.
        </p>
      )}
      <div role="tablist" aria-label="Review sections" className={s.tabs}>
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[t.id] = el
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            data-testid={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            className={s.tab}
            onClick={() => setTab(t.id)}
            onKeyDown={onKey}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className={s.panel}>
        {tab === 'scorecard' ? (
          <Scorecard reveal={reveal} view={view} />
        ) : (
          <p className={`${s.card} ${s.muted}`}>Trends arrive in Phase 8</p>
        )}
      </div>
    </main>
  )
}
