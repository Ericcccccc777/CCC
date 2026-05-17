import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  ApiUsageManager,
  type ApiKeyResolver,
  type UsageBroadcaster,
  type IntervalScheduler,
} from '../src/main/api/ApiUsageManager'
import { ApiUsageStore } from '../src/main/api/ApiUsageStore'
import { DeepSeekClient, type BalanceHttpTransport } from '../src/main/api/DeepSeekClient'
import type { ApiBalanceSnapshot, ApiUsageSnapshot } from '../src/shared/api-usage'

class FakeKeys implements ApiKeyResolver {
  key: string | null = 'sk-test'
  readKey(): string | null { return this.key }
}

class FakeBroadcaster implements UsageBroadcaster {
  usage:   ApiUsageSnapshot[]   = []
  balance: ApiBalanceSnapshot[] = []
  sendUsage(s: ApiUsageSnapshot): void   { this.usage.push(s) }
  sendBalance(s: ApiBalanceSnapshot): void { this.balance.push(s) }
}

class ManualScheduler implements IntervalScheduler {
  ticks: Array<{ handler: () => void; ms: number; cancelled: boolean }> = []
  setInterval(handler: () => void, ms: number): { cancel: () => void } {
    const slot = { handler, ms, cancelled: false }
    this.ticks.push(slot)
    return { cancel: () => { slot.cancelled = true } }
  }
  // Fire all live timers once, sequentially.
  fire(): void { for (const t of this.ticks) if (!t.cancelled) t.handler() }
}

class FakeTransport implements BalanceHttpTransport {
  queue: Array<{ status: number; body: string } | Error> = []
  async get(): Promise<{ status: number; body: string }> {
    const next = this.queue.shift()
    if (!next) throw new Error('FakeTransport queue empty')
    if (next instanceof Error) throw next
    return next
  }
  push(balance: number, currency = 'CNY'): void {
    this.queue.push({
      status: 200,
      body: JSON.stringify({ balance_infos: [{ currency, total_balance: String(balance) }] }),
    })
  }
}

class ApiUsageManagerTests {
  static makeMgr() {
    const dir   = mkdtempSync(join(tmpdir(), 'ccc-uum-'))
    const store = new ApiUsageStore(dir, () => 1000)
    const keys  = new FakeKeys()
    const http  = new FakeTransport()
    const client = new DeepSeekClient(http, () => 1000)
    const out   = new FakeBroadcaster()
    const sched = new ManualScheduler()
    const mgr   = new ApiUsageManager({ store, keys, client, broadcaster: out, scheduler: sched, pollMs: 1000, clock: () => 1000 })
    return { mgr, store, keys, http, out, sched, dir }
  }

  static async flushBalance(): Promise<void> {
    // Two micro-ticks so the chained setLastBalance/setHistoryFor inside
    // refreshBalance() settles before assertions.
    await Promise.resolve()
    await Promise.resolve()
  }

