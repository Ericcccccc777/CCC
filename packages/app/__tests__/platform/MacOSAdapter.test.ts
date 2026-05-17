import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { spawn } from 'child_process'
import * as http from 'http'
import type { AddressInfo } from 'net'
import {
  MacOSAdapter,
  buildShellEnvExports,
  buildInjectKeystrokesAppleScript,
  buildFocusWindowAppleScript,
  parseMacOSCliProcesses,
} from '../../src/main/platform/MacOSAdapter'
import { NotImplementedYetError } from '../../src/main/platform/PlatformAdapter'

// Phase C1 (hook commands) and C2 (lifecycle) are now real implementations,
// matching the WindowsAdapter test pattern: pure-data methods are
// unit-tested; spawn-using lifecycle methods are NOT exercised here (would
// require mocking `child_process` and `fs` and would still not catch the
// real surface area — Terminal.app spawn, AppleScript, kill -0). Those gate
// on macOS real-hardware manual verification per CLAUDE.md Rule 9.
//
// Phase C3 (`injectKeystrokes`) still throws `NotImplementedYetError` and
// has a regression test below.
class MacOSAdapterTests {
  static run(): void {
    describe('MacOSAdapter', () => {
      const adapter = new MacOSAdapter()

      describe('buildHookCommands (Phase C1)', () => {
        const cmds = adapter.buildHookCommands(7, 12345)

        it('returns Stop / PreToolUse / Notification keys', () => {
          expect(Object.keys(cmds).sort()).toEqual(['Notification', 'PreToolUse', 'Stop'])
        })

        it('tags every command with # ccc-hook so ClaudeSettingsManager can re-inject idempotently', () => {
          expect(cmds.Stop).toContain('# ccc-hook')
          expect(cmds.PreToolUse).toContain('# ccc-hook')
          expect(cmds.Notification).toContain('# ccc-hook')
        })

        it('passes sessionId / port / event via CCC_SID / CCC_PORT / CCC_EV env-var prefix (not argv — Node `-e` mode shifts argv index across versions)', () => {
          expect(cmds.Stop).toMatch(/CCC_SID=7\s+CCC_PORT=12345\s+CCC_EV=stop\s+node\s+-e/)
          expect(cmds.PreToolUse).toMatch(/CCC_SID=7\s+CCC_PORT=12345\s+CCC_EV=pretooluse\s+node\s+-e/)
          expect(cmds.Notification).toMatch(/CCC_SID=7\s+CCC_PORT=12345\s+CCC_EV=notification\s+node\s+-e/)
        })

        it('uses single-quoted node -e (the JS body must contain no single quotes; sh wraps cleanly)', () => {
          expect(cmds.Stop).toContain(" node -e '")
          expect(cmds.PreToolUse).toContain(" node -e '")
          expect(cmds.Notification).toContain(" node -e '")
          // The JS body must round-trip through single-quoted shell wrapping:
          // any single-quote inside would terminate the shell argument early.
          const between = cmds.Stop.split("'")
          // Expected: ["CCC_SID=7 CCC_PORT=12345 CCC_EV=stop node -e ", "<JS body>", " # ccc-hook"]
          expect(between.length).toBe(3)
        })

        it('embeds the hook URL components (port + /hook path)', () => {
          expect(cmds.Stop).toContain('"127.0.0.1"')
          expect(cmds.Stop).toContain('"/hook"')
        })
      })

      // End-to-end regression: actually spawn the produced shell command, point
      // it at a local HTTP server, and assert the POST body matches expectations.
      // This catches the argv-off-by-one bug fixed 2026-05-05 — the previous
      // structural assertions all passed even though the script read the wrong
      // argv slots and silently exit-0'd on TCP failure (port=NaN). This test
      // would have failed because the server would never receive the POST.
      //
      // Uses real `node` + real `sh` + real loopback HTTP — no OS surface mock.
      // This is fine: `node` ships with vitest, `sh` is required on every
      // platform CCC supports (and present on GitHub's windows-latest via Git
      // Bash). The only platform-specific surfaces (osascript, Terminal.app,
      // AppleScript keystroke, kill -0) are NOT exercised here.
      describe('hook script body — end-to-end POST behavior', () => {
        let server: http.Server
        let port:   number
        let received: Array<{ url: string; body: Record<string, unknown> }>

        beforeEach(async () => {
          received = []
          server = http.createServer((req, res) => {
            let raw = ''
            req.on('data', (c: Buffer) => { raw += c.toString() })
            req.on('end', () => {
              try {
                received.push({
                  url:  req.url ?? '',
                  body: JSON.parse(raw) as Record<string, unknown>,
                })
              } catch { /* malformed body — leave unrecorded so test fails loudly */ }
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ exitCode: 0 }))
            })
          })
          await new Promise<void>(resolve => {
            server.listen(0, '127.0.0.1', () => resolve())
          })
          port = (server.address() as AddressInfo).port
        })

        afterEach(async () => {
          await new Promise<void>(resolve => server.close(() => resolve()))
        })

        const runHook = (command: string, stdinJson: string): Promise<void> =>
          new Promise<void>((resolve, reject) => {
            const proc = spawn('sh', ['-c', command])
            proc.stdin.write(stdinJson)
            proc.stdin.end()
            const t = setTimeout(
              () => { proc.kill(); reject(new Error('hook script timed out')) },
              5000,
            )
            proc.on('close', () => { clearTimeout(t); resolve() })
            proc.on('error', (e: Error) => { clearTimeout(t); reject(e) })
          })

        it('Stop hook POSTs {sessionId, event:"stop"} to /hook', async () => {
          const cmds = adapter.buildHookCommands(42, port)
          await runHook(cmds.Stop, '{}')
          expect(received).toHaveLength(1)
          expect(received[0].url).toBe('/hook')
          expect(received[0].body).toEqual({ sessionId: 42, event: 'stop' })
        })

        it('PreToolUse hook POSTs tool + toolInput parsed from stdin', async () => {
          const cmds = adapter.buildHookCommands(7, port)
          const stdinJson = JSON.stringify({
            tool_name:  'Bash',
            tool_input: { command: 'ls -la' },
          })
          await runHook(cmds.PreToolUse, stdinJson)
          expect(received).toHaveLength(1)
          expect(received[0].url).toBe('/hook')
          expect(received[0].body).toEqual({
            sessionId: 7,
            event:     'pretooluse',
            tool:      'Bash',
            toolInput: { command: 'ls -la' },
          })
        })

        it('Notification hook POSTs message parsed from stdin', async () => {
          const cmds = adapter.buildHookCommands(3, port)
          const stdinJson = JSON.stringify({ message: 'Claude needs your attention' })
          await runHook(cmds.Notification, stdinJson)
          expect(received).toHaveLength(1)
          expect(received[0].url).toBe('/hook')
          expect(received[0].body).toEqual({
            sessionId: 3,
            event:     'notification',
            message:   'Claude needs your attention',
          })
        })
      })

