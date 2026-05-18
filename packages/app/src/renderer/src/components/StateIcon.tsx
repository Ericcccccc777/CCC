import { Starburst } from './Starburst'
import type { AppState } from '../types'

const QUESTION_PIXELS: ReadonlyArray<readonly [number, number]> = [
  [5,1],[7,1],[9,1],
  [3,3],[11,3],
  [11,5],
  [9,7],
  [7,9],
  [7,12],[7,13],
]

// Shifted up by 2px (y: 5–13 → 3–11) so the check sits visually centered
// inside the 16×16 viewBox instead of biased low. The corner-shrunk circle
// shares this geometry so the icon lands in the same spot in both forms.
const CHECK_PIXELS: ReadonlyArray<readonly [number, number]> = [
  [1,7],[3,9],[5,11],
  [7,9],[9,7],[11,5],[13,3],
]

interface StateIconProps {
  state: AppState
  size?: number
}

export function StateIcon({ state, size = 22 }: StateIconProps) {
  if (state === 'idle') {
    return (
      <div className="logo-icon">
        <Starburst size={size} opacity={0.28} />
      </div>
    )
  }

  if (state === 'streaming') {
    return (
      <div className="logo-icon logo-breathing">
        <Starburst size={size} />
      </div>
    )
  }

  if (state === 'waiting') {
    return (
      <svg
        className="logo-icon logo-waiting"
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        style={{ imageRendering: 'pixelated' }}
      >
        {QUESTION_PIXELS.map(([x, y], i) => (
          <rect key={i} x={x} y={y} width="2" height="2" fill="#D4A847" />
        ))}
      </svg>
    )
  }

  if (state === 'done') {
    return (
      <svg
        className="logo-icon logo-pop"
        width={size}
        height={size}
        viewBox="0 0 16 16"
        fill="none"
        style={{ imageRendering: 'pixelated' }}
      >
        {CHECK_PIXELS.map(([x, y], i) => (
          <rect key={i} x={x} y={y} width="2" height="2" fill="#5CC878" />
        ))}
      </svg>
    )
  }

  return null
}
