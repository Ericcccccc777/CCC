import { describe, it, expect } from 'vitest'
import { BalanceDeltaTracker } from '../src/main/api/BalanceDeltaTracker'
import { SEVEN_DAYS_MS } from '../src/shared/api-usage'

class BalanceDeltaTrackerTests {
  static makeTracker(now: () => number = () => 1_000_000_000_000): BalanceDeltaTracker {
    return new BalanceDeltaTracker('deepseek', 'CNY', { lastBalance: null, history: [] }, now)
  }

  static run(): void {
    describe('BalanceDeltaTracker', () => {
      it('first record() seeds lastBalance and reports 0 weekly spending', () => {
        const t = BalanceDeltaTrackerTests.makeTracker()
        const r = t.record(10)
        expect(r.weeklySpending).toBe(0)
        expect(t.snapshot().lastBalance).toBe(10)
        expect(t.snapshot().history).toHaveLength(0)
      })

      it('consumption delta (balance drop) is accumulated', () => {
        const t = BalanceDeltaTrackerTests.makeTracker()
        t.record(10)
        const r = t.record(8)
        expect(r.weeklySpending).toBeCloseTo(2, 6)
        expect(t.snapshot().history).toHaveLength(1)
        expect(t.snapshot().history[0]?.amount).toBeCloseTo(2, 6)
      })

      it('top-up (balance rise) is ignored, but lastBalance updates', () => {
        const t = BalanceDeltaTrackerTests.makeTracker()
        t.record(10)
        const r = t.record(50)
        expect(r.weeklySpending).toBe(0)
        expect(t.snapshot().lastBalance).toBe(50)
        expect(t.snapshot().history).toHaveLength(0)
      })

      it('zero delta records nothing', () => {
        const t = BalanceDeltaTrackerTests.makeTracker()
        t.record(10)
        const r = t.record(10)
        expect(r.weeklySpending).toBe(0)
        expect(t.snapshot().history).toHaveLength(0)
      })

      it('mixed sequence: consume, top-up, consume', () => {
        const t = BalanceDeltaTrackerTests.makeTracker()
        t.record(10)             // seed
        t.record(8)              // -2 → spend
        t.record(20)             // +12 → ignore (top-up)
        const r = t.record(15)   // -5 → spend
        expect(r.weeklySpending).toBeCloseTo(7, 6)
      })

      it('prunes history entries older than 7 days', () => {
        let now = 1_000_000_000_000
        const t = new BalanceDeltaTracker('deepseek', 'CNY', { lastBalance: null, history: [] }, () => now)
        t.record(100)
        t.record(95)              // -5 entry
        // Advance time past 7d window
        now += SEVEN_DAYS_MS + 1000
        const r = t.record(94)    // -1 → fresh entry; 5-entry should be pruned
        expect(r.weeklySpending).toBeCloseTo(1, 6)
        expect(t.snapshot().history).toHaveLength(1)
      })

      it('cold-start from persisted state', () => {
        const t = new BalanceDeltaTracker(
          'deepseek',
          'CNY',
          { lastBalance: 50, history: [{ providerId: 'deepseek', currency: 'CNY', amount: 3, ts: Date.now() }] },
          Date.now,
        )
        const r = t.record(48)
        expect(r.weeklySpending).toBeCloseTo(5, 6) // 3 prior + 2 new
      })

      it('snapshot returns a deep copy of history (caller mutation does not leak)', () => {
        const t = BalanceDeltaTrackerTests.makeTracker()
        t.record(10)
        t.record(9)
        const s = t.snapshot()
        s.history.push({ providerId: 'deepseek', currency: 'CNY', amount: 999, ts: 0 })
        expect(t.snapshot().history).toHaveLength(1)
      })
    })
  }
}

BalanceDeltaTrackerTests.run()
