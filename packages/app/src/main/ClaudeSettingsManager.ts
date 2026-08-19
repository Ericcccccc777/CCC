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

// Anchored matchers for CCC's own artifacts. Bare substring matching was too
// loose: a user's own `node ~/bin/ccc-hooks-audit.js` hook, or a status line at
// `~/dotfiles/ccc-statusline.sh`, both matched — and since the strip result
// becomes the restore snapshot, a false positive deletes the user's entry
// permanently (and the whole file, if it was the only key). Our hook bodies
// always END with the `# ccc-hook` shell comment; on Windows that tag sits
// inside the PowerShell `-Command "..."` string, so a trailing quote may
// follow. Our relay command is always `node "<dir>/ccc-statusline.js"`, or
// `ccc-statusline-<id>.js` from builds that wrote one copy per session.
const CCC_HOOK_RE  = /#\s*ccc-hook["']?\s*$/
const CCC_RELAY_RE = /[/\\]ccc-statusline(-\d+)?\.js["']?\s*$/

function isCccHookCommand(cmd: unknown): boolean {
  return typeof cmd === 'string' && CCC_HOOK_RE.test(cmd)
}

function isCccRelayCommand(cmd: unknown): boolean {
  return typeof cmd === 'string' && CCC_RELAY_RE.test(cmd)
}

// One hook entry with our commands removed. Returns the entry unchanged when
// nothing of ours is in it, null when it held nothing but ours, and a copy
// carrying only the user's commands when it held both — an entry can list
// several commands, and dropping the whole entry would take the user's with
// it. Shapes we don't recognise are passed through untouched: this decides
// what gets written back over the user's file, so "leave it alone" always
// beats "guess".
function stripHookEntry(e: HookEntry): HookEntry | null {
  const inner = e.hooks
  if (!Array.isArray(inner)) return e
  const keep = inner.filter(h => !isCccHookCommand(h?.command))
  if (keep.length === inner.length) return e
  return keep.length === 0 ? null : { ...e, hooks: keep }
}

export function stripCccArtifacts(raw: string): string | null {
  let parsed: ClaudeSettings
  try { parsed = JSON.parse(raw) as ClaudeSettings } catch { return raw }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return raw

  let stripped = false
  const out: ClaudeSettings = { ...parsed }

  const hooks = out.hooks
  if (hooks && typeof hooks === 'object' && !Array.isArray(hooks)) {
    const kept: Record<string, HookEntry[]> = {}
    for (const [event, entries] of Object.entries(hooks)) {
      // Not an array — a hand-edited file can hold anything here. Pass it
      // through rather than throwing: an exception escapes into inject(),
      // whose callers all swallow it, leaving the workspace with no hooks
      // and no statusLine at all.
      if (!Array.isArray(entries)) { kept[event] = entries as HookEntry[]; continue }
      const keep: HookEntry[] = []
      for (const e of entries) {
        // A non-object entry is the user's business, and passing it to
        // stripHookEntry would collide with the null it returns to mean
        // "this entry was entirely ours".
        if (!e || typeof e !== 'object') { keep.push(e); continue }
        const s = stripHookEntry(e)
        if (s === null) { stripped = true; continue }
        if (s !== e) stripped = true
        keep.push(s)
      }
      // Drop the event key only when it held nothing but ours. An empty array
      // the user wrote is their content and has to survive.
      if (keep.length > 0 || entries.length === 0) kept[event] = keep
    }
    if (Object.keys(kept).length > 0) out.hooks = kept
    else if (stripped) delete out.hooks
  }

  const sl = out['statusLine'] as { command?: unknown } | undefined
  if (sl && typeof sl === 'object' && !Array.isArray(sl) && isCccRelayCommand(sl.command)) {
    delete out['statusLine']
    stripped = true
  }

  if (!stripped) return raw
  // Nothing left, and we did remove something → the file existed only because
  // CCC created it. Every path that could empty `out` while discarding real
  // user content is guarded above, so this cannot delete a file the user owns.
  return Object.keys(out).length === 0 ? null : JSON.stringify(out, null, 2)
}

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

    // First write wins, and we snapshot the user's settings only — never our
    // own output. Two ways the snapshot got poisoned before: a second inject
    // into the same workspace re-snapshotted the already-injected file, and a
    // run that died without restoring (crash / Force Quit) left its hooks on
    // disk for the next run to adopt as "pristine". Either way restore() then
    // wrote CCC's hooks back permanently. Stripping also heals workspaces
    // polluted by earlier versions.
    if (!this.backups.has(workspace)) {
      this.backups.set(workspace, original === null ? null : stripCccArtifacts(original))
    }

    const merged: ClaudeSettings = { ...existing, hooks: { ...(existing.hooks ?? {}) } }

    for (const [event, command] of Object.entries(hookCommands)) {
      // A hand-edited file can hold anything here. Anything that isn't a list
      // of entries can't be appended to, so it is replaced — but it must not
      // THROW, because every caller swallows inject()'s errors and the
      // workspace would silently end up with no hooks and no statusLine.
      // The pre-injection snapshot keeps the user's value for restore().
      const prior = merged.hooks![event]
      const kept = Array.isArray(prior)
        ? prior.filter(e => !(e && typeof e === 'object'
            && e.hooks?.some?.(h => isCccHookCommand(h?.command))))
        : []
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
