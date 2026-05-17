import { describe, it, expect } from 'vitest'
import { RingCalculator } from '@renderer/components/Ring'

class RingCalculatorTests {
  static run(): void {
    describe('RingCalculator', () => {
      describe('getColor', () => {
        it('returns green for pct < 0.5', () => {
          expect(RingCalculator.getColor(0)).toBe('oklch(0.72 0.18 145)')
          expect(RingCalculator.getColor(0.3)).toBe('oklch(0.72 0.18 145)')
          expect(RingCalculator.getColor(0.499)).toBe('oklch(0.72 0.18 145)')
        })

        it('returns yellow for 0.5 <= pct < 0.75', () => {
          expect(RingCalculator.getColor(0.5)).toBe('oklch(0.78 0.18 75)')
          expect(RingCalculator.getColor(0.6)).toBe('oklch(0.78 0.18 75)')
          expect(RingCalculator.getColor(0.749)).toBe('oklch(0.78 0.18 75)')
        })

        it('returns red for pct >= 0.75', () => {
          expect(RingCalculator.getColor(0.75)).toBe('oklch(0.65 0.22 25)')
          expect(RingCalculator.getColor(0.9)).toBe('oklch(0.65 0.22 25)')
          expect(RingCalculator.getColor(1)).toBe('oklch(0.65 0.22 25)')
        })
      })

      describe('getRadius', () => {
        it('returns (size - stroke) / 2', () => {
          expect(RingCalculator.getRadius(22, 2.5)).toBeCloseTo(9.75)
          expect(RingCalculator.getRadius(44, 4)).toBe(20)
        })
      })

      describe('getCircumference', () => {
        it('equals 2π × radius', () => {
          const r    = RingCalculator.getRadius(22, 2.5)
          const circ = RingCalculator.getCircumference(22, 2.5)
          expect(circ).toBeCloseTo(2 * Math.PI * r)
        })
      })

      describe('getDashOffset', () => {
        it('returns full circumference for pct = 0 (empty ring)', () => {
          const circ   = RingCalculator.getCircumference(22, 2.5)
          const offset = RingCalculator.getDashOffset(0, 22, 2.5)
          expect(offset).toBeCloseTo(circ)
        })

        it('returns 0 for pct = 1 (full ring)', () => {
          expect(RingCalculator.getDashOffset(1, 22, 2.5)).toBeCloseTo(0)
        })

        it('caps at full circumference for pct > 1', () => {
          const circ = RingCalculator.getCircumference(22, 2.5)
          expect(RingCalculator.getDashOffset(1.5, 22, 2.5)).toBeCloseTo(circ * (1 - 1))
        })

        it('returns half circumference for pct = 0.5', () => {
          const circ   = RingCalculator.getCircumference(22, 2.5)
          const offset = RingCalculator.getDashOffset(0.5, 22, 2.5)
          expect(offset).toBeCloseTo(circ * 0.5)
        })
      })
    })
  }
}

RingCalculatorTests.run()
