// Cross-process platform-capability descriptor. The main process produces it
// via PlatformAdapter.capabilities(); the renderer consumes it (through the
// preload bridge) to decide platform-specific UI like the macOS Accessibility
// banner. Defined in `shared/` so main and renderer can both import it
// without crossing the process boundary.
export interface PlatformCapabilities {
  readonly platform:                            'win32' | 'darwin'
  readonly needsAccessibilityPermission:        boolean
  readonly hasAccessibilityPermissionInitially?: boolean
}
