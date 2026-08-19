import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { ClaudeSettingsManager, stripCccArtifacts } from '../src/main/ClaudeSettingsManager'

const HOOKS = {
  Stop:         "CCC_SID=1 CCC_PORT=100 node -e 'stop' # ccc-hook",
  PreToolUse:   "CCC_SID=1 CCC_PORT=100 node -e 'pre' # ccc-hook",
  Notification: "CCC_SID=1 CCC_PORT=100 node -e 'note' # ccc-hook",
}
const HOOKS_2 = {
  Stop:         "CCC_SID=2 CCC_PORT=200 node -e 'stop' # ccc-hook",
  PreToolUse:   "CCC_SID=2 CCC_PORT=200 node -e 'pre' # ccc-hook",
  Notification: "CCC_SID=2 CCC_PORT=200 node -e 'note' # ccc-hook",
}
const RELAY   = 'node "/Users/x/Library/Application Support/@ccc/app/ccc-statusline.js"'
const RELAY_2 = 'node "/tmp/ccc-statusline-2.js"'

class ClaudeSettingsManagerTests {
  static ws(): string {
    const dir = mkdtempSync(join(tmpdir(), 'ccc-settings-'))
    mkdirSync(join(dir, '.claude'), { recursive: true })
    return dir
  }

  static settingsPath(ws: string): string { return join(ws, '.claude', 'settings.json') }

  static read(ws: string): Record<string, unknown> {
    return JSON.parse(readFileSync(ClaudeSettingsManagerTests.settingsPath(ws), 'utf8')) as Record<string, unknown>
  }

