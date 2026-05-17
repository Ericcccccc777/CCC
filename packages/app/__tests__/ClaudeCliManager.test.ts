import { describe, expect, it } from 'vitest'
import { ClaudeCliManager } from '../src/main/ClaudeCliManager'

// Uses real exec() against the developer/CI environment. The assertions are
// deliberately shape-level so machines without Claude Code still validate the
// manager contract.
class ClaudeCliManagerTests {
  static run(): void {
    describe('ClaudeCliManager', () => {
      it('returns a valid ClaudeCliStatus shape', async () => {
        const manager = new ClaudeCliManager()
        const status = await manager.detect()

        expect(status).toHaveProperty('installed')
        expect(status).toHaveProperty('loggedIn')
        expect(status).toHaveProperty('account')
        expect(status).toHaveProperty('version')
        expect(typeof status.installed).toBe('boolean')
        expect(typeof status.loggedIn).toBe('boolean')
      })

      // Cache contract — STABILITY_RULES.md §2.1 mandates that every
      // user-visible click on the pill expand path returns instantly. We
      // verify by asserting only ONE underlying probe runs across two
      // rapid detect() calls, and TWO across detect() + redetect().
      it('caches detect() results so rapid second call does not re-probe', async () => {
        const manager = new ClaudeCliManager()
        await manager.detect()
        const first = manager.detectCallCount
        await manager.detect()
        const second = manager.detectCallCount
        expect(first).toBe(1)
        expect(second).toBe(1)
      })

      it('redetect() bypasses the cache and triggers a fresh probe', async () => {
        const manager = new ClaudeCliManager()
        await manager.detect()
        const before = manager.detectCallCount
        await manager.redetect()
        const after = manager.detectCallCount
        expect(before).toBe(1)
        expect(after).toBe(2)
      })

      it('concurrent detect() calls share a single in-flight probe', async () => {
        const manager = new ClaudeCliManager()
        const [a, b, c] = await Promise.all([
          manager.detect(),
          manager.detect(),
          manager.detect(),
        ])
        expect(manager.detectCallCount).toBe(1)
        expect(a).toEqual(b)
        expect(b).toEqual(c)
      })
    })
  }
}

ClaudeCliManagerTests.run()
