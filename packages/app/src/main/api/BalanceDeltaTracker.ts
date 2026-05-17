// Balance-delta weekly-spending tracker — see CCC_API_PROVIDER_SPEC.md
// §5.3. Pure in-memory logic; persistence is the caller's job. Owns
// one (providerId, currency) tuple per instance — multiple currencies
// require multiple instances (see ApiUsageManager).

import { SEVEN_DAYS_MS, type DeltaHistoryEntry } from '../../shared/api-usage'
import type { ApiProviderId } from '../../shared/api-provider'

export interface BalanceDeltaState {
  lastBalance: number | null
  history:     DeltaHistoryEntry[]
}

export class BalanceDeltaTracker {
  private readonly providerId: ApiProviderId
  private readonly currency:   string
  private lastBalance:         number | null
  private history:             DeltaHistoryEntry[]
  private readonly clock:      () => number

  constructor(
    providerId: ApiProviderId,
    currency:   string,
    initial:    BalanceDeltaState = { lastBalance: null, history: [] },
    clock:      () => number = Date.now,
  ) {
    this.providerId  = providerId
    this.currency    = currency
    this.lastBalance = initial.lastBalance
    this.history     = [...initial.history]
    this.clock       = clock
  }

  // Feed a freshly-observed balance. Returns the resulting weekly spending
  // total (sum of consumption deltas in the trailing 7-day window).
  //   - First call: no prior balance → seed lastBalance, no entry recorded.
  //   - Subsequent calls with delta < 0 (top-up): ignored, lastBalance updated.
  //   - Subsequent calls with delta > 0 (consumption): pushed to history.
  //   - delta === 0: lastBalance refreshed only.
  // History entries older than 7 days are pruned on every call.
  record(currentBalance: number): { weeklySpending: number } {
    const now = this.clock()
    if (this.lastBalance !== null) {
      const delta = this.lastBalance - currentBalance
      if (delta > 0) {
        this.history.push({
          providerId: this.providerId,
          currency:   this.currency,
          amount:     delta,
          ts:         now,
        })
      }
      // delta <= 0 → no entry (top-up or no change)
    }
    this.lastBalance = currentBalance
    this.prune(now)
    return { weeklySpending: this.weeklySpending() }
  }

  weeklySpending(): number {
    return this.history.reduce((sum, e) => sum + e.amount, 0)
  }

  snapshot(): BalanceDeltaState {
    return { lastBalance: this.lastBalance, history: [...this.history] }
  }

  private prune(now: number): void {
    const cutoff = now - SEVEN_DAYS_MS
    this.history = this.history.filter(e => e.ts >= cutoff)
  }
}
