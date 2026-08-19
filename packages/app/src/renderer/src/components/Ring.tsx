export class RingCalculator {
  static getColor(pct: number): string {
    if (pct < 0.5)  return 'oklch(0.72 0.18 145)'
    if (pct < 0.75) return 'oklch(0.78 0.18 75)'
    return 'oklch(0.65 0.22 25)'
  }

  static getRadius(size: number, stroke: number): number {
    return (size - stroke) / 2
  }

  static getCircumference(size: number, stroke: number): number {
    return 2 * Math.PI * this.getRadius(size, stroke)
  }

  static getDashOffset(pct: number, size: number, stroke: number): number {
    return this.getCircumference(size, stroke) * (1 - Math.min(pct, 1))
  }
}

interface RingProps {
  // Undefined = never measured. Renders an empty grey ring labelled "—" so it
  // cannot be mistaken for a real reading of 0%.
  pct?: number
  size?: number
  stroke?: number
  label?: string
  // The feed that fed this number has gone silent. The value is still shown —
  // it was true once — but dimmed, so a dead feed can't pass for a live one.
  stale?: boolean
}

export function Ring({ pct, size = 22, stroke = 2.5, label, stale }: RingProps) {
  const known  = pct !== undefined
  const r      = RingCalculator.getRadius(size, stroke)
  const circ   = RingCalculator.getCircumference(size, stroke)
  const offset = RingCalculator.getDashOffset(pct ?? 0, size, stroke)
  // Muted grey when unmeasured: the arc is empty either way, so the colour
  // is what stops it reading as a green "0% used".
  const color  = known ? RingCalculator.getColor(pct) : 'rgba(255,255,255,0.18)'

  return (
    <div className={`ring-wrap${stale ? ' ring-wrap--stale' : ''}`} title={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="ring-bg" cx={size / 2} cy={size / 2} r={r} />
        <circle
          className="ring-fg"
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeDasharray={circ}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="ring-label">{known ? Math.round(pct * 100) : '—'}</div>
    </div>
  )
}
