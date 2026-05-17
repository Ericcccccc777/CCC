// Wires DeepSeekClient + BalanceDeltaTracker + ApiUsageStore +
// TokenUsageAccumulator into a single object owned by IpcHandlers.
//
// Responsibilities:
//   - Per-session token+cost accumulation, fed by HookServer transcript lines.
//   - Per-provider balance polling (30s interval, ref-counted to active sessions).
//   - Persistence to api-usage.json across restarts.
//   - Broadcast to renderer via IPC channels API_USAGE_UPDATE / API_BALANCE_UPDATE.
//
// External effects (HTTP / fs / setInterval / IPC) all flow through injected
// dependencies so the unit tests don't spin up real timers or sockets.

import type { ApiProviderId } from '../../shared/api-provider'
import type { ApiBalanceSnapshot, ApiUsageSnapshot } from '../../shared/api-usage'
import { ApiUsageStore } from './ApiUsageStore'
import { BalanceDeltaTracker } from './BalanceDeltaTracker'
import { DeepSeekClient, type BalanceFetchOutcome } from './DeepSeekClient'
import { TokenUsageAccumulator, extractUsageDelta } from './TokenUsageAccumulator'

export interface ApiKeyResolver {
  readKey(providerId: ApiProviderId): string | null
}

export interface UsageBroadcaster {
  sendUsage(snapshot: ApiUsageSnapshot): void
  sendBalance(snapshot: ApiBalanceSnapshot): void
}

export interface IntervalScheduler {
  setInterval(handler: () => void, ms: number): { cancel: () => void }
}

export const DEFAULT_BALANCE_POLL_MS = 30_000

interface ProviderState {
  refCount:     number
  cancel:       (() => void) | null
  tracker:      BalanceDeltaTracker | null  // null until first balance fetch reveals the currency
  currency:     string | null
  lastSnapshot: ApiBalanceSnapshot | null
}

export class ApiUsageManager {
  private readonly store:    ApiUsageStore
  private readonly keys:     ApiKeyResolver
  private readonly client:   DeepSeekClient
  private readonly out:      UsageBroadcaster
  private readonly sched:    IntervalScheduler
  private readonly pollMs:   number
  private readonly clock:    () => number
  private accumulators       = new Map<number, TokenUsageAccumulator>()
  private sessionProviders   = new Map<number, ApiProviderId>()
  private providers          = new Map<ApiProviderId, ProviderState>()

  constructor(deps: {
    store:        ApiUsageStore
    keys:         ApiKeyResolver
    client:       DeepSeekClient
    broadcaster:  UsageBroadcaster
    scheduler?:   IntervalScheduler
    pollMs?:      number
    clock?:       () => number
  }) {
    this.store  = deps.store
    this.keys   = deps.keys
    this.client = deps.client
    this.out    = deps.broadcaster
    this.sched  = deps.scheduler ?? defaultScheduler
    this.pollMs = deps.pollMs    ?? DEFAULT_BALANCE_POLL_MS
    this.clock  = deps.clock     ?? Date.now
  }

  // Called when an API-mode session is launched or its mode flips on
  // restartAsApi. Idempotent — re-registering the same sessionId is a no-op
  // for the accumulator (so a model switch in the same provider doesn't
  // wipe accumulated tokens).
  registerSession(sessionId: number, providerId: ApiProviderId, modelId: string): void {
    if (!this.accumulators.has(sessionId)) {
      const seed = this.store.getSessionUsage(sessionId)
      this.accumulators.set(sessionId, new TokenUsageAccumulator(
        { sessionId, providerId, modelId },
        seed ?? undefined,
        this.clock,
      ))
    }
    this.sessionProviders.set(sessionId, providerId)

    const existing = this.providers.get(providerId)
    if (existing) {
      existing.refCount += 1
      // Trigger an immediate refresh so the new session sees a fresh balance.
      void this.refreshBalance(providerId)
      return
    }
    const state: ProviderState = {
      refCount:     1,
      cancel:       null,
      tracker:      null,
      currency:     null,
      lastSnapshot: null,
    }
    this.providers.set(providerId, state)
    state.cancel = this.sched.setInterval(() => void this.refreshBalance(providerId), this.pollMs).cancel
    void this.refreshBalance(providerId)
  }

  unregisterSession(sessionId: number): void {
    const providerId = this.sessionProviders.get(sessionId)
    this.sessionProviders.delete(sessionId)
    this.accumulators.delete(sessionId)
    if (!providerId) return

    const state = this.providers.get(providerId)
    if (!state) return
    state.refCount -= 1
    if (state.refCount <= 0) {
      state.cancel?.()
      this.providers.delete(providerId)
    }
  }

  // Forwarded by HookServer for every parsed transcript JSONL line. Skips
  // lines for sessions not registered as API-mode (so the Anthropic-cloud
  // path never accidentally accumulates).
  onTranscriptLine(sessionId: number, parsedLine: Record<string, unknown>): void {
    const acc = this.accumulators.get(sessionId)
    if (!acc) return
    const delta = extractUsageDelta(parsedLine)
    if (!delta) return
    const snapshot = acc.apply(delta)
    this.store.setSessionUsage(snapshot)
    this.out.sendUsage(snapshot)
  }

  async refreshBalance(providerId: ApiProviderId): Promise<void> {
    const state = this.providers.get(providerId)
    if (!state) return
    const key = this.keys.readKey(providerId)
    if (!key) return

    let outcome: BalanceFetchOutcome
    try {
      outcome = await this.client.fetchBalance(providerId, key)
    } catch (err) {
      outcome = { ok: false, reason: 'network', message: err instanceof Error ? err.message : String(err) }
    }

    if (!outcome.ok) {
      // Re-broadcast the last known snapshot with stale=true so the UI keeps
      // the value but greys it. If we never got a successful first fetch,
      // there's nothing to broadcast.
      if (state.lastSnapshot) {
        const stale = { ...state.lastSnapshot, stale: true }
        state.lastSnapshot = stale
        this.out.sendBalance(stale)
      }
      return
    }

    const fresh    = outcome.snapshot
    const currency = fresh.currency

    // Lazy-init or reset the tracker if the currency changed (rare —
    // happens only if the user's funded currency flips, e.g. CNY runs to
    // 0 and they top up USD instead).
    if (!state.tracker || state.currency !== currency) {
      state.currency = currency
      const seedHistory  = this.store.getHistoryFor(providerId, currency)
      const seedLast     = this.store.getLastBalance(providerId, currency)
      state.tracker      = new BalanceDeltaTracker(
        providerId,
        currency,
        { lastBalance: seedLast, history: seedHistory },
        this.clock,
      )
    }

    const { weeklySpending } = state.tracker.record(fresh.balance)

    this.store.setLastBalance(providerId, currency, fresh.balance)
    this.store.setHistoryFor(providerId, currency, state.tracker.snapshot().history)

    const enriched: ApiBalanceSnapshot = { ...fresh, weeklySpending, stale: false }
    state.lastSnapshot = enriched
    this.out.sendBalance(enriched)
  }

  // Test seam: reads the in-flight provider state so unit tests can assert
  // on lifecycle (refCount, polling cancellation) without touching internals.
  inspectProvider(providerId: ApiProviderId): { refCount: number; pollerActive: boolean } | null {
    const s = this.providers.get(providerId)
    if (!s) return null
    return { refCount: s.refCount, pollerActive: s.cancel !== null }
  }
}

const defaultScheduler: IntervalScheduler = {
  setInterval(handler, ms): { cancel: () => void } {
    const id = setInterval(handler, ms)
    return { cancel: () => clearInterval(id) }
  },
}
