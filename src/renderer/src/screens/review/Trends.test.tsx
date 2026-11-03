import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { DIMENSION_IDS, type SessionSummary, type TrendsView } from '../../../../shared/ipc'
import Sparkline from './Sparkline'
import Trends from './Trends'

const svg = (): SVGElement => screen.getByTestId('sparkline') as unknown as SVGElement

describe('Sparkline', () => {
  it('draws non-null points, skips nulls, labels values and marks the ref line', () => {
    render(<Sparkline values={[18, 22, null, 27]} min={0} max={30} label="Total" refValue={26} />)
    const el = svg()
    expect(el.getAttribute('role')).toBe('img')
    expect(el.getAttribute('aria-label')).toBe('Total: 18, 22, –, 27')
    expect(el.getAttribute('data-points')).toBe('3')
    const pts = el.querySelector('polyline')!.getAttribute('points')!.trim().split(/\s+/)
    expect(pts).toHaveLength(3)
    // y inverted: 27 sits higher (smaller y) than 18
    const y = (p: string): number => Number(p.split(',')[1])
    expect(y(pts[2])).toBeLessThan(y(pts[0]))
    expect(el.querySelectorAll('circle')).toHaveLength(1)
    const ref = el.querySelector('line')!
    expect(ref.getAttribute('stroke-dasharray')).toBeTruthy()
    expect(Number(ref.getAttribute('y1'))).toBeCloseTo(32 - (26 / 30) * 32, 1)
  })

  it('one value draws a single dot and no polyline', () => {
    render(<Sparkline values={[3]} min={0} max={5} label="X" />)
    expect(svg().querySelector('polyline')).toBeNull()
    expect(svg().querySelectorAll('circle')).toHaveLength(1)
    expect(svg().getAttribute('data-points')).toBe('1')
    expect(svg().querySelector('line')).toBeNull()
  })

  it('empty renders an svg with zero points', () => {
    render(<Sparkline values={[]} min={0} max={5} label="X" />)
    expect(svg().getAttribute('data-points')).toBe('0')
    expect(svg().querySelector('circle')).toBeNull()
  })

  it('clamps values to [min, max] inside the 120x32 viewBox', () => {
    render(<Sparkline values={[-10, 999]} min={0} max={5} label="X" />)
    expect(svg().getAttribute('viewBox')).toBe('0 0 120 32')
    const pts = svg().querySelector('polyline')!.getAttribute('points')!.trim().split(/\s+/)
    expect(pts.map((p) => Number(p.split(',')[1]))).toEqual([32, 0])
  })
})

function summary(i: number, over: Partial<SessionSummary> = {}): SessionSummary {
  return {
    sessionId: `s${i}`,
    caseId: '03',
    at: 1_700_000_000_000 + i,
    total: 18 + i * 4,
    band: 'another',
    dims: {
      clear_call: 3,
      lead_edge_8: 3,
      retention: 2 + i,
      valuation: 3,
      back_solve: 2,
      quality_poise: 4
    },
    flagFoundRate: 0.5 + i * 0.25,
    avgAnswerMs: 60000 + i * 10000,
    numberAccuracy: i === 0 ? null : 0.9,
    brevity: { short: 0, brief: 1, ideal: 2, long: 1, flagged: 0 },
    fix: 'Compute GRR first',
    ...over
  }
}
function ready(over: Partial<TrendsView> = {}): TrendsView {
  return {
    status: 'ready',
    summaries: [summary(0), summary(1)],
    insights: {
      recurringWeaknesses: ['Slow to the call', 'Skips GRR'],
      progress: [
        { id: 'retention', direction: 'up', note: 'GRR now first' },
        { id: 'valuation', direction: 'down', note: 'Comps thin' }
      ],
      carriedForwardFix: { fix: 'Compute GRR first', improved: 'yes', note: 'Did it' },
      nextCase: { caseId: '07', why: 'Tests valuation' },
      readiness: 'Two more sessions to ready'
    },
    ...over
  }
}
const id = (t: string): HTMLElement => screen.getByTestId(t)
const q = (t: string): HTMLElement | null => screen.queryByTestId(t)