      describe('buildStatusLineCommand (Phase C1)', () => {
        it('wraps the script path in node "..." (no slash rewrite — macOS paths are already forward-slashed)', () => {
          expect(adapter.buildStatusLineCommand('/tmp/relay.js'))
            .toBe('node "/tmp/relay.js"')
        })

        it('preserves spaces in the path (the surrounding double quotes handle them)', () => {
          expect(adapter.buildStatusLineCommand('/Users/a b/c.js'))
            .toBe('node "/Users/a b/c.js"')
        })
      })

      describe('shouldQuitOnAllWindowsClosed', () => {
        it('returns false (macOS convention: app stays alive when all windows close)', () => {
          expect(adapter.shouldQuitOnAllWindowsClosed()).toBe(false)
        })
      })

      describe('capabilities', () => {
        const caps = adapter.capabilities()

        it('reports platform=darwin', () => {
          expect(caps.platform).toBe('darwin')
        })

        it('reports needsAccessibilityPermission=true (Terminal.app keystroke injection requires it)', () => {
          expect(caps.needsAccessibilityPermission).toBe(true)
        })

        it('hasAccessibilityPermissionInitially is undefined (probe not yet implemented)', () => {
          expect(caps.hasAccessibilityPermissionInitially).toBeUndefined()
        })
      })

