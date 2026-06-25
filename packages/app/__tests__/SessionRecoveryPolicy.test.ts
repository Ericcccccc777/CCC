import { describe, expect, it } from 'vitest'
import { shouldDeferCloseForRecovery, shouldRespawnClosedWatcher, shouldFinalizeUnexpectedClose } from '../src/main/session-recovery-policy'

class SessionRecoveryPolicyTests {
  static run(): void {
    describe('SessionRecoveryPolicy', () => {
      it('defers recoverable watcher closes while the sleep/wake hold is active', () => {
        expect(shouldDeferCloseForRecovery({
          recoveryHoldActive: true,
          hasPidFile:         true,
          userInitiatedClose: false,
        })).toBe(true)
      })

      it('does not defer user-initiated closes during the recovery hold', () => {
        expect(shouldDeferCloseForRecovery({
          recoveryHoldActive: true,
          hasPidFile:         true,
          userInitiatedClose: true,
        })).toBe(false)
      })

      it('does not defer unrecoverable sessions without an inner pid file', () => {
        expect(shouldDeferCloseForRecovery({
          recoveryHoldActive: true,
          hasPidFile:         false,
          userInitiatedClose: false,
        })).toBe(false)
      })

      it('respawns a closed watcher when the inner CLI is still alive', () => {
        expect(shouldRespawnClosedWatcher({
          hasPidFile:         true,
          innerPidAlive:      true,
          userInitiatedClose: false,
        })).toBe(true)
      })

      it('does not respawn a closed watcher for a user stop', () => {
        expect(shouldRespawnClosedWatcher({
          hasPidFile:         true,
          innerPidAlive:      true,
          userInitiatedClose: true,
        })).toBe(false)
      })

      it('finalizes a dead session immediately when not in a recovery hold (e.g. terminal closed)', () => {
        expect(shouldFinalizeUnexpectedClose({
          recoveryHoldActive: false,
          innerProcessAlive:  false,
          isLastAttempt:      false,
        })).toBe(true)
      })

      it('never finalizes while the inner process is still alive', () => {
        expect(shouldFinalizeUnexpectedClose({
          recoveryHoldActive: false,
          innerProcessAlive:  true,
          isLastAttempt:      true,
        })).toBe(false)
      })

      it('keeps retrying a dead session during a sleep/resume hold until the last attempt', () => {
        expect(shouldFinalizeUnexpectedClose({
          recoveryHoldActive: true,
          innerProcessAlive:  false,
          isLastAttempt:      false,
        })).toBe(false)
        // …but gives up on the final attempt so it can't linger forever
        expect(shouldFinalizeUnexpectedClose({
          recoveryHoldActive: true,
          innerProcessAlive:  false,
          isLastAttempt:      true,
        })).toBe(true)
      })
    })
  }
}

SessionRecoveryPolicyTests.run()
