const W = 120
const H = 32

export type SparklineProps = {
  values: (number | null)[]
  min: number
  max: number
  label: string
  refValue?: number
}

export default function Sparkline({
  values,
  min,
  max,
  label,
  refValue
}: SparklineProps): React.JSX.Element {
  const y = (v: number): number => {
    const c = Math.min(max, Math.max(min, v))
    return +(H - ((c - min) / (max - min || 1)) * H).toFixed(2)
  }
  const x = (i: number): number =>
    +(values.length > 1 ? (i / (values.length - 1)) * W : W / 2).toFixed(2)
  const pts = values.flatMap((v, i) => (v === null ? [] : [[x(i), y(v)] as const]))
  const last = pts[pts.length - 1]
  return (
    <svg
      data-testid="sparkline"
      data-points={pts.length}
      role="img"
      aria-label={`${label}: ${values.map((v) => (v === null ? '–' : String(v))).join(', ')}`}
      viewBox={`0 0 ${W} ${H}`}
      width={W}
      height={H}
      overflow="visible"
    >
      {refValue !== undefined && (
        <line
          x1={0}
          x2={W}
          y1={y(refValue)}
          y2={y(refValue)}
          stroke="var(--muted)"
          strokeDasharray="3 3"
          strokeWidth={1}
        />
      )}
      {pts.length > 1 && (
        <polyline
          points={pts.map((p) => p.join(',')).join(' ')}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
      )}
      {last && <circle cx={last[0]} cy={last[1]} r={3} fill="var(--accent)" />}
    </svg>
  )
}
