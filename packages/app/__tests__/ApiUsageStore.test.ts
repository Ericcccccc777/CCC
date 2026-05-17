import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ApiUsageStore } from '../src/main/api/ApiUsageStore'
import { SEVEN_DAYS_MS } from '../src/shared/api-usage'

class ApiUsageStoreTests {
  static makeDir(): string { return mkdtempSync(join(tmpdir(), 'ccc-apiusage-')) }

  static run(): void {
    describe('ApiUsageStore', () => {
      describe('cold start', () => {
        let dir: string
        beforeEach(() => { dir = ApiUsageStoreTests.makeDir() })

        it('returns null/empty for everything when file does not exist', () => {
          const s = new ApiUsageStore(dir)
          expect(s.getLastBalance('deepseek', 'CNY')).toBeNull()
          expect(s.getHistoryFor('deepseek', 'CNY')).toEqual([])
          expect(s.getSessionUsage(1)).toBeNull()
        })

        it('treats a corrupt JSON file as cold start (no throw)', () => {
          writeFileSync(join(dir, 'api-usage.json'), '{ this is not json', 'utf8')
          const s = new ApiUsageStore(dir)
          expect(s.getLastBalance('deepseek', 'CNY')).toBeNull()
        })

        it('treats a partial JSON file (missing fields) as cold start with safe defaults', () => {
          writeFileSync(join(dir, 'api-usage.json'), JSON.stringify({}), 'utf8')
          const s = new ApiUsageStore(dir)
          expect(s.getLastBalance('deepseek', 'CNY')).toBeNull()
          expect(s.getHistoryFor('deepseek', 'CNY')).toEqual([])
        })
      })

      describe('round-trip through the filesystem', () => {
        let dir: string
        beforeEach(() => { dir = ApiUsageStoreTests.makeDir() })

        // Writes are debounced (STABILITY_RULES.md §2.2). Tests that need to
        // assert disk state must call flush() first; production code can use
        // the same hook on graceful shutdown.

        it('persists lastBalance across instances', () => {
          const a = new ApiUsageStore(dir, () => 1)
          a.setLastBalance('deepseek', 'CNY', 9.94)
          a.flush()
          const b = new ApiUsageStore(dir)
          expect(b.getLastBalance('deepseek', 'CNY')).toBe(9.94)
        })

        it('persists deltaHistory and prunes 7-day-old entries on save', () => {
          const a = new ApiUsageStore(dir, () => 1_000_000_000_000)
          a.setHistoryFor('deepseek', 'CNY', [
            { providerId: 'deepseek', currency: 'CNY', amount: 1, ts: 1_000_000_000_000 },
            { providerId: 'deepseek', currency: 'CNY', amount: 2, ts: 1_000_000_000_000 - SEVEN_DAYS_MS - 1 },
          ])
          a.flush()
          const persisted = JSON.parse(readFileSync(join(dir, 'api-usage.json'), 'utf8'))
          expect(persisted.deltaHistory).toHaveLength(1)
          expect(persisted.deltaHistory[0].amount).toBe(1)
        })

        it('setHistoryFor only replaces the matching (provider, currency) slice', () => {
          const a = new ApiUsageStore(dir, () => 0)
          a.setHistoryFor('deepseek', 'CNY', [{ providerId: 'deepseek', currency: 'CNY', amount: 1, ts: 0 }])
          a.setHistoryFor('deepseek', 'USD', [{ providerId: 'deepseek', currency: 'USD', amount: 9, ts: 0 }])
          expect(a.getHistoryFor('deepseek', 'CNY')).toHaveLength(1)
          expect(a.getHistoryFor('deepseek', 'USD')).toHaveLength(1)
          // CNY untouched after USD set
          a.setHistoryFor('deepseek', 'USD', [])
          expect(a.getHistoryFor('deepseek', 'CNY')).toHaveLength(1)
          expect(a.getHistoryFor('deepseek', 'USD')).toHaveLength(0)
        })

        it('persists per-session usage and supports remove', () => {
          const a = new ApiUsageStore(dir, () => 0)
          a.setSessionUsage({
            sessionId: 7, providerId: 'deepseek', modelId: 'deepseek-v4-flash',
            inputTokens: 100, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0,
            estimatedCostUsd: 0.0001, updatedAt: 0,
          })
          a.flush()
          const b = new ApiUsageStore(dir)
          expect(b.getSessionUsage(7)?.inputTokens).toBe(100)
          b.removeSession(7)
          b.flush()
          const c = new ApiUsageStore(dir)
          expect(c.getSessionUsage(7)).toBeNull()
        })

        it('atomic write: tmp file is gone after a successful save', () => {
          const s = new ApiUsageStore(dir, () => 0)
          s.setLastBalance('deepseek', 'CNY', 1)
          s.flush()
          expect(existsSync(join(dir, 'api-usage.json'))).toBe(true)
          expect(existsSync(join(dir, 'api-usage.json.tmp'))).toBe(false)
        })

        // Debounce contract: many rapid in-memory updates coalesce into ONE
        // disk write per debounce window. The number 1 below comes from the
        // 500 ms window — every setSessionUsage call within the window only
        // schedules one write.
        it('debounces persist: many rapid writes coalesce into one disk write', async () => {
          const s = new ApiUsageStore(dir, () => 0)
          for (let i = 0; i < 20; i++) {
            s.setSessionUsage({
              sessionId: i, providerId: 'deepseek', modelId: 'deepseek-v4-flash',
              inputTokens: 100, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0,
              estimatedCostUsd: 0.0001, updatedAt: 0,
            })
          }
          expect(s.persistCallCount).toBe(0)  // none flushed yet
          s.flush()
          expect(s.persistCallCount).toBe(1)  // exactly one disk write
          // All 20 sessions made it to memory and (after flush) to disk
          const reloaded = new ApiUsageStore(dir)
          expect(reloaded.getSessionUsage(0)?.sessionId).toBe(0)
          expect(reloaded.getSessionUsage(19)?.sessionId).toBe(19)
        })
      })
    })
  }
}

ApiUsageStoreTests.run()
