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
  pct: number
  size?: number
  stroke?: number
  label?: string
}

export function Ring({ pct, size = 22, stroke = 2.5, label }: RingProps) {
  const r      = RingCalculator.getRadius(size, stroke)
  const circ   = RingCalculator.getCircumference(size, stroke)
  const offset = RingCalculator.getDashOffset(pct, size, stroke)
  const color  = RingCalculator.getColor(pct)

  return (
    <div className="ring-wrap" title={label}>
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
      <div className="ring-label">{Math.round(pct * 100)}</div>
    </div>
  )
}