  static run(): void {
    describe('stripCccArtifacts', () => {
      it('hands back unparseable JSON untouched rather than mangling it', () => {
        expect(stripCccArtifacts('{ not json')).toBe('{ not json')
      })

      it('returns the input unchanged when there is nothing of ours in it', () => {
        const raw = JSON.stringify({ model: 'opus', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo hi' }] }] } }, null, 2)
        expect(stripCccArtifacts(raw)).toBe(raw)
      })

      it('returns null for a file that holds nothing but CCC artifacts', () => {
        const raw = JSON.stringify({
          hooks: { Stop: [{ hooks: [{ type: 'command', command: 'node -e x # ccc-hook' }] }] },
          statusLine: { type: 'command', command: RELAY, refreshInterval: 5 },
        })
        expect(stripCccArtifacts(raw)).toBeNull()
      })

      it('strips only CCC entries and keeps the user’s own hooks and keys', () => {
        const raw = JSON.stringify({
          model: 'opus',
          hooks: {
            Stop: [
              { hooks: [{ type: 'command', command: 'node -e x # ccc-hook' }] },
              { hooks: [{ type: 'command', command: 'make lint' }] },
            ],
            SessionStart: [{ hooks: [{ type: 'command', command: 'echo start' }] }],
          },
          statusLine: { type: 'command', command: RELAY },
        })
        const out = JSON.parse(stripCccArtifacts(raw) as string) as Record<string, unknown>
        expect(out['model']).toBe('opus')
        expect(out['statusLine']).toBeUndefined()
        const hooks = out['hooks'] as Record<string, Array<{ hooks: Array<{ command: string }> }>>
        expect(hooks['Stop']).toHaveLength(1)
        expect(hooks['Stop'][0].hooks[0].command).toBe('make lint')
        expect(hooks['SessionStart']).toHaveLength(1)
      })

      it('keeps a user-authored statusLine (only ours carries the relay marker)', () => {
        const raw = JSON.stringify({ statusLine: { type: 'command', command: 'my-prompt.sh' } })
        expect(stripCccArtifacts(raw)).toBe(raw)
      })
    })

    describe('ClaudeSettingsManager', () => {
      let ws: string
      let m: ClaudeSettingsManager
      beforeEach(() => { ws = ClaudeSettingsManagerTests.ws(); m = new ClaudeSettingsManager() })

      it('injects hooks + statusLine, and restore deletes a file it created', () => {
        m.inject(ws, HOOKS, RELAY)
        const written = ClaudeSettingsManagerTests.read(ws)
        expect((written['statusLine'] as { command: string }).command).toBe(RELAY)
        expect(Object.keys(written['hooks'] as object).sort()).toEqual(['Notification', 'PreToolUse', 'Stop'])

        m.restore(ws)
        expect(existsSync(ClaudeSettingsManagerTests.settingsPath(ws))).toBe(false)
      })

      it('round-trips a user’s existing settings byte-for-byte', () => {
        const original = JSON.stringify({ model: 'opus', permissions: { allow: ['Bash(ls:*)'] } }, null, 2)
        writeFileSync(ClaudeSettingsManagerTests.settingsPath(ws), original, 'utf8')

        m.inject(ws, HOOKS, RELAY)
        m.restore(ws)
        expect(readFileSync(ClaudeSettingsManagerTests.settingsPath(ws), 'utf8')).toBe(original)
      })

      // The regression that permanently polluted 13 real workspaces: the second
      // session in a workspace re-snapshotted the ALREADY-INJECTED file as the
      // "pristine original", so restore wrote CCC's own hooks back forever.
      it('two injects then restore gives back the user’s file, not CCC’s', () => {
        const original = JSON.stringify({ model: 'opus' }, null, 2)
        writeFileSync(ClaudeSettingsManagerTests.settingsPath(ws), original, 'utf8')

        m.inject(ws, HOOKS, RELAY)     // session 1
        m.inject(ws, HOOKS_2, RELAY_2) // session 2 in the same workspace
        m.restore(ws)

        const after = readFileSync(ClaudeSettingsManagerTests.settingsPath(ws), 'utf8')
        expect(after).toBe(original)
        expect(after).not.toContain('ccc-hook')
        expect(after).not.toContain('ccc-statusline')
      })

      // A previous run that died without restoring leaves its hooks on disk.
      // The next run must not adopt those as the user's settings.
      it('heals a workspace already polluted by a crashed earlier run', () => {
        writeFileSync(ClaudeSettingsManagerTests.settingsPath(ws), JSON.stringify({
          model: 'opus',
          hooks: { Stop: [{ hooks: [{ type: 'command', command: 'CCC_SID=9 node -e x # ccc-hook' }] }] },
          statusLine: { type: 'command', command: 'node "/tmp/ccc-statusline-9.js"', refreshInterval: 5 },
        }, null, 2), 'utf8')

        m.inject(ws, HOOKS, RELAY)
        m.restore(ws)

        const after = readFileSync(ClaudeSettingsManagerTests.settingsPath(ws), 'utf8')
        expect(after).not.toContain('ccc-hook')
        expect(after).not.toContain('ccc-statusline')
        expect(JSON.parse(after)['model']).toBe('opus')
      })

      it('deletes a settings.json that exists only because a crashed run made it', () => {
        writeFileSync(ClaudeSettingsManagerTests.settingsPath(ws), JSON.stringify({
          hooks: { Stop: [{ hooks: [{ type: 'command', command: 'node -e x # ccc-hook' }] }] },
          statusLine: { type: 'command', command: 'node "/tmp/ccc-statusline-9.js"' },
        }), 'utf8')

        m.inject(ws, HOOKS, RELAY)
        m.restore(ws)
        expect(existsSync(ClaudeSettingsManagerTests.settingsPath(ws))).toBe(false)
      })

      it('re-injecting replaces prior CCC hooks instead of stacking them', () => {
        m.inject(ws, HOOKS, RELAY)
        m.inject(ws, HOOKS_2, RELAY_2)
        const hooks = ClaudeSettingsManagerTests.read(ws)['hooks'] as Record<string, unknown[]>
        expect(hooks['Stop']).toHaveLength(1)
        expect(JSON.stringify(hooks['Stop'])).toContain('CCC_SID=2')
      })

      it('restore is a no-op for a workspace it never injected into', () => {
        const raw = JSON.stringify({ model: 'opus' })
        writeFileSync(ClaudeSettingsManagerTests.settingsPath(ws), raw, 'utf8')
        m.restore(ws)
        expect(readFileSync(ClaudeSettingsManagerTests.settingsPath(ws), 'utf8')).toBe(raw)
      })
    })

    // Regressions found by adversarial review of the first cut of
    // stripCccArtifacts. Each of these previously destroyed user config or
    // silently disabled CCC entirely.
    describe('stripCccArtifacts — hostile and hand-edited input', () => {
      it('does not throw when a hook event value is not an array', () => {
        const raw = JSON.stringify({ model: 'opus', hooks: { SessionEnd: { hooks: [{ type: 'command', command: 'make tidy' }] } } })
        expect(() => stripCccArtifacts(raw)).not.toThrow()
        expect(stripCccArtifacts(raw)).toBe(raw)
      })

      it('does not throw when an entry’s hooks or command have the wrong type', () => {
        for (const shape of [
          { hooks: { Stop: [{ hooks: { type: 'command' } }] } },
          { hooks: { Stop: [{ hooks: [{ type: 'command', command: 42 }] }] } },
          { hooks: { Stop: [null] } },
          { hooks: { Stop: 'nope' } },
          { hooks: [] },
          { statusLine: 'not-an-object' },
        ]) {
          const raw = JSON.stringify(shape)
          expect(() => stripCccArtifacts(raw)).not.toThrow()
          expect(stripCccArtifacts(raw)).toBe(raw)
        }
      })

      // A malformed value on an event CCC does not inject (SessionEnd, etc.)
      // used to throw out of inject(), whose callers all swallow it — the
      // workspace ended up with no hooks and no statusLine at all.
      it('still injects into a workspace whose settings hold a malformed hook event', () => {
        const ws = ClaudeSettingsManagerTests.ws()
        writeFileSync(ClaudeSettingsManagerTests.settingsPath(ws), JSON.stringify({
          model: 'opus',
          hooks: { SessionEnd: { hooks: [{ type: 'command', command: 'make tidy' }] } },
        }), 'utf8')

        new ClaudeSettingsManager().inject(ws, HOOKS, RELAY)

        const after = ClaudeSettingsManagerTests.read(ws)
        expect((after['statusLine'] as { command: string }).command).toBe(RELAY)
        expect(Object.keys(after['hooks'] as object)).toContain('Stop')
      })

      it('injects over a malformed value on an event CCC owns, without throwing', () => {
        const ws = ClaudeSettingsManagerTests.ws()
        writeFileSync(ClaudeSettingsManagerTests.settingsPath(ws), JSON.stringify({
          model: 'opus',
          hooks: { Stop: 'not-a-list', PreToolUse: [null] },
        }), 'utf8')

        expect(() => new ClaudeSettingsManager().inject(ws, HOOKS, RELAY)).not.toThrow()

        const hooks = ClaudeSettingsManagerTests.read(ws)['hooks'] as Record<string, unknown[]>
        expect(hooks['Stop']).toHaveLength(1)
        expect(JSON.stringify(hooks['Stop'])).toContain('ccc-hook')
        // The user's null entry is not ours, so it survives alongside our hook.
        expect(hooks['PreToolUse']).toHaveLength(2)
      })

      it('leaves a user command that merely contains our tag as a substring', () => {
        const raw = JSON.stringify({
          hooks: { Stop: [{ hooks: [{ type: 'command', command: 'node ~/bin/ccc-hooks-audit.js' }] }] },
        })
        expect(stripCccArtifacts(raw)).toBe(raw)
      })

      it('leaves a user status line whose path merely resembles our relay', () => {
        const raw = JSON.stringify({ statusLine: { type: 'command', command: '~/dotfiles/ccc-statusline.sh' } })
        expect(stripCccArtifacts(raw)).toBe(raw)
      })

      it('strips per-session relay paths written by older builds', () => {
        const raw = JSON.stringify({ model: 'opus', statusLine: { type: 'command', command: 'node "/tmp/ccc-statusline-12.js"' } })
        const out = JSON.parse(stripCccArtifacts(raw) as string) as Record<string, unknown>
        expect(out['statusLine']).toBeUndefined()
        expect(out['model']).toBe('opus')
      })

      // An entry can list several commands. Dropping the whole entry because
      // one of them was ours took the user's along with it.
      it('keeps a user command sharing an entry with one of ours', () => {
        const raw = JSON.stringify({
          hooks: { Stop: [{ matcher: '*', hooks: [
            { type: 'command', command: 'node -e x # ccc-hook' },
            { type: 'command', command: 'make lint' },
          ] }] },
        })
        const hooks = (JSON.parse(stripCccArtifacts(raw) as string) as Record<string, unknown>)['hooks'] as
          Record<string, Array<{ matcher?: string; hooks: Array<{ command: string }> }>>
        expect(hooks['Stop']).toHaveLength(1)
        expect(hooks['Stop'][0].matcher).toBe('*')
        expect(hooks['Stop'][0].hooks).toHaveLength(1)
        expect(hooks['Stop'][0].hooks[0].command).toBe('make lint')
      })

      // An empty array the user wrote is their content. Collapsing it made the
      // object look empty, which restore() reads as "delete the file".
      it('preserves the user’s empty hook arrays instead of deleting the file', () => {
        const raw = JSON.stringify({ hooks: {
          SubagentStop: [],
          Stop: [{ hooks: [{ type: 'command', command: 'node -e x # ccc-hook' }] }],
        } })
        const out = stripCccArtifacts(raw)
        expect(out).not.toBeNull()
        const hooks = (JSON.parse(out as string) as Record<string, unknown>)['hooks'] as Record<string, unknown[]>
        expect(hooks['SubagentStop']).toEqual([])
        expect(hooks['Stop']).toBeUndefined()
      })

      it('does not delete a settings.json whose only real content is an empty hook array', () => {
        const ws = ClaudeSettingsManagerTests.ws()
        const original = JSON.stringify({ hooks: { SubagentStop: [] } }, null, 2)
        writeFileSync(ClaudeSettingsManagerTests.settingsPath(ws), original, 'utf8')

        const m = new ClaudeSettingsManager()
        m.inject(ws, HOOKS, RELAY)
        m.restore(ws)

        expect(existsSync(ClaudeSettingsManagerTests.settingsPath(ws))).toBe(true)
        expect(readFileSync(ClaudeSettingsManagerTests.settingsPath(ws), 'utf8')).toBe(original)
      })
    })
  }
}

ClaudeSettingsManagerTests.run()