      describe('buildShellEnvExports (Phase 3 — env injection for API mode)', () => {
        it('emits no lines for an empty / undefined env', () => {
          expect(buildShellEnvExports(undefined)).toEqual([])
          expect(buildShellEnvExports({})).toEqual([])
        })

        it('emits one `export KEY=...` line per key in POSIX single-quoted form', () => {
          const lines = buildShellEnvExports({
            ANTHROPIC_BASE_URL:   'https://api.deepseek.com/anthropic',
            ANTHROPIC_AUTH_TOKEN: 'sk-test-12345',
          })
          expect(lines).toHaveLength(2)
          expect(lines).toContain(`export ANTHROPIC_BASE_URL='https://api.deepseek.com/anthropic'`)
          expect(lines).toContain(`export ANTHROPIC_AUTH_TOKEN='sk-test-12345'`)
        })

        it("escapes single quotes via the close-escape-reopen idiom (POSIX convention)", () => {
          // A bearer token containing a literal single quote must round-trip
          // through sh's single-quoted string without breaking out: `'` becomes
          // `'\''` (close, escaped, reopen).
          const lines = buildShellEnvExports({ KEY: "weird'value" })
          expect(lines).toEqual([`export KEY='weird'\\''value'`])
        })

        it('does NOT interpret $-prefixed substrings (single quotes suppress expansion)', () => {
          const lines = buildShellEnvExports({ KEY: '$secret' })
          expect(lines).toEqual([`export KEY='$secret'`])
        })
      })

      describe('buildInjectKeystrokesAppleScript (matches Terminal tab by tty — claude OSC 0 clobbers custom title, tty is read-only)', () => {
        it('targets the Terminal tab whose `tty` matches the supplied path', () => {
          const lines = buildInjectKeystrokesAppleScript('/dev/ttys003')
          expect(lines.some(l => l.includes('"/dev/ttys003"'))).toBe(true)
          // It reads `tty of t`, NOT `custom title of t` (which claude
          // can override via OSC 0 escape sequences after launch).
          expect(lines.some(l => l.includes('tty of t'))).toBe(true)
          expect(lines.every(l => !l.includes('custom title of t'))).toBe(true)
        })

        it('returns early when no tab matches (does not paste the clipboard into another window)', () => {
          // Invariant: only CCC-managed sessions can receive CCC-originated keystrokes.
          const lines = buildInjectKeystrokesAppleScript('/dev/ttys999')
          expect(lines.some(l => l.includes('if targetTab is missing value then'))).toBe(true)
          // The Cmd+V keystroke must come AFTER the early-return guard.
          const idxReturnGuard = lines.findIndex(l => l.includes('if targetTab is missing value'))
          const idxPaste       = lines.findIndex(l => l.includes('keystroke "v"'))
          expect(idxReturnGuard).toBeGreaterThan(0)
          expect(idxPaste).toBeGreaterThan(idxReturnGuard)
        })

        it('selects the matched tab + brings its window to z-index 1 + activates Terminal before the paste', () => {
          const lines = buildInjectKeystrokesAppleScript('/dev/ttys003')
          expect(lines.some(l => l.includes('set selected of targetTab to true'))).toBe(true)
          expect(lines.some(l => l.includes('set index of targetWin to 1'))).toBe(true)
          expect(lines.some(l => l.trim() === 'activate')).toBe(true)
        })

        it('uses `set index to 1` (NOT the read-only `set frontmost` that aborts the whole script on Terminal.app)', () => {
          const lines = buildInjectKeystrokesAppleScript('/dev/ttys003')
          expect(lines.every(l => !l.includes('set frontmost of targetWin'))).toBe(true)
        })

        it('sends Cmd+V then Return via System Events', () => {
          const lines = buildInjectKeystrokesAppleScript('/dev/ttys003')
          expect(lines.some(l => l.includes('keystroke "v" using {command down}'))).toBe(true)
          expect(lines.some(l => l.includes('keystroke return'))).toBe(true)
        })

        it('can append delayed numeric picker keys after /model is submitted', () => {
          const lines = buildInjectKeystrokesAppleScript('/dev/ttys003', [
            { key: '3', delaySeconds: 0.35 },
            { key: '4', delaySeconds: 0.15 },
          ])
          const idxReturn = lines.findIndex(l => l.includes('keystroke return'))
          const idxModel  = lines.findIndex(l => l.includes('keystroke "3"'))
          const idxEffort = lines.findIndex(l => l.includes('keystroke "4"'))
          expect(idxModel).toBeGreaterThan(idxReturn)
          expect(idxEffort).toBeGreaterThan(idxModel)
          expect(lines).toContain('  delay 0.35')
          expect(lines).toContain('  delay 0.15')
        })

        it('paste runs after the Terminal tell + frontmost-poll (so window-fronting has actually completed before Cmd+V)', () => {
          const lines = buildInjectKeystrokesAppleScript('/dev/ttys003')
          // Find the END of the Terminal block (its `end tell`) — by
          // looking for the line that follows the activate inside it.
          const idxActivate     = lines.findIndex(l => l.trim() === 'activate')
          const idxKeystrokeV   = lines.findIndex(l => l.includes('keystroke "v"'))
          const idxFrontPoll    = lines.findIndex(l => l.includes('frontmost of application process "Terminal"'))
          // activate happens before the polling, polling before the paste
          expect(idxActivate).toBeGreaterThan(0)
          expect(idxFrontPoll).toBeGreaterThan(idxActivate)
          expect(idxKeystrokeV).toBeGreaterThan(idxFrontPoll)
        })

        it('polls for Terminal frontmost (regression for the "first click after another app does nothing" race)', () => {
          const lines = buildInjectKeystrokesAppleScript('/dev/ttys003')
          // The polling loop signature: a `repeat N times` and a frontmost check inside.
          expect(lines.some(l => l.match(/repeat \d+ times/))).toBe(true)
          expect(lines.some(l => l.includes('frontmost of application process "Terminal"'))).toBe(true)
          expect(lines.some(l => l.includes('exit repeat'))).toBe(true)
        })

        it('logs the actual seen ttys when no match found (so a stuck click can be diagnosed without re-instrumenting)', () => {
          const lines = buildInjectKeystrokesAppleScript('/dev/ttys999')
          expect(lines.some(l => l.includes('NO_MATCH for tty /dev/ttys999'))).toBe(true)
          expect(lines.some(l => l.includes('seenTtys'))).toBe(true)
        })
      })

