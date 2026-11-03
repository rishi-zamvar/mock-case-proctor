import type { Band, FlagStatus, NumberCheck, RubricRow, ViewState } from '../../../../shared/ipc'
import s from '../ReviewMode.module.css'
import { mss } from './time'

export type DebriefProps = { view: ViewState; onQuote(turnId: string): void }

const BAND_TEXT: Record<Band, string> = {
  ready: 'Ready',
  close: 'Close, one fix',
  another: 'Run another Level 1 case'
}
const STATUS: Record<FlagStatus, string> = {
  found: 'Found',
  hinted: 'After hint',
  missed: 'Missed'
}
const BREVITY_CAP_MS = 120000

function List({ items, testid }: { items: string[]; testid?: string }): React.JSX.Element {
  return items.length ? (
    <ul data-testid={testid} className={s.bullets}>
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  ) : (
    <p data-testid={testid} className={s.muted}>
      None
    </p>
  )
}

function Dots({ score }: { score: number }): React.JSX.Element {
  return (
    <span data-testid="score-dots" role="img" aria-label={`${score} of 5`} className={s.dots}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} data-filled={n <= score} className={n <= score ? s.dotOn : s.dot} />
      ))}
    </span>
  )
}

function Row({ r, onQuote }: { r: RubricRow; onQuote(id: string): void }): React.JSX.Element {
  return (
    <li data-testid="rubric-row" className={s.row}>
      <div className={s.rowHead}>
        <h3>{r.dimension}</h3>
        <Dots score={r.score} />
        <span data-testid="score" className={`${s.rowScore} tabular`}>{`${r.score}/5`}</span>
      </div>
      <p data-testid="rationale">{r.rationale}</p>
      {r.unverified ? (
        <span data-testid="unverified-badge" className={`${s.chip} ${s.hinted}`}>
          Unverified evidence
        </span>
      ) : (
        r.evidence.length > 0 && (
          <div className={s.quotes}>
            {r.evidence.map((e, i) => (
              <button
                key={i}
                type="button"
                data-testid="evidence-quote"
                data-turn={e.turnId}
                className={s.quote}
                title="Show in transcript"
                onClick={() => onQuote(e.turnId)}
              >
                {`“${e.quote}”`}
              </button>
            ))}
          </div>
        )
      )}
      <p className={s.muted}>
        <span className={s.label}>Answer key</span> {r.answerKey}
      </p>
    </li>
  )
}

const MARK: Record<string, [string, string]> = {
  true: ['✓', 'Correct'],
  false: ['✗', 'Wrong'],
  unverifiable: ['?', 'Unverifiable']
}

function NumberRow({ n }: { n: NumberCheck }): React.JSX.Element {
  const key = String(n.correct)
  const [mark, label] = MARK[key]
  return (
    <tr data-testid="numbers-row" data-correct={key}>
      <td>{n.claim}</td>
      <td>
        <span role="img" aria-label={label} className={s[`mark_${key}`]}>
          {mark}
        </span>
      </td>
      <td className="tabular">
        {n.correct === false && <span data-testid="number-expected">{n.expected ?? '—'}</span>}
      </td>
    </tr>
  )
}

