const PIXELS: ReadonlyArray<readonly [number, number]> = [
  [7,1],[7,3],[7,5],
  [7,9],[7,11],[7,13],
  [9,7],[11,7],[13,7],
  [1,7],[3,7],[5,7],
  [9,5],[11,3],
  [9,9],[11,11],
  [5,9],[3,11],
  [5,5],[3,3],
  [7,7],
]

interface StarburstProps {
  size?: number
  opacity?: number
  color?: string
}

export function Starburst({ size = 22, opacity = 1, color = '#CC9B7A' }: StarburstProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      style={{ imageRendering: 'pixelated', opacity }}
    >
      {PIXELS.map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="2" height="2" fill={color} />
      ))}
    </svg>
  )
}
