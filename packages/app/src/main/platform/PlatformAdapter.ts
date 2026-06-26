import type { ChildProcess } from 'child_process'
import type { PlatformCapabilities } from '../../shared/platform'

export type { PlatformCapabilities }

export interface LaunchInteractiveOptions {
  readonly workspace:            string
  readonly modelId:              string  // empty string => no --model flag
  readonly sessionId:            number
  readonly port:                 number
  readonly statuslineScriptPath: string
  // Full-access mode: launch `claude --dangerously-skip-permissions` so the
  // agent never stops for permission prompts. Off by default. Only set when
  // the user explicitly picks full-access in the new-session engine picker.
  readonly skipPermissions?:     boolean
  // Extra env vars to set inside the spawned `claude` process. Used by
  // API-provider mode to inject ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN
  // so Claude Code talks to DeepSeek instead of Anthropic. Adapters MUST
  // pass these via the inner script (PowerShell `$env:` / sh `export`)
  // rather than `child_process.spawn`'s `env` option, so the visible
  // Terminal / PowerShell window inherits them.
  readonly env?:                 Readonly<Record<string, string>>
  // When set, resume an existing Claude session (`claude --resume <id>`) instead
  // of starting fresh. modelId is ignored — the resumed session restores its own
  // model. The id is a Claude session uuid (the ~/.claude/projects/<enc>/<id>.jsonl
  // filename). Callers MUST validate it against a safe charset (it's interpolated
  // into the launch script).
  readonly resumeSessionId?:     string
}

export interface LaunchHeadlessOptions {
  readonly workspace:            string
  readonly prompt:               string
  readonly sessionId:            number
  readonly port:                 number
  readonly statuslineScriptPath: string
  readonly env?:                 Readonly<Record<string, string>>
}

export interface RespawnMonitorOptions {
  readonly sessionId: number
  readonly innerPid:  number
  readonly pidFile:   string
}

export interface LaunchResult {
  readonly proc:         ChildProcess
  readonly pidFile:      string                    // file holding inner-process PID; '' if not applicable
  readonly cleanupPaths: readonly string[]         // tmp files SessionManager will unlink on close (excludes statuslineScriptPath, which the caller owns)
}

export interface RespawnResult {
  readonly proc:         ChildProcess
  readonly cleanupPaths: readonly string[]
}

export interface KillSessionOptions {
  readonly proc:      ChildProcess
  readonly pidFile:   string
  readonly sessionId: number
}

export interface InjectKeystrokesOptions {
  readonly pidFile:   string
  readonly text:      string
  // Identifies which CCC-managed terminal should receive the keystrokes.
  // WindowsAdapter ignores it (AttachConsole(pid) targets by inner PID
  // via pidFile). MacOSAdapter REQUIRES it: keystrokes are delivered to
  // the Terminal tab whose `custom title` is "CCC <sessionId>" via
  // `do script "<text>" in <tab>`, so they can never land in a non-CCC
  // window the user happens to be focused on.
  readonly sessionId: number
}

export interface InjectCodexModelSelectionOptions {
  readonly pidFile:         string
  readonly sessionId:       number
  readonly modelMenuIndex:  number
  readonly effortMenuIndex: number
}

export interface FocusSessionOptions {
  readonly sessionId: number
  // Required for macOS — the inner claude pid is needed to resolve the
  // tab's tty path via `ps`, which is the stable matching key (claude's
  // OSC 0 escape can clobber the custom title we set at launch). Pass
  // through from SessionManager. WindowsAdapter ignores it.
  readonly pidFile:   string
}

// Codex CLI sessions spawn the `codex` binary instead of `claude`.
// No hooks, no statusLine, no env vars — just process lifecycle.
export interface LaunchCodexSessionOptions {
  readonly workspace: string
  readonly modelId:   string
  readonly sessionId: number
  // Full-access mode: launch `codex --dangerously-bypass-approvals-and-sandbox`
  // (Codex's equivalent of Claude's --dangerously-skip-permissions) so the
  // agent runs without approval gates or sandbox. Off by default.
  readonly skipPermissions?: boolean
}

export interface ResolveSessionTtyOptions {
  readonly pidFile: string
}

export interface RecoverSessionProcessOptions {
  readonly sessionId:   number
  readonly pidFile:     string
  readonly engine:      'claude' | 'codex'
  readonly currentPid?: number
  readonly terminalTty?: string
}

export interface RecoveredSessionProcess {
  readonly pid:         number
  readonly terminalTty?: string
}

// Hook event keys ClaudeSettingsManager.inject() accepts.
export type HookEventName = 'Stop' | 'PreToolUse' | 'Notification'

export interface PlatformAdapter {
  // ── Lifecycle ─────────────────────────────────────────────
  launchInteractive(opts: LaunchInteractiveOptions): LaunchResult
  launchHeadless(opts:    LaunchHeadlessOptions):    LaunchResult
  launchCodexSession(opts: LaunchCodexSessionOptions): LaunchResult
  respawnMonitor(opts:    RespawnMonitorOptions):    RespawnResult
  killSession(opts:       KillSessionOptions):       void

  // ── Probing ───────────────────────────────────────────────
  isPidAlive(pid: number): boolean
  resolveSessionTty(opts: ResolveSessionTtyOptions): string | null
  recoverSessionProcess(opts: RecoverSessionProcessOptions): RecoveredSessionProcess | null

  // ── CLI detection helpers (used by Claude/Codex/MAGI managers) ─
  // Extra PATH directories to prepend when probing for CLIs — GUI apps don't
  // inherit the login-shell PATH. Platform-specific (Homebrew/npm-global on
  // macOS; npm/node dirs on Windows). Callers join with `path.delimiter`.
  cliPathEntries(): readonly string[]
  // Shell command that prints a binary's path if it's on PATH and exits non-zero
  // otherwise — `command -v <bin>` on POSIX, `where <bin>` on Windows.
  whichCommand(binary: string): string

  // ── Console keystroke injection (model switch / reply text) ─
  injectKeystrokes(opts: InjectKeystrokesOptions): void
  injectCodexModelSelection(opts: InjectCodexModelSelectionOptions): void

  // ── Bring a session's terminal window to the foreground ─
  // Called when the user clicks a SessionRow in CCC's expanded panel —
  // the matching Terminal window/tab comes to the front of the user's
  // desktop. macOS uses an AppleScript `set index to 1` + `set selected
  // to true`; Windows is currently a no-op (the user can Alt-Tab).
  focusSession(opts: FocusSessionOptions): void

  // ── Hook + statusLine command bodies ─────────────────────
  buildHookCommands(sessionId: number, port: number): Record<HookEventName, string>
  buildStatusLineCommand(scriptPath: string): string

  // ── Electron quit-on-all-windows-closed convention ───────
  shouldQuitOnAllWindowsClosed(): boolean

  // ── Renderer capability flags ─────────────────────────────
  capabilities(): PlatformCapabilities
}

export class NotImplementedYetError extends Error {
  constructor(adapter: string, method: string) {
    super(`${adapter}.${method}() is not implemented yet — gated on explicit user instruction per CLAUDE.md Rule 9.`)
    this.name = 'NotImplementedYetError'
  }
}
