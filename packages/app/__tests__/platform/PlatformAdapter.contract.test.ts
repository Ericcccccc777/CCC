import { describe, it, expect } from 'vitest'
import { WindowsAdapter } from '../../src/main/platform/WindowsAdapter'
import { MacOSAdapter } from '../../src/main/platform/MacOSAdapter'
import type { PlatformAdapter } from '../../src/main/platform/PlatformAdapter'

// CLAUDE.md Rule 11: "A cross-adapter contract test asserts that all adapters
// satisfy the same observable behavior for shared methods."
//
// Only the platform-agnostic surface (capabilities, shouldQuitOnAllWindowsClosed)
// is contract-tested across both adapters. The lifecycle / hook-building
// methods diverge by design: WindowsAdapter implements them in PowerShell,
// MacOSAdapter throws NotImplementedYetError until the macOS phase ships.
// Asserting equivalent behaviour for those would be wrong.

interface NamedAdapter {
  readonly name: string
  readonly adapter: PlatformAdapter
}

const adapters: ReadonlyArray<NamedAdapter> = [
  { name: 'WindowsAdapter', adapter: new WindowsAdapter() },
  { name: 'MacOSAdapter',   adapter: new MacOSAdapter() },
]

class PlatformAdapterContractTests {
  static run(): void {
    describe('PlatformAdapter contract — applies to every adapter', () => {
      for (const { name, adapter } of adapters) {
        describe(name, () => {
          describe('capabilities()', () => {
            const caps = adapter.capabilities()

            it('returns a platform field that matches the documented allow-list', () => {
              expect(['win32', 'darwin']).toContain(caps.platform)
            })

            it('returns a boolean needsAccessibilityPermission flag', () => {
              expect(typeof caps.needsAccessibilityPermission).toBe('boolean')
            })

            it('hasAccessibilityPermissionInitially, when present, is a boolean', () => {
              if (caps.hasAccessibilityPermissionInitially !== undefined) {
                expect(typeof caps.hasAccessibilityPermissionInitially).toBe('boolean')
              }
            })
          })

          describe('shouldQuitOnAllWindowsClosed()', () => {
            it('returns a boolean', () => {
              expect(typeof adapter.shouldQuitOnAllWindowsClosed()).toBe('boolean')
            })
          })
        })
      }
    })
  }
}

PlatformAdapterContractTests.run()