  static run(): void {
    describe('ApiUsageManager', () => {
      describe('session register / unregister + refcounted polling', () => {
        let ctx: ReturnType<typeof ApiUsageManagerTests.makeMgr>
        beforeEach(() => { ctx = ApiUsageManagerTests.makeMgr() })

        it('first registerSession creates a poller; refCount = 1', () => {
          ctx.http.push(9.94)
          ctx.mgr.registerSession(1, 'deepseek', 'deepseek-v4-flash')
          const p = ctx.mgr.inspectProvider('deepseek')
          expect(p?.refCount).toBe(1)
          expect(p?.pollerActive).toBe(true)
          expect(ctx.sched.ticks.length).toBe(1)
        })

        it('second registerSession on same provider bumps refCount, not poller count', () => {
          ctx.http.push(9.94)
          ctx.http.push(9.94)
          ctx.mgr.registerSession(1, 'deepseek', 'deepseek-v4-flash')
          ctx.mgr.registerSession(2, 'deepseek', 'deepseek-v4-pro')
          expect(ctx.mgr.inspectProvider('deepseek')?.refCount).toBe(2)
          expect(ctx.sched.ticks.length).toBe(1)
        })

        it('unregister drops refCount; final unregister cancels the poller', () => {
          ctx.http.push(1)
          ctx.http.push(1)
          ctx.mgr.registerSession(1, 'deepseek', 'deepseek-v4-flash')
          ctx.mgr.registerSession(2, 'deepseek', 'deepseek-v4-flash')
          ctx.mgr.unregisterSession(1)
          expect(ctx.mgr.inspectProvider('deepseek')?.refCount).toBe(1)
          ctx.mgr.unregisterSession(2)
          expect(ctx.mgr.inspectProvider('deepseek')).toBeNull()
          expect(ctx.sched.ticks[0]?.cancelled).toBe(true)
        })

        it('unregister on unknown session is a no-op', () => {
          ctx.mgr.unregisterSession(99)
          expect(ctx.mgr.inspectProvider('deepseek')).toBeNull()
        })
      })

      describe('balance refresh + delta', () => {
        let ctx: ReturnType<typeof ApiUsageManagerTests.makeMgr>
        beforeEach(() => { ctx = ApiUsageManagerTests.makeMgr() })

        it('first refresh: broadcasts a snapshot with stale=false; weeklySpending=0 (seeding)', async () => {
          ctx.http.push(10)
          ctx.mgr.registerSession(1, 'deepseek', 'deepseek-v4-flash')
          await ApiUsageManagerTests.flushBalance()
          expect(ctx.out.balance).toHaveLength(1)
          expect(ctx.out.balance[0]).toMatchObject({
            providerId: 'deepseek', balance: 10, currency: 'CNY', stale: false, weeklySpending: 0,
          })
        })

        it('second refresh with consumption: weeklySpending reflects the drop', async () => {
          ctx.http.push(10)
          ctx.http.push(7)
          ctx.mgr.registerSession(1, 'deepseek', 'deepseek-v4-flash')
          await ApiUsageManagerTests.flushBalance()
          ctx.sched.fire()                            // poll #2
          await ApiUsageManagerTests.flushBalance()
          const last = ctx.out.balance.at(-1)!
          expect(last.balance).toBe(7)
          expect(last.weeklySpending).toBeCloseTo(3, 6)
        })

        it('top-up does not register as spending', async () => {
          ctx.http.push(10)
          ctx.http.push(50)
          ctx.mgr.registerSession(1, 'deepseek', 'deepseek-v4-flash')
          await ApiUsageManagerTests.flushBalance()
          ctx.sched.fire()
          await ApiUsageManagerTests.flushBalance()
          expect(ctx.out.balance.at(-1)!.weeklySpending).toBe(0)
        })

        it('network failure broadcasts last snapshot with stale=true', async () => {
          ctx.http.push(10)                           // first ok
          ctx.http.queue.push(new Error('ENETDOWN'))  // second fails
          ctx.mgr.registerSession(1, 'deepseek', 'deepseek-v4-flash')
          await ApiUsageManagerTests.flushBalance()
          ctx.sched.fire()
          await ApiUsageManagerTests.flushBalance()
          const last = ctx.out.balance.at(-1)!
          expect(last.stale).toBe(true)
          expect(last.balance).toBe(10) // last known
        })

        it('first-ever fetch failure: nothing broadcast (no prior to mark stale)', async () => {
          ctx.http.queue.push(new Error('boom'))
          ctx.mgr.registerSession(1, 'deepseek', 'deepseek-v4-flash')
          await ApiUsageManagerTests.flushBalance()
          expect(ctx.out.balance).toHaveLength(0)
        })

        it('persists lastBalance + history across instances (cold-load)', async () => {
          ctx.http.push(10)
          ctx.http.push(7)
          ctx.mgr.registerSession(1, 'deepseek', 'deepseek-v4-flash')
          await ApiUsageManagerTests.flushBalance()
          ctx.sched.fire()
          await ApiUsageManagerTests.flushBalance()
          // ApiUsageStore debounces writes (STABILITY_RULES.md §2.2).
          // Flush the in-memory snapshot to disk before cold-loading.
          ctx.store.flush()

          // Cold-load a second store from the same dir; verify the persisted
          // history contains the spend entry.
          const cold = new ApiUsageStore(ctx.dir, () => 1000)
          expect(cold.getLastBalance('deepseek', 'CNY')).toBe(7)
          expect(cold.getHistoryFor('deepseek', 'CNY')).toHaveLength(1)
        })
      })

      describe('per-session token accumulation via transcript lines', () => {
        let ctx: ReturnType<typeof ApiUsageManagerTests.makeMgr>
        beforeEach(() => { ctx = ApiUsageManagerTests.makeMgr() })

        it('extracts usage from an assistant transcript line and broadcasts', () => {
          ctx.http.push(10)
          ctx.mgr.registerSession(1, 'deepseek', 'deepseek-v4-flash')
          ctx.mgr.onTranscriptLine(1, {
            message: { role: 'assistant', usage: { input_tokens: 100, output_tokens: 20 } },
          })
          expect(ctx.out.usage).toHaveLength(1)
          expect(ctx.out.usage[0]).toMatchObject({
            sessionId:    1,
            inputTokens:  100,
            outputTokens: 20,
          })
        })

        it('ignores non-assistant lines', () => {
          ctx.http.push(10)
          ctx.mgr.registerSession(1, 'deepseek', 'deepseek-v4-flash')
          ctx.mgr.onTranscriptLine(1, { message: { role: 'user', content: 'hi' } })
          expect(ctx.out.usage).toHaveLength(0)
        })

        it('ignores transcript lines for unregistered sessions (Anthropic-mode safety)', () => {
          ctx.mgr.onTranscriptLine(42, {
            message: { role: 'assistant', usage: { input_tokens: 999 } },
          })
          expect(ctx.out.usage).toHaveLength(0)
        })

        it('persists usage to ApiUsageStore on each apply', () => {
          ctx.http.push(10)
          ctx.mgr.registerSession(1, 'deepseek', 'deepseek-v4-flash')
          ctx.mgr.onTranscriptLine(1, {
            message: { role: 'assistant', usage: { input_tokens: 100, output_tokens: 5 } },
          })
          expect(ctx.store.getSessionUsage(1)?.inputTokens).toBe(100)
        })

        it('cold-load resumes accumulation from persisted snapshot', () => {
          ctx.store.setSessionUsage({
            sessionId: 1, providerId: 'deepseek', modelId: 'deepseek-v4-flash',
            inputTokens: 500, outputTokens: 50, cacheReadTokens: 0, cacheCreationTokens: 0,
            estimatedCostUsd: 0, updatedAt: 0,
          })
          ctx.http.push(10)
          ctx.mgr.registerSession(1, 'deepseek', 'deepseek-v4-flash')
          ctx.mgr.onTranscriptLine(1, {
            message: { role: 'assistant', usage: { input_tokens: 7 } },
          })
          expect(ctx.out.usage[0]?.inputTokens).toBe(507) // 500 prior + 7 new
        })
      })
    })
  }
}

ApiUsageManagerTests.run()
