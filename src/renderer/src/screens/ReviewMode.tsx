import { useRef, useState } from 'react'
import type { ViewState } from '../../../shared/ipc'
import s from './ReviewMode.module.css'
import Debrief from './review/Debrief'
import TranscriptPanel, { type TranscriptFocus } from './review/TranscriptPanel'
import Trends from './review/Trends'

export type ReviewModeProps = { view: ViewState; onBack(): void }

type Tab = 'scorecard' | 'trends'
const TABS: { id: Tab; label: string }[] = [
  { id: 'scorecard', label: 'Scorecard' },
  { id: 'trends', label: 'Trends' }
]
export default function ReviewMode({ view, onBack }: ReviewModeProps): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('scorecard')
  const [focused, setFocused] = useState<TranscriptFocus>(null)
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
        <span className={s.muted}>Review</span>
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
          <>
            <Debrief
              view={view}
              onQuote={(id) => {
                setTab('scorecard')
                setFocused({ id })
              }}
            />
            <TranscriptPanel lines={reveal.transcript} focused={focused} />
          </>
        ) : (
          <Trends />
        )}
      </div>
    </main>
  )
}
