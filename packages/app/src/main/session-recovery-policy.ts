export interface CloseRecoveryDecisionInput {
  readonly recoveryHoldActive: boolean
  readonly hasPidFile:         boolean
  readonly userInitiatedClose: boolean
}

export interface WatcherRespawnDecisionInput {
  readonly hasPidFile:         boolean
  readonly innerPidAlive:      boolean
  readonly userInitiatedClose: boolean
}

export function shouldDeferCloseForRecovery(input: CloseRecoveryDecisionInput): boolean {
  return input.recoveryHoldActive && input.hasPidFile && !input.userInitiatedClose
}

export function shouldRespawnClosedWatcher(input: WatcherRespawnDecisionInput): boolean {
  return input.hasPidFile && input.innerPidAlive && !input.userInitiatedClose
}

export interface FinalizeCloseDecisionInput {
  readonly recoveryHoldActive: boolean
  readonly innerProcessAlive:  boolean
  readonly isLastAttempt:      boolean
}

// During unexpected-close recovery, decide whether to stop retrying and finalize
// the session's removal. A live inner process is never dropped. A dead one is
// dropped immediately unless we're still inside a sleep/resume hold AND have more
// attempts left — in which case we give the hold a chance to re-find a
// transiently-gone process, but still give up on the final attempt.
export function shouldFinalizeUnexpectedClose(input: FinalizeCloseDecisionInput): boolean {
  if (input.innerProcessAlive) return false
  return input.isLastAttempt || !input.recoveryHoldActive
}
