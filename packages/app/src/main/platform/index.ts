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