      describe('buildFocusWindowAppleScript (Request 1 — clicking a SessionRow brings the matching Terminal window to the foreground)', () => {
        it('targets the Terminal tab whose `tty` matches the supplied path', () => {
          const lines = buildFocusWindowAppleScript('/dev/ttys003')
          expect(lines.some(l => l.includes('"/dev/ttys003"'))).toBe(true)
          expect(lines.some(l => l.includes('tty of t'))).toBe(true)
          expect(lines.every(l => !l.includes('custom title of t'))).toBe(true)
        })

        it('uses `set index to 1` to bring the matched window to the top of the z-stack', () => {
          const lines = buildFocusWindowAppleScript('/dev/ttys003')
          expect(lines.some(l => l.includes('set index of targetWin to 1'))).toBe(true)
          expect(lines.every(l => !l.includes('set frontmost of targetWin'))).toBe(true)
        })

        it('selects the matched tab inside its window and activates Terminal', () => {
          const lines = buildFocusWindowAppleScript('/dev/ttys003')
          expect(lines.some(l => l.includes('set selected of targetTab to true'))).toBe(true)
          expect(lines).toContain('  activate')
        })

        it('returns early when no tab matches (does not reorder unrelated Terminal windows)', () => {
          const lines = buildFocusWindowAppleScript('/dev/ttys999')
          expect(lines).toContain('  if targetWin is missing value then return')
        })

        it('wraps the index/selected sets in `try` so a transient quirk on one op does not abort the other', () => {
          const lines = buildFocusWindowAppleScript('/dev/ttys003')
          const tryCount    = lines.filter(l => l.trim() === 'try').length
          const endTryCount = lines.filter(l => l.trim() === 'end try').length
          expect(tryCount).toBeGreaterThanOrEqual(2)
          expect(endTryCount).toBe(tryCount)
        })
      })

