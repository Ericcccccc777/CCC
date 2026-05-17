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
