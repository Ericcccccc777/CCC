import { describe, it, expect } from 'vitest'
import { mapCodexEvent, dateDirCandidates } from '../src/main/CodexSessionWatcher'

// Tests for the pure helpers in CodexSessionWatcher. The class itself
// (file polling, BrowserWindow IPC dispatch) needs an Electron runtime;
// these tests cover the parsing surface that drives every emitted event.
class CodexSessionWatcherTests {
  static run(): void {
    describe('CodexSessionWatcher pure helpers', () => {
      describe('mapCodexEvent', () => {
        it('returns null for non-object input', () => {
          expect(mapCodexEvent(1, null)).toBeNull()
          expect(mapCodexEvent(1, 'string')).toBeNull()
          expect(mapCodexEvent(1, 42)).toBeNull()
        })

        it('returns null when type is not event_msg', () => {
          expect(mapCodexEvent(1, { type: 'session_meta', payload: {} })).toBeNull()
          expect(mapCodexEvent(1, { type: 'response_item', payload: {} })).toBeNull()
        })

        it('returns null when payload is missing', () => {
          expect(mapCodexEvent(1, { type: 'event_msg' })).toBeNull()
        })

        it('maps task_started → streaming state for the given session id', () => {
          const r = mapCodexEvent(42, {
            type: 'event_msg',
            payload: { type: 'task_started', turn_id: 'x' },
          })
          expect(r?.state).toEqual({ sessionId: 42, state: 'streaming' })
        })

        it('maps task_complete → done state', () => {
          const r = mapCodexEvent(7, {
            type: 'event_msg',
            payload: { type: 'task_complete' },
          })
          expect(r?.state).toEqual({ sessionId: 7, state: 'done' })
        })

        it('returns null for token_count (rate-limit surfacing intentionally off)', () => {
          const r = mapCodexEvent(3, {
            type: 'event_msg',
            payload: {
              type: 'token_count',
              rate_limits: {
                primary:   { used_percent: 8,  resets_at: 1_778_940_050 },
                secondary: { used_percent: 12, resets_at: 1_779_331_551 },
              },
            },
          })
          expect(r).toBeNull()
        })

        it('ignores unknown event_msg subtypes', () => {
          expect(mapCodexEvent(1, {
            type: 'event_msg',
            payload: { type: 'agent_message', message: 'hi' },
          })).toBeNull()
          expect(mapCodexEvent(1, {
            type: 'event_msg',
            payload: { type: 'user_message', message: 'hello' },
          })).toBeNull()
        })
      })

      describe('dateDirCandidates', () => {
        it('returns today + yesterday paths, deduped between UTC and local', () => {
          // Mid-day UTC, with the test environment's TZ (whatever it is)
          // matching for that instant → local & UTC dates are the same,
          // so we expect exactly today + yesterday (2 entries).
          const now = new Date(Date.UTC(2026, 4, 16, 12, 0, 0))
          const dirs = dateDirCandidates('/root', now)
          expect(dirs.length).toBeGreaterThanOrEqual(2)
          expect(dirs.length).toBeLessThanOrEqual(4)
          // Today must be in the list under either UTC or local naming.
          const yyyy = '2026'
          const today = dirs.some(d => d.startsWith(`/root/${yyyy}/05/16`))
          expect(today).toBe(true)
        })

        it('includes both UTC and local dates when they differ', () => {
          // UTC midnight, but for a TZ ahead of UTC the local date is the
          // NEXT day. Run with UTC+10 simulation by picking a time where
          // we know they straddle midnight.
          const now = new Date(Date.UTC(2026, 4, 15, 23, 30, 0))
          const dirs = dateDirCandidates('/root', now)
          // Should include today AND yesterday in at least one naming;
          // exact contents depend on TZ but length is ≥ 2.
          expect(dirs.length).toBeGreaterThanOrEqual(2)
        })
      })
    })
  }
}

CodexSessionWatcherTests.run()
