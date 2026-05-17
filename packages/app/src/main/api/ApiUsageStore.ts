// File-backed persistence for API-mode usage state. Stored at
// `app.getPath('userData')/api-usage.json`. Atomic writes (tmp + rename)
// so a crash mid-write doesn't corrupt the rolling balance/delta data.
// Loading a missing or corrupted file is treated as cold-start, never
// throws — see CCC_API_PROVIDER_SPEC.md §3.2.

import { existsSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import {
  SEVEN_DAYS_MS,
  balanceBucketKey,
  type ApiUsageSnapshot,
  type DeltaHistoryEntry,
  type PersistedApiUsage,
} from '../../shared/api-usage'
import type { ApiProviderId } from '../../shared/api-provider'

// Writes are batched: callers mutate in-memory state and request `persist()`;
// the actual disk write happens once per debounce window. During heavy
// streaming, `setSessionUsage` fires per assistant message — without this
// debounce we'd write the full JSON + atomic rename tens of times per minute.
// STABILITY_RULES.md §2.2 mandates debouncing for any event-driven disk write.
const PERSIST_DEBOUNCE_MS = 500

export class ApiUsageStore {
  private readonly path:    string
  private readonly tmp:     string
  private state:            PersistedApiUsage
  private readonly clock:   () => number
  private pendingPersist:   ReturnType<typeof setTimeout> | null = null
  // Test seam — counts real disk writes performed. Tests assert this stays
  // bounded across rapid in-memory updates.
  persistCallCount = 0

  constructor(userDataDir: string, clock: () => number = Date.now) {
    this.path  = join(userDataDir, 'api-usage.json')
    this.tmp   = join(userDataDir, 'api-usage.json.tmp')
    this.clock = clock
    this.state = this.loadOrEmpty()
  }

  // ── lastBalance ──

  getLastBalance(providerId: ApiProviderId, currency: string): number | null {
    const e = this.state.lastBalance[balanceBucketKey(providerId, currency)]
    return e ? e.balance : null
  }

  setLastBalance(providerId: ApiProviderId, currency: string, balance: number): void {
    this.state.lastBalance[balanceBucketKey(providerId, currency)] = {
      providerId, currency, balance, ts: this.clock(),
    }
    this.persist()
  }

  // ── delta history ──

  getHistoryFor(providerId: ApiProviderId, currency: string): DeltaHistoryEntry[] {
    return this.state.deltaHistory.filter(e => e.providerId === providerId && e.currency === currency)
  }

  // Replaces the slice of deltaHistory belonging to (providerId, currency)
  // with the given snapshot. Other providers / currencies are left alone.
  setHistoryFor(providerId: ApiProviderId, currency: string, history: DeltaHistoryEntry[]): void {
    const others = this.state.deltaHistory.filter(e => !(e.providerId === providerId && e.currency === currency))
    this.state.deltaHistory = [...others, ...history]
    this.pruneHistory()
    this.persist()
  }

  // ── per-session usage ──

  getSessionUsage(sessionId: number): ApiUsageSnapshot | null {
    return this.state.sessions[sessionId] ?? null
  }

  setSessionUsage(snapshot: ApiUsageSnapshot): void {
    this.state.sessions[snapshot.sessionId] = snapshot
    this.persist()
  }

  removeSession(sessionId: number): void {
    delete this.state.sessions[sessionId]
    this.persist()
  }

  // Test seam — mostly so the orchestrator can read the persisted state
  // before hot-reading per-bucket helpers. Returns a deep copy.
  snapshot(): PersistedApiUsage {
    return JSON.parse(JSON.stringify(this.state)) as PersistedApiUsage
  }

  // ── internals ──

  private loadOrEmpty(): PersistedApiUsage {
    if (!existsSync(this.path)) return { lastBalance: {}, deltaHistory: [], sessions: {} }
    try {
      const raw    = readFileSync(this.path, 'utf8')
      const parsed = JSON.parse(raw) as Partial<PersistedApiUsage>
      return {
        lastBalance:  parsed.lastBalance  ?? {},
        deltaHistory: Array.isArray(parsed.deltaHistory) ? parsed.deltaHistory : [],
        sessions:     parsed.sessions     ?? {},
      }
    } catch {
      // Corrupted file — start fresh. Don't delete the file (forensics)
      // unless the next write succeeds, at which point rename clobbers it.
      return { lastBalance: {}, deltaHistory: [], sessions: {} }
    }
  }

  private pruneHistory(): void {
    const cutoff = this.clock() - SEVEN_DAYS_MS
    this.state.deltaHistory = this.state.deltaHistory.filter(e => e.ts >= cutoff)
  }

  // Schedule a disk write within the debounce window. Multiple calls coalesce
  // into one. The in-memory `state` is the source of truth for the UI — losing
  // the last <500 ms on crash is acceptable in exchange for cutting write
  // amplification by orders of magnitude during heavy streaming.
  private persist(): void {
    if (this.pendingPersist) return
    this.pendingPersist = setTimeout(() => {
      this.pendingPersist = null
      this.persistNow()
    }, PERSIST_DEBOUNCE_MS)
  }

  // Synchronous immediate write. Use only for graceful-shutdown paths and
  // tests; normal call sites should let `persist()` debounce.
  flush(): void {
    if (this.pendingPersist) {
      clearTimeout(this.pendingPersist)
      this.pendingPersist = null
    }
    this.persistNow()
  }

  private persistNow(): void {
    this.persistCallCount++
    const payload = JSON.stringify(this.state, null, 2)
    try {
      writeFileSync(this.tmp, payload, 'utf8')
      renameSync(this.tmp, this.path)
    } catch (err) {
      // Best-effort cleanup so the tmp file doesn't hang around.
      try { if (existsSync(this.tmp)) unlinkSync(this.tmp) } catch { /* ignore */ }
      throw err
    }
  }
}
