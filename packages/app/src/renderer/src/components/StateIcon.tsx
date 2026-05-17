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

const CHECK_PIXELS: ReadonlyArray<readonly [number, number]> = [
  [1,9],[3,11],[5,13],
  [7,11],[9,9],[11,7],[13,5],
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
