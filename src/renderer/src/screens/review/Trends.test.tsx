import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Sparkline from './Sparkline'

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