      describe('launchCodexSession', () => {
        it('returns a LaunchResult with proc, pidFile, and cleanupPaths', () => {
          // launchCodexSession shells out to osascript / tmp file writes,
          // so we only verify the method exists and has the right shape.
          // Real-behavior verification gates on macOS manual testing per
          // CLAUDE.md Rule 9.
          expect(typeof adapter.launchCodexSession).toBe('function')
          expect(adapter.launchCodexSession).toBeDefined()
        })
      })

      describe('parseMacOSCliProcesses', () => {
        it('classifies external Claude and Codex processes with degraded capabilities', () => {
          const raw = [
            ' 101 1 ttys001 /opt/homebrew/bin/node /opt/homebrew/bin/claude --model sonnet --cwd /Users/me/repo',
            ' 202 1 ttys002 codex --model gpt-5.4 --cd "/Users/me/codex app"',
            ' 303 1 ?? /Applications/CCC.app/Contents/MacOS/CCC',
          ].join('\n')

          const candidates = parseMacOSCliProcesses(raw, [])

          expect(candidates).toHaveLength(2)
          expect(candidates[0]).toMatchObject({
            pid: 101,
            engine: 'claude',
            workspace: '/Users/me/repo',
            modelId: 'sonnet',
            origin: 'external',
            capability: 'best-effort',
            alreadyManaged: false,
          })
          expect(candidates[1]).toMatchObject({
            pid: 202,
            engine: 'codex',
            workspace: '/Users/me/codex app',
            modelId: 'gpt-5.4',
            origin: 'external',
            capability: 'basic',
          })
        })

        it('uses cwd metadata when the command does not expose a workspace flag', () => {
          const raw = ' 404 1 ttys003 /opt/homebrew/lib/node_modules/@openai/codex/bin/codex.js --model gpt-5.4'
          const cwdByPid = new Map([[404, '/Users/me/current-cwd']])

          expect(parseMacOSCliProcesses(raw, [], cwdByPid)[0]).toMatchObject({
            pid: 404,
            engine: 'codex',
            workspace: '/Users/me/current-cwd',
            modelId: 'gpt-5.4',
          })
        })

        it('marks known PIDs as already managed', () => {
          const raw = ' 505 1 ttys004 claude'

          expect(parseMacOSCliProcesses(raw, [505])[0]).toMatchObject({
            pid: 505,
            alreadyManaged: true,
            origin: 'ccc-managed',
            capability: 'full',
          })
        })

        it('marks CCC-created processes from exported env metadata even when the PID cache is gone', () => {
          const raw = [
            ' 551 1 ttys005 node /opt/homebrew/bin/claude CCC_OWNER=Claude-Code-Controller CCC_ENGINE=claude CCC_SESSION_ID=42',
            ' 552 1 ttys006 node /opt/homebrew/bin/codex CCC_OWNER=Claude-Code-Controller CCC_ENGINE=codex CCC_SESSION_ID=43',
          ].join('\n')

          const candidates = parseMacOSCliProcesses(raw, [])

          expect(candidates[0]).toMatchObject({
            pid: 551,
            sessionId: 42,
            terminalTty: '/dev/ttys005',
            engine: 'claude',
            alreadyManaged: true,
            origin: 'ccc-managed',
            capability: 'full',
          })
          expect(candidates[1]).toMatchObject({
            pid: 552,
            sessionId: 43,
            terminalTty: '/dev/ttys006',
            engine: 'codex',
            alreadyManaged: true,
            origin: 'ccc-managed',
            capability: 'basic',
          })
        })

        it('filters to currently open Terminal tab TTYs when provided', () => {
          const raw = [
            ' 601 1 ttys010 claude --model sonnet',
            ' 602 1 ttys011 codex --model gpt-5.4',
            ' 603 1 ?? node /Users/me/Claude-Code-Controller/scripts/codex-helper.js',
            ' 604 1 ttys999 claude --model opus',
          ].join('\n')

          const candidates = parseMacOSCliProcesses(raw, [], new Map(), new Set(['ttys010', 'ttys011']))

          expect(candidates.map(candidate => candidate.pid)).toEqual([601, 602])
        })
      })
    })
  }
}

MacOSAdapterTests.run()
