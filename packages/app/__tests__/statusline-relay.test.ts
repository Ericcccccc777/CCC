import { describe, it, expect } from 'vitest'
import { buildStatusLineRelay } from '../src/main/platform/shared'

// The relay is the only channel carrying context / 5h / weekly into CCC. Its
// port MUST come from the port file, not the environment: a terminal's
// CCC_PORT is frozen at `exec claude` time, so after an app restart the env
// value is a dead port and the readouts freeze silently.
class StatusLineRelayTests {
  static run(): void {
    describe('buildStatusLineRelay', () => {
      const src = buildStatusLineRelay('/Users/x/Library/Application Support/@ccc/app/ccc-port')

      it('reads the live port from the port file', () => {
        expect(src).toContain("fs.readFileSync(\"/Users/x/Library/Application Support/@ccc/app/ccc-port\", 'utf8')")
      })

      it('falls back to CCC_PORT so an older relay copy keeps working', () => {
        expect(src).toContain('if (!port) port = process.env.CCC_PORT')
      })

      it('still takes session identity from the env, which is correct per-terminal', () => {
        expect(src).toContain('process.env.CCC_SESSION_ID')
      })

      it('never throws when the port file is missing — a dead read must not kill the tick', () => {
        expect(src).toMatch(/try \{ port = fs\.readFileSync\([^)]*\)\.trim\(\); \} catch \(e\) \{\}/)
      })

      it('escapes a Windows path so the generated script stays valid JS', () => {
        const win = buildStatusLineRelay('C:\\Users\\x\\AppData\\Roaming\\@ccc\\app\\ccc-port')
        expect(win).toContain('"C:\\\\Users\\\\x\\\\AppData\\\\Roaming\\\\@ccc\\\\app\\\\ccc-port"')
      })

      it('escapes a path containing a quote', () => {
        expect(buildStatusLineRelay('/tmp/o"d/ccc-port')).toContain('"/tmp/o\\"d/ccc-port"')
      })

      // Cheapest possible guard that the emitted text is syntactically valid.
      it('emits parseable JavaScript', () => {
        expect(() => new Function(src)).not.toThrow()
        expect(() => new Function(buildStatusLineRelay('C:\\a\\b\\ccc-port'))).not.toThrow()
      })
    })
  }
}

StatusLineRelayTests.run()
