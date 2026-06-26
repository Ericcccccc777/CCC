import type { PlatformAdapter } from './PlatformAdapter'
import { WindowsAdapter } from './WindowsAdapter'
import { MacOSAdapter } from './MacOSAdapter'

// The single sanctioned reader of `process.platform` in the entire codebase
// (CLAUDE.md Rule 11). Every other module receives the resulting
// PlatformAdapter and never branches on the host OS itself.
export function createPlatformAdapter(): PlatformAdapter {
  switch (process.platform) {
    case 'win32':
      return new WindowsAdapter()
    case 'darwin':
      return new MacOSAdapter()
    default:
      throw new Error(
        `Unsupported platform: ${process.platform}. CCC supports win32 and darwin only.`,
      )
  }
}

// Cached adapter for the CLI-detection helpers below, so the Claude/Codex/MAGI
// managers (which aren't constructed with an adapter) can get platform-correct
// PATH dirs + `which` without each reading `process.platform` (Rule 11).
let cachedAdapter: PlatformAdapter | null = null
function sharedAdapter(): PlatformAdapter {
  if (!cachedAdapter) cachedAdapter = createPlatformAdapter()
  return cachedAdapter
}

export function cliPathEntries(): readonly string[] {
  return sharedAdapter().cliPathEntries()
}

export function whichCommand(binary: string): string {
  return sharedAdapter().whichCommand(binary)
}