export default function Debrief({ view, onQuote }: DebriefProps): React.JSX.Element | null {
  const reveal = view.reveal
  if (!reveal) return null
  const { scorecard: sc, checks } = reveal
  const date = sc.scoredAt ? ` · ${new Date(sc.scoredAt).toLocaleDateString()}` : ''

  return (
    <>
      <header data-testid="review-header" className={`${s.card} ${s.hero}`}>
        <div className={s.heroTop}>
          <div>
            <h1>{view.card.company}</h1>
            <div
              className={s.muted}
            >{`Case ${view.card.number} · ${view.card.vertical}${date}`}</div>
          </div>
          <div className={s.heroScore}>
            <span data-testid="score-total" className={`${s.total} tabular`}>
              {`${sc.total}/30`}
            </span>
            <span
              data-testid="score-band"
              data-band={sc.band}
              className={`${s.chip} ${s[sc.band]}`}
            >
              {BAND_TEXT[sc.band]}
            </span>
          </div>
        </div>
        <div className={s.twoCol}>
          <div data-testid="keep" className={`${s.callout} ${s.keep}`}>
            <span className={s.label}>Keep</span>
            <p>{sc.keep}</p>
          </div>
          <div data-testid="fix" className={`${s.callout} ${s.fix}`}>
            <span className={s.label}>Fix</span>
            <p>{sc.fix}</p>
          </div>
        </div>
      </header>

      <section className={s.card} aria-labelledby="insight-h">
        <h2 id="insight-h">What you got right</h2>
        <div className={s.twoCol}>
          <div>
            <h3>Called out beyond the deck</h3>
            <List items={sc.insight.calledOut} testid="insight-called-out" />
          </div>
          <div>
            <h3>Missed</h3>
            <List items={sc.insight.missed} testid="insight-missed" />
          </div>
        </div>
      </section>

      <section className={s.card} aria-labelledby="flags-h">
        <h2 id="flags-h">Flags revealed</h2>
        <ul className={s.list}>
          {sc.flags.map((f) => (
            <li key={f.id} data-testid="flag-row" data-status={f.status} className={s.flag}>
              <span>
                {f.flag}
                {f.where && (
                  <span data-testid="flag-where" className={`${s.muted} ${s.where}`}>
                    {`Deck: ${f.where}`}
                  </span>
                )}
              </span>
              <span className={`${s.chip} ${s[f.status]}`}>{STATUS[f.status]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={s.card} data-testid="reveal" aria-labelledby="reveal-h">
        <h2 id="reveal-h">The intended read</h2>
        <p data-testid="intended-read" className={s.lead}>
          {reveal.intendedRead}
        </p>
        <h3>Back-solve</h3>
        <List items={reveal.backSolve} testid="back-solve" />
        <div className={s.twoCol}>
          <div data-testid="ideal-answer">
            <h3>Ideal 60-second answer</h3>
            <p>{reveal.idealAnswer}</p>
          </div>
          <div data-testid="your-opening">
            <h3>Your opening</h3>
            <p>{reveal.opening}</p>
          </div>
        </div>
        <h3>Numbers to memorize</h3>
        <dl data-testid="key-numbers" className={s.numbers}>
          {reveal.keyNumbers.map((k) => (
            <div key={k.label}>
              <dt>{k.label}</dt>
              <dd>{k.text}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={s.card} aria-labelledby="rubric-h">
        <h2 id="rubric-h">Scores</h2>
        <ol className={s.rubric}>
          {sc.rubric.map((r) => (
            <Row key={r.id} r={r} onQuote={onQuote} />
          ))}
        </ol>
        <p data-testid="summary" className={s.summary}>
          {sc.summary}
        </p>
      </section>

      <section className={s.card} data-testid="checks" aria-labelledby="checks-h">
        <h2 id="checks-h">Checks</h2>
        <p data-testid="led-with-call" data-ok={checks.ledWithCall}>
          <span className={checks.ledWithCall ? s.mark_true : s.mark_false} aria-hidden="true">
            {checks.ledWithCall ? '✓' : '✗'}
          </span>{' '}
          {checks.ledWithCall ? 'Led with a call' : 'Did not lead with a call'}
        </p>
        <h3>Numbers</h3>
        {checks.numbers.length ? (
          <table className={s.table}>
            <thead>
              <tr>
                <th scope="col">You said</th>
                <th scope="col">Check</th>
                <th scope="col">Correct value</th>
              </tr>
            </thead>
            <tbody>
              {checks.numbers.map((n, i) => (
                <NumberRow key={i} n={n} />
              ))}
            </tbody>
          </table>
        ) : (
          <p className={s.muted}>No case numbers stated</p>
        )}
        <h3>Answer lengths</h3>
        <div className={s.strip} aria-hidden="true">
          {checks.brevity.map((b) => (
            <span
              key={b.turnId}
              data-testid="brevity-bar"
              data-band={b.band}
              title={`${mss(b.ms)} · ${b.band}`}
              className={`${s.bar} ${s[`b_${b.band}`]}`}
              style={{ height: `${(Math.min(b.ms, BREVITY_CAP_MS) / BREVITY_CAP_MS) * 100}%` }}
            />
          ))}
        </div>
        <ul className={s.brevityList}>
          {checks.brevity.map((b) => (
            <li key={b.turnId} data-testid="brevity-row" className="tabular">
              {`${mss(b.ms)} · ${b.band}`}
            </li>
          ))}
        </ul>
        <h3>Omitted sections</h3>
        <List items={checks.omitted} />
      </section>
    </>
  )
}