describe('Trends', () => {
  it('shows loading until the load settles, and loads once', async () => {
    let resolve!: (v: TrendsView) => void
    const load = vi.fn(() => new Promise<TrendsView>((r) => (resolve = r)))
    const { rerender } = render(<Trends load={load} />)
    expect(id('trends-loading')).not.toBeNull()
    rerender(<Trends load={load} />)
    resolve(ready())
    expect(await screen.findByTestId('spark-total')).not.toBeNull()
    expect(q('trends-loading')).toBeNull()
    expect(load).toHaveBeenCalledTimes(1)
    expect(id('trends').getAttribute('data-status')).toBe('ready')
  })

  it('ready: sparklines for total, each dimension, flags, length and numbers', async () => {
    render(<Trends load={() => Promise.resolve(ready())} />)
    const total = await screen.findByTestId('spark-total')
    const tsvg = within(total).getByTestId('sparkline')
    expect(tsvg.getAttribute('aria-label')).toBe('Total: 18, 22')
    expect(tsvg.querySelector('line')).not.toBeNull()
    expect(total.textContent).toContain('22')
    const dims = screen.getAllByTestId('spark-dim')
    expect(dims.map((d) => d.getAttribute('data-dim'))).toEqual([...DIMENSION_IDS])
    expect(dims[2].textContent).toContain('Retention insight')
    expect(within(id('spark-flags')).getByTestId('sparkline').getAttribute('aria-label')).toBe(
      'Flags found %: 50, 75'
    )
    expect(within(id('spark-length')).getByTestId('sparkline').getAttribute('aria-label')).toBe(
      'Avg answer s: 60, 70'
    )
    const num = within(id('spark-numbers')).getByTestId('sparkline')
    expect(num.getAttribute('data-points')).toBe('1')
  })

  it('ready: insights render weaknesses, progress, carried fix, next case and readiness', async () => {
    render(<Trends load={() => Promise.resolve(ready())} />)
    await screen.findByTestId('readiness')
    expect(screen.getAllByTestId('recurring-weakness').map((l) => l.textContent)).toEqual([
      'Slow to the call',
      'Skips GRR'
    ])
    const rows = screen.getAllByTestId('progress-row')
    expect(rows.map((r) => [r.getAttribute('data-dim'), r.getAttribute('data-direction')])).toEqual(
      [
        ['retention', 'up'],
        ['valuation', 'down']
      ]
    )
    expect(within(rows[0]).getByLabelText('up').textContent).toBe('↑')
    expect(within(rows[1]).getByLabelText('down').textContent).toBe('↓')
    expect(id('carried-fix').getAttribute('data-improved')).toBe('yes')
    expect(id('carried-fix').textContent).toContain('Compute GRR first')
    expect(id('next-case').textContent).toContain('Case 07')
    expect(id('next-case').textContent).toContain('Tests valuation')
    expect(id('readiness').textContent).toContain('Two more sessions to ready')
  })

  it('hides next case and carried fix when null', async () => {
    const v = ready()
    v.insights = { ...v.insights!, nextCase: null, carriedForwardFix: null }
    render(<Trends load={() => Promise.resolve(v)} />)
    await screen.findByTestId('readiness')
    expect(q('next-case')).toBeNull()
    expect(q('carried-fix')).toBeNull()
  })

  it('insufficient says more sessions are needed', async () => {
    render(
      <Trends
        load={() =>
          Promise.resolve({ status: 'insufficient', summaries: [summary(0)], insights: null })
        }
      />
    )
    expect((await screen.findByTestId('trends-insufficient')).textContent).toContain(
      'Trends need at least 2 scored sessions'
    )
    expect(q('spark-total')).toBeNull()
  })

  it('failed keeps sparklines when there are 2+ summaries', async () => {
    render(<Trends load={() => Promise.resolve(ready({ status: 'failed', insights: null }))} />)
    expect((await screen.findByTestId('trends-failed')).textContent).toContain('Trends unavailable')
    expect(id('spark-total')).not.toBeNull()
    expect(q('readiness')).toBeNull()
  })

  it('rejected load shows trends unavailable', async () => {
    render(<Trends load={() => Promise.reject(new Error('x'))} />)
    expect(await screen.findByTestId('trends-failed')).not.toBeNull()
    expect(id('trends').getAttribute('data-status')).toBe('failed')
  })

  it('default loader fails when window.api.trends is absent', async () => {
    render(<Trends />)
    expect(await screen.findByTestId('trends-failed')).not.toBeNull()
  })
})
