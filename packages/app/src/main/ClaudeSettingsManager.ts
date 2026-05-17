import { existsSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, rmdirSync } from 'fs'
import { join } from 'path'

interface HookCmd {
  type:    string
  command: string
}

interface HookEntry {
  matcher?: string
  hooks:    HookCmd[]
}

interface ClaudeSettings {
  hooks?: Record<string, HookEntry[]>
  [key: string]: unknown
}

const CCC_TAG = 'ccc-hook'

export class ClaudeSettingsManager {
  private backups    = new Map<string, string | null>()
  private madeDir    = new Set<string>()

  inject(workspace: string, hookCommands: Record<string, string>, statusLineCommand?: string): void {
    const claudeDir   = join(workspace, '.claude')
    const settingsPath = join(claudeDir, 'settings.json')

    let existing: ClaudeSettings = {}
    let original:  string | null = null

    if (existsSync(settingsPath)) {
      original = readFileSync(settingsPath, 'utf8')
      try { existing = JSON.parse(original) as ClaudeSettings } catch { existing = {} }
    } else {
      if (!existsSync(claudeDir)) {
        mkdirSync(claudeDir, { recursive: true })
        this.madeDir.add(claudeDir)
      }
    }

    this.backups.set(workspace, original)

    const merged: ClaudeSettings = { ...existing, hooks: { ...(existing.hooks ?? {}) } }

    for (const [event, command] of Object.entries(hookCommands)) {
      const kept = (merged.hooks![event] ?? []).filter(
        e => !e.hooks?.some(h => h.command?.includes(CCC_TAG))
      )
      merged.hooks![event] = [{ hooks: [{ type: 'command', command }] }, ...kept]
    }

    if (statusLineCommand) {
      merged.statusLine = { type: 'command', command: statusLineCommand, refreshInterval: 5 }
    }

    writeFileSync(settingsPath, JSON.stringify(merged, null, 2), 'utf8')
  }

  restore(workspace: string): void {
    const claudeDir   = join(workspace, '.claude')
    const settingsPath = join(claudeDir, 'settings.json')
    const original    = this.backups.get(workspace)
    if (original === undefined) return

    if (original === null) {
      try { unlinkSync(settingsPath) } catch { /* ignore */ }
      if (this.madeDir.has(claudeDir)) {
        try { rmdirSync(claudeDir) } catch { /* not empty — leave it */ }
        this.madeDir.delete(claudeDir)
      }
    } else {
      try { writeFileSync(settingsPath, original, 'utf8') } catch { /* ignore */ }
    }

    this.backups.delete(workspace)
  }
}
