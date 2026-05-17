import { describe, it, expect } from 'vitest'
import { WindowsAdapter, buildCodexPowerShellScripts, buildPowerShellEnvLines } from '../../src/main/platform/WindowsAdapter'

// Tests cover the pure-data methods only (buildHookCommands, buildStatusLineCommand,
// capabilities, shouldQuitOnAllWindowsClosed). The spawn-using lifecycle methods
// (launchInteractive / launchHeadless / respawnMonitor / killSession / injectKeystrokes)
// are NOT exercised here — invoking them on macOS-latest CI would shell out to a
// non-existent powershell.exe and create stray temp files. Behavior of those is
// gated on Windows manual verification per CLAUDE.md Rule 9.
class WindowsAdapterTests {
  static run(): void {
    describe('WindowsAdapter', () => {
      const adapter = new WindowsAdapter()

      describe('buildHookCommands', () => {
        const cmds = adapter.buildHookCommands(7, 12345)

        it('returns Stop / PreToolUse / Notification keys', () => {
          expect(Object.keys(cmds).sort()).toEqual(['Notification', 'PreToolUse', 'Stop'])
        })

        it('tags every command with # ccc-hook so ClaudeSettingsManager can re-inject idempotently', () => {
          expect(cmds.Stop).toContain('# ccc-hook')
          expect(cmds.PreToolUse).toContain('# ccc-hook')
          expect(cmds.Notification).toContain('# ccc-hook')
        })

        it('embeds the hook URL with the supplied port', () => {
          const url = 'http://127.0.0.1:12345/hook'
          expect(cmds.Stop).toContain(url)
          expect(cmds.PreToolUse).toContain(url)
          expect(cmds.Notification).toContain(url)
        })

        it('embeds the supplied sessionId in the JSON payload', () => {
          expect(cmds.Stop).toContain('sessionId=7')
          expect(cmds.PreToolUse).toContain('sessionId=7')
          expect(cmds.Notification).toContain('sessionId=7')
        })

        it('PreToolUse uses a 60s timeout (long enough for renderer ask/answer round-trip)', () => {
          expect(cmds.PreToolUse).toContain('-TimeoutSec 60')
        })

        it('Stop and Notification use a 3s timeout (fire-and-forget)', () => {
          expect(cmds.Stop).toContain('-TimeoutSec 3')
          expect(cmds.Notification).toContain('-TimeoutSec 3')
        })

        it('each command begins with powershell.exe (PlatformAdapter contract: caller passes the string straight to .claude/settings.json)', () => {
          expect(cmds.Stop.startsWith('powershell.exe')).toBe(true)
          expect(cmds.PreToolUse.startsWith('powershell.exe')).toBe(true)
          expect(cmds.Notification.startsWith('powershell.exe')).toBe(true)
        })
      })

      describe('buildStatusLineCommand', () => {
        it('rewrites back-slashes to forward-slashes (Claude Code parser quirk on Windows)', () => {
          expect(adapter.buildStatusLineCommand('C:\\Users\\a\\b.js'))
            .toBe('node "C:/Users/a/b.js"')
        })

        it('leaves an already-forward-slashed path untouched', () => {
          expect(adapter.buildStatusLineCommand('/tmp/relay.js'))
            .toBe('node "/tmp/relay.js"')
        })
      })

      describe('shouldQuitOnAllWindowsClosed', () => {
        it('returns true (Windows convention: app dies when last window closes)', () => {
          expect(adapter.shouldQuitOnAllWindowsClosed()).toBe(true)
        })
      })

      describe('capabilities', () => {
        const caps = adapter.capabilities()

        it('reports platform=win32', () => {
          expect(caps.platform).toBe('win32')
        })

        it('reports needsAccessibilityPermission=false (Windows has no equivalent gate)', () => {
          expect(caps.needsAccessibilityPermission).toBe(false)
        })
      })

      describe('buildPowerShellEnvLines (Phase 3 — env injection for API mode)', () => {
        it('emits no lines for an empty / undefined env', () => {
          expect(buildPowerShellEnvLines(undefined)).toEqual([])
          expect(buildPowerShellEnvLines({})).toEqual([])
        })

        it('emits one $env: line per key in PowerShell single-quoted form', () => {
          const lines = buildPowerShellEnvLines({
            ANTHROPIC_BASE_URL:   'https://api.deepseek.com/anthropic',
            ANTHROPIC_AUTH_TOKEN: 'sk-test-12345',
          })
          expect(lines).toHaveLength(2)
          expect(lines).toContain(`$env:ANTHROPIC_BASE_URL = 'https://api.deepseek.com/anthropic'`)
          expect(lines).toContain(`$env:ANTHROPIC_AUTH_TOKEN = 'sk-test-12345'`)
        })

        it('escapes single quotes by doubling (PowerShell convention)', () => {
          // A bearer token containing a literal single quote must round-trip
          // through PowerShell's single-quoted string without breaking out.
          const lines = buildPowerShellEnvLines({ KEY: "weird'value" })
          expect(lines).toEqual([`$env:KEY = 'weird''value'`])
        })

        it('does NOT interpret $-prefixed substrings (single quotes suppress expansion)', () => {
          const lines = buildPowerShellEnvLines({ KEY: '$secret' })
          // Single-quoted PowerShell strings are literal — $secret stays $secret.
          expect(lines).toEqual([`$env:KEY = '$secret'`])
        })
      })

      describe('buildCodexPowerShellScripts', () => {
        it('launches codex with the selected model in the workspace', () => {
          const scripts = buildCodexPowerShellScripts({
            workspace: 'C:\\test',
            modelId: 'gpt-5.4',
            inner: 'C:\\tmp\\ccc-codex-inner-1.ps1',
            pidFile: 'C:\\tmp\\ccc-codex-pid-1.txt',
          })
          expect(scripts.inner).toContain(`Set-Location 'C:\\test'`)
          expect(scripts.inner).toContain(`codex --model 'gpt-5.4'`)
          expect(scripts.outer).toContain('Start-Process powershell.exe')
          expect(scripts.outer).toContain(`Set-Content 'C:\\tmp\\ccc-codex-pid-1.txt'`)
        })

        it('escapes single quotes in workspace and model values', () => {
          const scripts = buildCodexPowerShellScripts({
            workspace: "C:\\user's\\repo",
            modelId: "gpt'custom",
            inner: "C:\\tmp\\inner's.ps1",
            pidFile: "C:\\tmp\\pid's.txt",
          })
          expect(scripts.inner).toContain(`Set-Location 'C:\\user''s\\repo'`)
          expect(scripts.inner).toContain(`codex --model 'gpt''custom'`)
          expect(scripts.outer).toContain(`C:\\tmp\\inner''s.ps1`)
          expect(scripts.outer).toContain(`C:\\tmp\\pid''s.txt`)
        })

      })

      describe('injectCodexModelSelection', () => {
        it('exposes the Codex picker navigation hook behind the adapter interface', () => {
          expect(typeof adapter.injectCodexModelSelection).toBe('function')
          expect(adapter.injectCodexModelSelection).toBeDefined()
        })
      })

    })
  }
}

WindowsAdapterTests.run()
