import { useEffect, useState } from 'react'
import {
  DIMENSION_IDS,
  DIMENSION_LABELS,
  type SessionSummary,
  type TrendsView
} from '../../../../shared/ipc'
import Sparkline from './Sparkline'
import s from './Trends.module.css'

export type TrendsProps = { load?: () => Promise<TrendsView> }

const defaultLoad = (): Promise<TrendsView> =>
  window.api?.trends?.get() ?? Promise.reject(new Error('unavailable'))

const ARROW = { up: '↑', flat: '→', down: '↓' } as const
const pct = (v: number | null): number | null => (v === null ? null : Math.round(v * 100))

type Series = {
  testId: string
  dim?: string
  label: string
  max: number
  refValue?: number
  values: (number | null)[]
}

function series(sum: SessionSummary[]): Series[] {
  return [
    {
      testId: 'spark-total',
      label: 'Total',
      max: 30,
      refValue: 26,
      values: sum.map((x) => x.total)
    },
    ...DIMENSION_IDS.map((d) => ({
      testId: 'spark-dim',
      dim: d,
      label: DIMENSION_LABELS[d],
      max: 5,
      values: sum.map((x) => x.dims[d] ?? null)
    })),
    {
      testId: 'spark-flags',
      label: 'Flags found %',
      max: 100,
      values: sum.map((x) => pct(x.flagFoundRate))
    },
    {
      testId: 'spark-length',
      label: 'Avg answer s',
      max: 120,
      values: sum.map((x) => (x.avgAnswerMs === null ? null : Math.round(x.avgAnswerMs / 1000)))
    },
    {
      testId: 'spark-numbers',
      label: 'Number accuracy %',
      max: 100,
      values: sum.map((x) => pct(x.numberAccuracy))
    }
  ]
}

export default function Trends({ load = defaultLoad }: TrendsProps): React.JSX.Element {
  const [view, setView] = useState<TrendsView | null>(null)
  useEffect(() => {
    let live = true
    load().then(
      (v) => live && setView(v),
      () => live && setView({ status: 'failed', summaries: [], insights: null })
    )
    return () => {
      live = false
    }
    // load once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!view) {
    return (
      <section data-testid="trends" data-status="loading" className={s.root}>
        <p data-testid="trends-loading" className={s.muted}>
          Loading trends…
        </p>
      </section>
    )
  }

  const { status, summaries, insights } = view
  const showSparks = status !== 'insufficient' && summaries.length >= 2
  return (
    <section data-testid="trends" data-status={status} className={s.root}>
      {status === 'insufficient' && (
        <p data-testid="trends-insufficient" className={s.notice}>
          Trends need at least 2 scored sessions. Run another case to see progress.
        </p>
      )}
      {status === 'failed' && (
        <p data-testid="trends-failed" className={s.notice} role="note">
          Trends unavailable right now.
        </p>
      )}
      {showSparks && (
        <div className={s.grid}>
          {series(summaries).map((x) => {
            const latest = [...x.values].reverse().find((v) => v !== null)
            return (
              <div
                key={x.dim ?? x.testId}
                data-testid={x.testId}
                data-dim={x.dim}
                className={s.card}
              >
                <div className={s.head}>
                  <span>{x.label}</span>
                  <span className={`tabular ${s.latest}`}>{latest ?? '–'}</span>
                </div>
                <Sparkline
                  values={x.values}
                  min={0}
                  max={x.max}
                  label={x.label}
                  refValue={x.refValue}
                />
              </div>
            )
          })}
        </div>
      )}
      {status === 'ready' && insights && (
        <div className={s.grid}>
          <div className={s.card}>
            <h3>Recurring weaknesses</h3>
            <ul>
              {insights.recurringWeaknesses.map((w) => (
                <li key={w} data-testid="recurring-weakness">
                  {w}
                </li>
              ))}
            </ul>
          </div>
          <div className={s.card}>
            <h3>Progress by dimension</h3>
            <ul className={s.plain}>
              {insights.progress.map((p) => (
                <li
                  key={p.id}
                  data-testid="progress-row"
                  data-dim={p.id}
                  data-direction={p.direction}
                >
                  <span aria-label={p.direction} className={s[p.direction]}>
                    {ARROW[p.direction]}
                  </span>{' '}
                  {DIMENSION_LABELS[p.id]} <span className={s.muted}>{p.note}</span>
                </li>
              ))}
            </ul>
          </div>
          {insights.carriedForwardFix && (
            <div
              data-testid="carried-fix"
              data-improved={insights.carriedForwardFix.improved}
              className={s.card}
            >
              <h3>Last fix</h3>
              <p>{insights.carriedForwardFix.fix}</p>
              <p className={s.muted}>
                <span className={s.chip}>Improved: {insights.carriedForwardFix.improved}</span>{' '}
                {insights.carriedForwardFix.note}
              </p>
            </div>
          )}
          {insights.nextCase && (
            <div data-testid="next-case" className={s.card}>
              <h3>Next case</h3>
              <p>Case {insights.nextCase.caseId}</p>
              <p className={s.muted}>{insights.nextCase.why}</p>
            </div>
          )}
          <div data-testid="readiness" className={s.card}>
            <h3>Readiness</h3>
            <p>{insights.readiness}</p>
          </div>
        </div>
      )}
    </section>
  )
}
