// Runtime API-mode usage / balance / weekly-spending types — see
// CCC_API_PROVIDER_SPEC.md §3.1 + §5. The renderer reads these via two
// IPC events: API_BALANCE_UPDATE (per provider) and API_USAGE_UPDATE
// (per session). Persistence is keyed by providerId+currency for balance
// state and by sessionId for per-session usage.

import type { ApiProviderId } from './api-provider'

export interface ApiBalanceSnapshot {
  providerId:  ApiProviderId
  balance:     number
  currency:    string
  fetchedAt:   number
  // Filled by ApiUsageManager when BalanceDeltaTracker has accumulated
  // a non-empty 7-day window. Optional so the very first snapshot can
  // still be broadcast before any delta is known.
  weeklySpending?: number
  // Stale flag: true iff the most recent /user/balance fetch failed
  // (network error, non-2xx, parse error). The UI greys the value out
  // but keeps showing the last known balance — see spec §11.
  stale?: boolean
}

export interface ApiUsageSnapshot {
  sessionId:           number
  providerId:          ApiProviderId
  modelId:             string
  inputTokens:         number
  outputTokens:        number
  cacheReadTokens:     number
  cacheCreationTokens: number
  // USD; computed via DEEPSEEK_PRICING. Renderer converts to display
  // currency separately if needed.
  estimatedCostUsd:    number
  updatedAt:           number
}

// Persisted record of a 7-day rolling-window delta entry. One per
// observed balance drop. Older entries fall out automatically.
export interface DeltaHistoryEntry {
  providerId: ApiProviderId
  currency:   string
  amount:     number
  ts:         number
}

// Persisted shape of `api-usage.json` — see spec §3.2.
export interface PersistedApiUsage {
  // Most-recent observed balance per (providerId, currency) pair, used as
  // the seed for the next BalanceDeltaTracker.record() call across restarts.
  lastBalance: Record<string, { providerId: ApiProviderId; currency: string; balance: number; ts: number }>
  // Flat 7-day rolling history; pruned on save.
  deltaHistory: DeltaHistoryEntry[]
  // Per-session token usage; pruned when the session is dropped (out of scope
  // for V1 — sessions persist for the app lifetime, on restart this resets).
  sessions: Record<number, ApiUsageSnapshot>
}

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

// Stable key for the lastBalance / deltaHistory bucket — keeps multiple
// currencies under the same provider distinguishable without nesting.
export function balanceBucketKey(providerId: ApiProviderId, currency: string): string {
  return `${providerId}::${currency}`
}
