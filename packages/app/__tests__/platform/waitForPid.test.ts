import { describe, it, expect } from 'vitest'
import { execFileSync, spawnSync } from 'child_process'
import { mkdtempSync, writeFileSync, chmodSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { waitForPidLines } from '../../src/main/platform/MacOSAdapter'

// This text is written to disk and executed by /bin/sh for the entire life of
// every session, so a typo here is a busy-loop or a session that never reports
// its exit. Run it for real rather than asserting on the string.
class WaitForPidTests {
  // The watched process must NOT be a child of the test process: execFileSync
  // blocks the event loop, so Node cannot reap its own children and the target
  // would linger as a zombie that `kill -0` still reports as alive. Spawning
  // through a shell that exits immediately reparents it to launchd, which
  // reaps it properly.
  static detachedPid(seconds: number): number {
    const out = execFileSync('/bin/sh', ['-c', `sleep ${seconds} >/dev/null 2>&1 & echo $!`], { encoding: 'utf8' })
    return Number(out.trim())
  }

  static script(body: string[]): string {
    const dir = mkdtempSync(join(tmpdir(), 'ccc-wait-'))
    const p = join(dir, 'watch.sh')
    writeFileSync(p, ['#!/bin/sh', ...body, 'echo DONE'].join('\n') + '\n', 'utf8')
    chmodSync(p, 0o755)
    return p
  }

  static run(): void {
    describe('waitForPidLines', () => {
      it('exits promptly once the watched pid is gone, and prints nothing before', () => {
        const pid = WaitForPidTests.detachedPid(3)
        const script = WaitForPidTests.script(waitForPidLines(String(pid)))

        const started = Date.now()
        const out = execFileSync('/bin/sh', [script], { encoding: 'utf8', timeout: 20_000 })
        const elapsed = Date.now() - started

        expect(out.trim()).toBe('DONE')
        // Left when the target died (~3s), not early and not a second late.
        expect(elapsed).toBeGreaterThan(2_500)
        expect(elapsed).toBeLessThan(6_000)
      }, 25_000)

      it('returns immediately for a pid that is already gone', () => {
        const pid = WaitForPidTests.detachedPid(0)
        execFileSync('/bin/sh', ['-c', 'sleep 0.5'])   // let it exit and be reaped
        const script = WaitForPidTests.script(waitForPidLines(String(pid)))

        const started = Date.now()
        execFileSync('/bin/sh', [script], { encoding: 'utf8', timeout: 10_000 })
        expect(Date.now() - started).toBeLessThan(1_500)
      }, 15_000)

      // The whole point: no /bin/sleep forks while waiting. CPU time is too
      // coarse to prove that (a handful of forks hides under the 10 ms clock),
      // so count the execs directly with a shim earlier on PATH.
      it('never execs /bin/sleep while waiting, where the old loop did', () => {
        const probe = (body: string[]): number => {
          const dir = mkdtempSync(join(tmpdir(), 'ccc-shim-'))
          const counter = join(dir, 'count')
          writeFileSync(join(dir, 'sleep'),
            `#!/bin/sh\necho x >> '${counter}'\nexec /bin/sleep "$@"\n`, 'utf8')
          chmodSync(join(dir, 'sleep'), 0o755)
          writeFileSync(counter, '', 'utf8')

          const pid = WaitForPidTests.detachedPid(4)
          const script = WaitForPidTests.script(body.map(l => l.replace('__PID__', String(pid))))
          spawnSync('/bin/sh', [script], {
            timeout: 20_000,
            env: { ...process.env, PATH: `${dir}:${process.env['PATH'] ?? ''}` },
          })
          return readFileSync(counter, 'utf8').split('\n').filter(Boolean).length
        }

        const emitted = probe(waitForPidLines('__PID__'))
        const oldLoop = probe(['while kill -0 __PID__ 2>/dev/null; do sleep 1; done'])

        expect(oldLoop).toBeGreaterThanOrEqual(3)   // ~4 forks over a 4s watch
        expect(emitted).toBe(0)
      }, 40_000)

      it('quotes the pid expression through unchanged', () => {
        expect(waitForPidLines('"$PID"').some(l => l.includes('kill -0 "$PID"'))).toBe(true)
        expect(waitForPidLines('123').some(l => l.includes('kill -0 123'))).toBe(true)
      })
    })
  }
}

WaitForPidTests.run()
