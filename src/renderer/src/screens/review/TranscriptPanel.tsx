import { useEffect, useRef, useState } from 'react'
import type { RevealLine } from '../../../../shared/ipc'
import s from '../ReviewMode.module.css'
import { mss } from './time'

// A new object per quote click, so clicking the same quote twice scrolls again.
export type TranscriptFocus = { id: string } | null
export type TranscriptPanelProps = { lines: RevealLine[]; focused: TranscriptFocus }

const escape = (q: string): string => q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function Highlight({ text, re }: { text: string; re: RegExp | null }): React.ReactNode {
  if (!re) return text
  // split with one capture group: odd indices are the matches
  return text.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part))
}

export default function TranscriptPanel({
  lines,
  focused
}: TranscriptPanelProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const refs = useRef(new Map<string, HTMLLIElement>())

  useEffect(() => {
    if (focused) refs.current.get(focused.id)?.scrollIntoView({ block: 'center' })
  }, [focused])

  const q = query.trim()
  const re = q ? new RegExp(`(${escape(q)})`, 'gi') : null
  const count = q ? lines.filter((l) => l.text.toLowerCase().includes(q.toLowerCase())).length : 0

  return (
    <section className={s.card} aria-labelledby="transcript-h">
      <div className={s.transcriptHead}>
        <h2 id="transcript-h">Transcript</h2>
        <div className={s.search}>
          <input
            type="search"
            data-testid="transcript-search"
            aria-label="Search transcript"
            placeholder="Search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {q && (
            <span className={`${s.muted} tabular`} aria-live="polite">
              {`${count} ${count === 1 ? 'match' : 'matches'}`}
            </span>
          )}
        </div>
      </div>
      <ol data-testid="full-transcript" className={s.transcript}>
        {lines.map((l) => {
          const on = focused?.id === l.id
          return (
            <li
              key={l.id}
              ref={(el) => {
                if (el) refs.current.set(l.id, el)
                else refs.current.delete(l.id)
              }}
              data-testid="transcript-line"
              data-turn={l.id}
              data-speaker={l.speaker}
              data-highlighted={on}
              className={`${s.line} ${on ? s.lineOn : ''}`}
            >
              <span data-testid="transcript-time" className={`${s.time} tabular`}>
                {mss(l.offsetMs)}
              </span>
              <span>
                <span className={s.who}>{l.speaker === 'interviewer' ? 'Interviewer' : 'You'}</span>
                {l.ms != null && (
                  <span className={`${s.muted} tabular`}>{` (${Math.round(l.ms / 1000)}s)`}</span>
                )}{' '}
                <Highlight text={l.text} re={re} />
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
