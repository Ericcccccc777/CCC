import { app, BrowserWindow, screen, ipcMain, dialog, powerMonitor, shell, safeStorage } from 'electron'
import { join, basename } from 'path'
import { ChildProcess } from 'child_process'
import { writeFileSync, unlinkSync, readFileSync, renameSync } from 'fs'
import { tmpdir } from 'os'
import { IPC } from '../shared/ipc-channels'
import { HookServer } from './HookServer'
import { CodexSessionWatcher } from './CodexSessionWatcher'
import { ClaudeSettingsManager } from './ClaudeSettingsManager'
import { SessionPersistence, PersistedSession } from './SessionPersistence'
import {
  checkWorkspace, loadConfig, saveConfig, generate as generateHarness,
  type HarnessConfig,
} from './HarnessManager'
import {
  isMagiInstalled,
  checkEnvironment as checkMagiEnvironment,
  installEnv as installMagiEnv,
  installMagi,
  updateMagi,
} from './MagiManager'
import { harnessRead, harnessSummary, listSessions, readTranscriptById, readProjectStats } from './HarnessReader'
import type { MagiEnvId } from '../shared/magi'
import type { PlatformAdapter } from './platform/PlatformAdapter'
import { createPlatformAdapter } from './platform'
import { buildStatusLineRelay } from './platform/shared'
import { ApiProviderManager, VaultUnavailableError, type CryptoVault } from './api/ApiProviderManager'
import { ApiUsageManager } from './api/ApiUsageManager'
import { ApiUsageStore } from './api/ApiUsageStore'
import { DeepSeekClient } from './api/DeepSeekClient'
import { DEEPSEEK_BASE_URL, type ApiProviderConfig, type ApiProviderId } from '../shared/api-provider'
import type { ApiBalanceSnapshot, ApiUsageSnapshot } from '../shared/api-usage'
import type {
  SessionMode,
  SessionOrigin,
  SessionRecoveryCapability,
  SessionRestored,
} from '../shared/session-state'
import { ClaudeCliManager } from './ClaudeCliManager'
import { CodexManager } from './CodexManager'
import { codexReasoningEffortMenuIndex, type CodexReasoningEffort } from '../shared/codex-cli'
import { CLAUDE_REASONING_EFFORTS, type ClaudeReasoningEffort } from '../shared/claude-cli'
import { shouldDeferCloseForRecovery, shouldRespawnClosedWatcher, shouldFinalizeUnexpectedClose } from './session-recovery-policy'

const WIN_WIDTH  = 400
const WIN_HEIGHT = 520
// Files under userData that outlive a single app run. The relay script is
// shared by every session (its body is session-independent); the port file is
// how a terminal that outlived an app restart discovers the new hook-server
// port, since its own CCC_PORT env var was frozen at spawn time. AppWindow
// hands the same port path to HookServer, which writes it on start.
const RELAY_FILE_NAME = 'ccc-statusline.js'
const PORT_FILE_NAME  = 'ccc-port'

const SLEEP_RECOVERY_HOLD_MS = 10 * 60 * 1000
const RESUME_RECOVERY_HOLD_MS = 15 * 1000
const RESUME_RESTORE_DELAYS_MS = [1000, 3000, 7000, 12000] as const

interface SessionEntry {
  proc:             ChildProcess
  workspace:        string
  name:             string
  modelId:          string
  pidFile:          string                  // '' for headless and any session without a recoverable inner PID
  statuslineScript: string
  cleanupPaths:     readonly string[]       // adapter-owned temp files; SessionManager unlinks them on cleanup
  // When in 'api' mode, the session is talking to a third-party
  // Anthropic-compatible endpoint via env-var injection (Chunk C, see
  // CCC_API_PROVIDER_SPEC.md). 'codex' mode spawns the `codex` binary
  // directly instead of `claude`. 'anthropic' is the default Claude Cloud path.
  mode:             SessionMode
  origin:           SessionOrigin
  capability:       SessionRecoveryCapability
  startedAt:        number
  // True when launched in full-access / danger mode
  // (--dangerously-skip-permissions). Registered with HookServer so its
  // PreToolUse hook auto-allows instead of popping a permission request.
  skipPermissions?: boolean
  apiProviderId?:   ApiProviderId
  apiModelId?:      string
  codexModelId?:    string
  innerPid?:         number
  terminalTty?:      string
}

class SessionManager {
  private sessions     = new Map<number, SessionEntry>()
  private nextId       = 1
  private onClosed:    (sessionId: number) => void
  private onApiSwitch: (sessionId: number, info: { providerId: ApiProviderId; modelId: string }) => void
  private port:        number
  private hooks:       HookServer
  private codexWatcher: CodexSessionWatcher
  private settings:    ClaudeSettingsManager
  private adapter:     PlatformAdapter
  private apiProviders: ApiProviderManager
  private registry:    SessionPersistence
  private tmp:         string
  // One statusLine relay script per install, not per session. The relay body
  // is session-independent — a session identifies itself through the
  // CCC_SESSION_ID env var its launch script exports, not through which copy
  // of the file it runs (see buildStatusLineRelay) — so per-session copies
  // bought nothing and cost correctness: <workspace>/.claude/settings.json
  // holds exactly ONE statusLine entry, so every session in a workspace runs
  // whichever copy was injected last, and cleanup() unlinking that copy froze
  // every sibling's context / 5h / weekly readout. Lives in userData rather
  // than tmpdir so the OS reaper can't delete it out from under a live
  // session.
  private relayScript: string
  // Path the HookServer publishes its live port to. Baked into the relay body
  // so a terminal that outlived an app restart can find the new port; its own
  // CCC_PORT env var is frozen at spawn time and unreachable.
  private portFile:    string
  // Sessions currently mid-swap via restartAsApi. The bound close handler
  // for the OLD proc fires when SIGTERM cascades through it, but we don't
  // want that to delete the entry from the map (the renderer would see
  // SESSION_CLOSED and drop the row before we register the new entry).
  // The flag is added at restart start and removed once the new entry +
  // its close binding are in place.
  private swapping:    Set<number> = new Set()
  private userClosing: Set<number> = new Set()
  private deferredRecoveryClosures: Set<number> = new Set()
  private unexpectedCloseRecovery: Set<number> = new Set()
  private recoveryHoldUntil = 0

  constructor(
    onClosed:     (sessionId: number) => void,
    onApiSwitch:  (sessionId: number, info: { providerId: ApiProviderId; modelId: string }) => void,
    port:         number,
    hooks:        HookServer,
    codexWatcher: CodexSessionWatcher,
    adapter:      PlatformAdapter,
    apiProviders: ApiProviderManager,
    registry:     SessionPersistence,
  ) {
    this.onClosed     = onClosed
    this.onApiSwitch  = onApiSwitch
    this.port         = port
    this.hooks        = hooks
    this.codexWatcher = codexWatcher
    this.settings     = new ClaudeSettingsManager()
    this.adapter      = adapter
    this.apiProviders = apiProviders
    this.registry     = registry
    this.tmp          = tmpdir()
    this.relayScript  = join(app.getPath('userData'), RELAY_FILE_NAME)
    this.portFile     = join(app.getPath('userData'), PORT_FILE_NAME)
  }

  // Bind a close handler that no-ops if the session entry has been swapped
  // for a different `proc` (e.g. by restartAsApi). Without this guard, the
  // dying old proc's close event would wipe the brand-new entry from the
  // map and signal "session closed" to the renderer mid-transition.
  private bindClose(entry: SessionEntry, sessionId: number): void {
    const owner = entry.proc
    owner.on('close', () => {
      // Mid-swap: the OLD proc is dying because restartAsApi killed it;
      // skip cleanup so the renderer doesn't see SESSION_CLOSED before
      // the new entry replaces it.
      if (this.swapping.has(sessionId)) return
      const cur = this.sessions.get(sessionId)
      // Post-swap stale close: a different proc owns the slot now.
      if (cur && cur.proc !== owner) return
      const userInitiatedClose = this.userClosing.has(sessionId)
      this.userClosing.delete(sessionId)
      if (!cur) return
      const recovered = this.recoverSessionProcess(sessionId, entry, userInitiatedClose)
      if (recovered) return
      if (!userInitiatedClose && entry.origin === 'ccc-managed' && entry.pidFile.length > 0) {
        this.scheduleUnexpectedCloseRecovery(sessionId, entry)
        return
      }
      if (shouldDeferCloseForRecovery({
        recoveryHoldActive: this.isRecoveryHoldActive(),
        hasPidFile:         entry.pidFile.length > 0,
        userInitiatedClose,
      })) {
        this.sessions.delete(sessionId)
        this.deferredRecoveryClosures.add(sessionId)
        return
      }

      // Drop from the map BEFORE cleanup: cleanup's `workspaceStillActive`
      // check reads this.sessions, so leaving the dying session in it made
      // the check match itself and settings.restore() unreachable on this
      // path. kill() has always ordered it this way.
      this.sessions.delete(sessionId)
      this.cleanup(entry, sessionId)
      this.flushRegistry()
      this.onClosed(sessionId)
    })
  }

  private sessionEngine(entry: SessionEntry): 'claude' | 'codex' {
    return entry.mode === 'codex' ? 'codex' : 'claude'
  }

  private recoverSessionProcess(
    sessionId: number,
    entry: SessionEntry,
    userInitiatedClose: boolean,
    opts: { readonly deferFlush?: boolean } = {},
  ): boolean {
    const currentPid = this.readInnerPid(entry) ?? undefined
    const recovered = this.adapter.recoverSessionProcess({
      sessionId,
      pidFile:      entry.pidFile,
      engine:       this.sessionEngine(entry),
      currentPid,
      terminalTty:  entry.terminalTty,
    })
    if (!shouldRespawnClosedWatcher({
      hasPidFile:         entry.pidFile.length > 0,
      innerPidAlive:      recovered !== null,
      userInitiatedClose,
    }) || !recovered) {
      return false
    }

    // The inner CLI is alive — but is THIS session's watcher still watching it?
    // Nothing here used to ask. listKnownSessions() calls this for every session
    // on every window-focus event, and for a healthy session the gate above
    // passes (pidFile present, inner pid alive, not a user close), so each focus
    // spawned a fresh `sh` watcher and abandoned the previous one. The orphan
    // polls the same inner pid, so nothing ever stops it, and its close handler
    // is inert (bindClose's `cur.proc !== owner` guard). At ~2 OS processes and
    // one /bin/sleep fork per second each, that walks the per-uid process limit
    // until every app on the machine fails to fork.
    const watcherAlive = entry.proc.exitCode === null
      && entry.proc.signalCode === null
      && !entry.proc.killed
    if (watcherAlive) {
      entry.innerPid = recovered.pid
      if (recovered.terminalTty) entry.terminalTty = recovered.terminalTty
      // `true` means "still attached, don't finalize" to both callers
      // (bindClose and the unexpected-close retry).
      return true
    }

    try { writeFileSync(entry.pidFile, String(recovered.pid), 'utf8') } catch { /* respawnMonitor still receives the PID directly */ }
    const result = this.adapter.respawnMonitor({ sessionId, innerPid: recovered.pid, pidFile: entry.pidFile })
    const rebound: SessionEntry = {
      ...entry,
      proc:         result.proc,
      cleanupPaths: [...entry.cleanupPaths, ...result.cleanupPaths],
      innerPid:     recovered.pid,
      ...(recovered.terminalTty && { terminalTty: recovered.terminalTty }),
    }
    this.sessions.set(sessionId, rebound)
    this.bindClose(rebound, sessionId)
    this.unexpectedCloseRecovery.delete(sessionId)
    // Callers sweeping every session (listKnownSessions) flush once at the end:
    // flushRegistry → persist re-probes ALL sessions, so flushing per session
    // made the sweep O(N²) in blocking subprocess probes on the main thread.
    if (!opts.deferFlush) this.flushRegistry()
    return true
  }

  private scheduleUnexpectedCloseRecovery(sessionId: number, entry: SessionEntry): void {
    if (this.unexpectedCloseRecovery.has(sessionId)) return
    this.unexpectedCloseRecovery.add(sessionId)
    this.flushRegistry()
    const delays = [1000, 3000, 7000, 15000, 30000, 60000]
    delays.forEach((delayMs, i) => {
      setTimeout(() => {
        const current = this.sessions.get(sessionId)
        if (!current || current.proc !== entry.proc) return       // already resolved/replaced
        if (this.recoverSessionProcess(sessionId, current, false)) return  // re-attached to a live process
        // Recovery failed. If the inner process is genuinely gone (terminal
        // closed, /quit, crash) and we're not mid sleep/resume hold, finalize
        // the close so the session leaves CCC instead of lingering forever.
        if (shouldFinalizeUnexpectedClose({
          recoveryHoldActive: this.isRecoveryHoldActive(),
          innerProcessAlive:  this.isInnerProcessAlive(current),
          isLastAttempt:      i === delays.length - 1,
        })) {
          this.finalizeUnexpectedClose(sessionId, current)
        }
      }, delayMs)
    })
  }

  private isInnerProcessAlive(entry: SessionEntry): boolean {
    const pid = this.readInnerPid(entry)
    return pid != null && this.adapter.isPidAlive(pid)
  }

  // End a session whose process is gone and could not be recovered: tear down,
  // drop it from the live map + recovery set, persist, and notify the renderer.
  private finalizeUnexpectedClose(sessionId: number, entry: SessionEntry): void {
    this.unexpectedCloseRecovery.delete(sessionId)
    // Delete before cleanup — see the note in bindClose.
    this.sessions.delete(sessionId)
    this.cleanup(entry, sessionId)
    this.flushRegistry()
    this.onClosed(sessionId)
  }

  private flushRegistry(opts: { readonly clearWhenEmptyDuringRecovery?: boolean } = {}): void {
    const sessions = this.persist()   // no probe: routine flush, entries are already fresh
    if (sessions.length === 0) {
      if (this.isRecoveryHoldActive() && !opts.clearWhenEmptyDuringRecovery) return
      this.registry.clear()
      return
    }
    this.registry.save(sessions)
  }

  private isRecoveryHoldActive(): boolean {
    return Date.now() < this.recoveryHoldUntil
  }

  beginRecoveryHold(durationMs: number): void {
    this.recoveryHoldUntil = Math.max(this.recoveryHoldUntil, Date.now() + durationMs)
  }

  endRecoveryHold(): void {
    this.recoveryHoldUntil = 0
    this.flushRegistry()
  }

  private flushRegistrySoon(): void {
    for (const delayMs of [300, 1200, 3000]) {
      setTimeout(() => this.flushRegistry(), delayMs)
    }
  }

  private readInnerPid(entry: SessionEntry): number | null {
    try {
      const innerPid = Number(readFileSync(entry.pidFile, 'utf8').trim())
      if (innerPid && !isNaN(innerPid)) {
        entry.innerPid = innerPid
        return innerPid
      }
      return entry.innerPid ?? null
    } catch {
      return entry.innerPid ?? null
    }
  }

  private readTerminalTty(entry: SessionEntry): string | undefined {
    if (entry.terminalTty) return entry.terminalTty
    if (!entry.pidFile) return undefined
    const tty = this.adapter.resolveSessionTty({ pidFile: entry.pidFile }) ?? undefined
    if (tty) entry.terminalTty = tty
    return tty
  }

  private toRestoredPayload(sessionId: number, entry: SessionEntry): SessionRestored {
    const model = this.hooks.lastKnownModel(sessionId)
    const metrics = this.hooks.lastKnownMetrics(sessionId)
    return {
      sessionId,
      workspace:   entry.workspace,
      name:        entry.name,
      modelId:     entry.modelId,
      // Real statusLine model (e.g. "Opus 4.8") so a rebuilt session shows its
      // true model at once instead of the launch alias / "—". Absent until the
      // session has emitted at least one statusLine.
      ...(model && { model }),
      // Last-known numbers (context %, 5h/7d usage, reset times) so a rebuilt
      // session shows them at once instead of 0 until the next statusLine.
      ...(metrics && { metrics }),
      mode:        entry.mode,
      origin:      entry.origin,
      capability:  entry.capability,
      ...(entry.apiProviderId && { apiProviderId: entry.apiProviderId }),
      ...(entry.apiModelId && { apiModelId: entry.apiModelId }),
      ...(entry.codexModelId && { codexModelId: entry.codexModelId }),
      startedAt:   entry.startedAt,
    }
  }

  // resumeSessionId set → launch `claude --resume <id>` instead of a fresh
  // session (the console's "Resume this session"). modelId is ignored on resume
  // (the session restores its own model).
  launch(workspace: string, modelId: string, skipPermissions = false, resumeSessionId?: string): number {
    const id = this.nextId++
    const p  = this.port

    const statuslineScript = this.writeRelayScript()

    const statuslineCmd = this.adapter.buildStatusLineCommand(statuslineScript)
    const hookCmds      = this.adapter.buildHookCommands(id, p)

    try { this.settings.inject(workspace, hookCmds, statuslineCmd) } catch { /* non-fatal */ }

    const result = this.adapter.launchInteractive({
      workspace, modelId,
      sessionId:            id,
      port:                 p,
      statuslineScriptPath: statuslineScript,
      skipPermissions,
      ...(resumeSessionId ? { resumeSessionId } : {}),
    })

    const entry: SessionEntry = {
      proc:             result.proc,
      workspace,
      name:             basename(workspace),
      modelId,
      pidFile:          result.pidFile,
      statuslineScript,
      cleanupPaths:     result.cleanupPaths,
      mode:             'anthropic',
      origin:           'ccc-managed',
      capability:       'full',
      startedAt:        Date.now(),
      skipPermissions,
    }
    this.sessions.set(id, entry)
    // Danger mode: auto-allow PreToolUse so CCC mirrors the CLI's
    // --dangerously-skip-permissions and stops popping permission requests.
    if (skipPermissions) this.hooks.registerFullAccessSession(id)
    this.bindClose(entry, id)
    this.flushRegistrySoon()

    return id
  }

  // Non-interactive Claude run for harness generation: exits when claude
  // finishes. No console keystroke injection. The adapter writes whatever
  // platform-specific glue it needs and reports paths via cleanupPaths.
  launchHeadless(workspace: string, prompt: string): number {
    const id = this.nextId++
    const p  = this.port

    const statuslineScript = this.writeRelayScript()

    const statuslineCmd = this.adapter.buildStatusLineCommand(statuslineScript)
    const hookCmds      = this.adapter.buildHookCommands(id, p)

    try { this.settings.inject(workspace, hookCmds, statuslineCmd) } catch { /* non-fatal */ }

    const result = this.adapter.launchHeadless({
      workspace, prompt,
      sessionId:            id,
      port:                 p,
      statuslineScriptPath: statuslineScript,
    })

    const entry: SessionEntry = {
      proc:             result.proc,
      workspace,
      name:             basename(workspace),
      modelId:          '',
      pidFile:          result.pidFile,
      statuslineScript,
      cleanupPaths:     result.cleanupPaths,
      mode:             'anthropic',
      origin:           'ccc-managed',
      capability:       'full',
      startedAt:        Date.now(),
    }
    this.sessions.set(id, entry)
    this.bindClose(entry, id)
    this.flushRegistrySoon()

    return id
  }

  kill(sessionId: number): void {
    const entry = this.sessions.get(sessionId)
    if (!entry) return
    this.userClosing.add(sessionId)
    this.sessions.delete(sessionId)
    this.adapter.killSession({ proc: entry.proc, pidFile: entry.pidFile, sessionId })
    this.cleanup(entry, sessionId)
    this.flushRegistry({ clearWhenEmptyDuringRecovery: true })
  }

  killAll(): void {
    for (const [id] of this.sessions) this.kill(id)
  }

  // Collect current session data for persistence before system sleep
  // `probe` re-resolves every session's inner pid + tty through the adapter,
  // which shells out. That is worth it before a sleep snapshot, where the
  // registry is the only record that survives; it is NOT worth it on a routine
  // registry flush, which happens on every session close, launch and focus
  // sweep and already runs right after the caller refreshed the entry. Probing
  // there made every flush O(N) subprocess spawns on the main thread.
  persist(opts: { readonly probe?: boolean } = {}): PersistedSession[] {
    const result: PersistedSession[] = []
    for (const [id, entry] of this.sessions) {
      if (opts.probe) {
        const recovered = this.adapter.recoverSessionProcess({
          sessionId:   id,
          pidFile:     entry.pidFile,
          engine:      this.sessionEngine(entry),
          currentPid:  this.readInnerPid(entry) ?? undefined,
          terminalTty: this.readTerminalTty(entry),
        })
        if (recovered) {
          entry.innerPid = recovered.pid
          if (recovered.terminalTty) entry.terminalTty = recovered.terminalTty
        }
      }
      const innerPid = entry.innerPid
      if (!innerPid) continue
      const model = this.hooks.lastKnownModel(id)
      const metrics = this.hooks.lastKnownMetrics(id)
      result.push({
        id, workspace: entry.workspace, name: entry.name, modelId: entry.modelId,
        // Carry the real statusLine model across an app restart so the restored
        // session doesn't fall back to "—" while waiting for a fresh statusLine.
        ...(model && { model }),
        // Carry the last-known numbers across an app restart so the restored
        // session shows them instead of 0 while waiting for a fresh statusLine.
        // This is a point-in-time snapshot (taken at suspend / registry flush,
        // not on every statusLine — statusLine fires too often to persist each
        // time), so a hard crash between flushes may restore slightly stale
        // numbers; the next live statusLine corrects them. Same snapshot
        // semantics as `model` above.
        ...(metrics && { metrics }),
        innerPid, pidFile: entry.pidFile, statuslineScript: entry.statuslineScript,
        mode: entry.mode, origin: entry.origin, capability: entry.capability,
        ...(entry.apiProviderId && { apiProviderId: entry.apiProviderId }),
        ...(entry.apiModelId && { apiModelId: entry.apiModelId }),
        ...(entry.codexModelId && { codexModelId: entry.codexModelId }),
        startedAt: entry.startedAt,
        ...(entry.terminalTty && { terminalTty: entry.terminalTty }),
        ...(entry.skipPermissions && { skipPermissions: entry.skipPermissions }),
      })
    }
    return result
  }

  // Re-attach sessions whose inner CLI is still alive after system sleep/resume
  tryRestore(sessions: PersistedSession[], win: BrowserWindow): void {
    for (const s of sessions) {
      if (this.sessions.has(s.id)) {
        this.deferredRecoveryClosures.delete(s.id)
        continue
      }
      const recovered = this.adapter.recoverSessionProcess({
        sessionId:   s.id,
        pidFile:     s.pidFile,
        engine:      (s.mode ?? 'anthropic') === 'codex' ? 'codex' : 'claude',
        currentPid:  s.innerPid,
        terminalTty: s.terminalTty,
      })
      if (!recovered) {
        if (this.deferredRecoveryClosures.delete(s.id)) this.onClosed(s.id)
        continue
      }
      s.innerPid = recovered.pid
      if (recovered.terminalTty) s.terminalTty = recovered.terminalTty

      // Ensure nextId stays above any re-used ID
      if (s.id >= this.nextId) this.nextId = s.id + 1

      const mode = s.mode ?? 'anthropic'
      const origin = s.origin ?? 'ccc-managed'
      const capability = s.capability ?? (mode === 'codex' ? 'basic' : 'full')

      // Re-write the shared statusline relay (hooks are inline — no hook script
      // files needed). A session persisted by an older build carries a
      // per-session tmp path here; re-injecting from the shared path re-points
      // that workspace's settings.json at a file that still exists, which is
      // what heals a workspace whose relay was unlinked out from under it.
      let relayPath = s.statuslineScript
      if (mode !== 'codex' && origin === 'ccc-managed' && capability === 'full' && s.statuslineScript) {
        try { relayPath = this.writeRelayScript() } catch { continue }

        const statuslineCmd = this.adapter.buildStatusLineCommand(relayPath)
        const hookCmds      = this.adapter.buildHookCommands(s.id, this.port)
        try { this.settings.inject(s.workspace, hookCmds, statuslineCmd) } catch { /* non-fatal */ }
      }

      // Restore pidFile so injectKeystrokes can reach the terminal
      try { writeFileSync(s.pidFile, String(s.innerPid), 'utf8') } catch { continue }

      const result = this.adapter.respawnMonitor({
        sessionId: s.id, innerPid: s.innerPid, pidFile: s.pidFile,
      })

      const entry: SessionEntry = {
        proc:             result.proc,
        workspace:        s.workspace,
        name:             s.name,
        modelId:          s.modelId,
        pidFile:          s.pidFile,
        statuslineScript: relayPath,
        cleanupPaths:     result.cleanupPaths,
        mode,
        origin,
        capability,
        startedAt:        s.startedAt ?? Date.now(),
        innerPid:         s.innerPid,
        ...(s.terminalTty && { terminalTty: s.terminalTty }),
        ...(s.apiProviderId && { apiProviderId: s.apiProviderId as ApiProviderId }),
        ...(s.apiModelId && { apiModelId: s.apiModelId }),
        ...(s.codexModelId && { codexModelId: s.codexModelId }),
        ...(s.skipPermissions && { skipPermissions: s.skipPermissions }),
      }
      this.sessions.set(s.id, entry)
      // Re-seed the model + metrics caches from the persisted session so the
      // restore payload below carries the real model and numbers on a cold app
      // start (the caches are empty until the session next emits a statusLine).
      if (s.model) this.hooks.seedModel(s.id, s.model)
      if (s.metrics) this.hooks.seedMetrics(s.id, s.metrics)
      // Re-register danger-mode sessions so the re-injected PreToolUse hook
      // keeps auto-allowing instead of popping permission requests.
      if (s.skipPermissions) this.hooks.registerFullAccessSession(s.id)
      this.bindClose(entry, s.id)
      this.deferredRecoveryClosures.delete(s.id)

      if (mode === 'api' && s.apiProviderId && s.apiModelId) {
        this.onApiSwitch(s.id, { providerId: s.apiProviderId as ApiProviderId, modelId: s.apiModelId })
      }

      win.webContents.send(IPC.SESSION_RESTORED, this.toRestoredPayload(s.id, entry))
    }
    this.flushRegistry()
  }

  // Called on every window-focus / visibility transition from the renderer, so
  // it has to be cheap: one flush at the end instead of one per session.
  listKnownSessions(): readonly SessionRestored[] {
    let changed = false
    for (const [sessionId, entry] of this.sessions) {
      if (entry.origin === 'ccc-managed' && entry.pidFile.length > 0) {
        if (this.recoverSessionProcess(sessionId, entry, false, { deferFlush: true })) changed = true
      }
    }
    if (changed) this.flushRegistry()
    return [...this.sessions.entries()].map(([sessionId, entry]) => this.toRestoredPayload(sessionId, entry))
  }

  // Payload for a single session, so a session created outside the main window
  // (e.g. "Resume this session" fired from the console window) can be pushed to
  // the island via SESSION_RESTORED.
  restoredPayloadFor(sessionId: number): SessionRestored | null {
    const entry = this.sessions.get(sessionId)
    return entry ? this.toRestoredPayload(sessionId, entry) : null
  }

  // Switch model: uses the short alias (e.g. 'sonnet') so Claude Code
  // selects its built-in model instead of creating a custom one.
  switchModel(sessionId: number, alias: string): void {
    this.injectToConsole(sessionId, `/model ${alias}`)
  }

  // Switch reasoning effort by injecting `/effort <level>`. Claude Code accepts
  // the level as an inline argument (verified against the effort docs), so this
  // is the same one-shot console-injection path as switchModel — no menu
  // navigation needed (unlike Codex). Guard against codex sessions: their TUI
  // has no `/effort` command (effort is chosen inside Codex's /model picker).
  switchEffort(sessionId: number, effort: ClaudeReasoningEffort): void {
    if (!CLAUDE_REASONING_EFFORTS.includes(effort)) return
    const entry = this.sessions.get(sessionId)
    if (!entry || entry.mode === 'codex') return
    this.injectToConsole(sessionId, `/effort ${effort}`)
  }

  injectConsoleText(sessionId: number, text: string): void {
    this.injectToConsole(sessionId, text)
  }

  switchCodexModel(sessionId: number, modelMenuIndex: number, effort: CodexReasoningEffort): void {
    const entry = this.sessions.get(sessionId)
    if (!entry || entry.mode !== 'codex') return
    if (!Number.isInteger(modelMenuIndex) || modelMenuIndex < 1 || modelMenuIndex > 9) return
    this.adapter.injectCodexModelSelection({
      pidFile:         entry.pidFile,
      sessionId,
      modelMenuIndex,
      effortMenuIndex: codexReasoningEffortMenuIndex(effort),
    })
  }

  // Bring this session's terminal window to the foreground on the user's
  // desktop. Called when the user clicks a SessionRow in CCC's expanded
  // panel. No-op for unknown sessionId so the renderer can call it
  // unconditionally without first verifying the session is still alive.
  focusSession(sessionId: number): void {
    const entry = this.sessions.get(sessionId)
    if (!entry) return
    this.adapter.focusSession({ sessionId, pidFile: entry.pidFile })
  }

  // Spawn a brand-new session in API mode without disturbing any existing
  // one. Used when the user picks "Open a new session" in the ApiSwitchPopup.
  // Returns the new sessionId so the renderer can register a SessionRow.
  launchAsApi(
    workspace:  string,
    providerId: ApiProviderId,
    modelId:    string,
  ): { ok: true; sessionId: number } | { ok: false; error: string } {
    const key = this.apiProviders.readKey(providerId)
    if (!key) return { ok: false, error: 'provider-key-unavailable' }

    const id = this.nextId++
    const p  = this.port

    const statuslineScript = this.writeRelayScript()

    const statuslineCmd = this.adapter.buildStatusLineCommand(statuslineScript)
    const hookCmds      = this.adapter.buildHookCommands(id, p)
    try { this.settings.inject(workspace, hookCmds, statuslineCmd) } catch { /* non-fatal */ }

    const env = {
      ANTHROPIC_BASE_URL:   DEEPSEEK_BASE_URL,
      ANTHROPIC_AUTH_TOKEN: key,
    }

    const result = this.adapter.launchInteractive({
      workspace, modelId,
      sessionId:            id,
      port:                 p,
      statuslineScriptPath: statuslineScript,
      env,
    })

    const entry: SessionEntry = {
      proc:             result.proc,
      workspace,
      name:             basename(workspace),
      modelId,
      pidFile:          result.pidFile,
      statuslineScript,
      cleanupPaths:     result.cleanupPaths,
      mode:             'api',
      origin:           'ccc-managed',
      capability:       'full',
      startedAt:        Date.now(),
      apiProviderId:    providerId,
      apiModelId:       modelId,
    }
    this.sessions.set(id, entry)
    this.bindClose(entry, id)
    this.flushRegistrySoon()

    return { ok: true, sessionId: id }
  }

  // Spawn a standalone Codex CLI session (`codex` binary) in the given
  // workspace. No hooks, no statusLine, no env vars — just process lifecycle.
  launchCodex(
    workspace: string,
    modelId:   string,
    skipPermissions = false,
  ): { ok: true; sessionId: number } | { ok: false; error: string } {
    const id = this.nextId++

    const result = this.adapter.launchCodexSession({
      workspace,
      modelId,
      sessionId: id,
      skipPermissions,
    })

    const entry: SessionEntry = {
      proc:             result.proc,
      workspace,
      name:             basename(workspace),
      modelId,
      pidFile:          result.pidFile,
      statuslineScript: '',
      cleanupPaths:     result.cleanupPaths,
      mode:             'codex',
      origin:           'ccc-managed',
      capability:       'basic',
      startedAt:        Date.now(),
      codexModelId:     modelId,
    }
    this.sessions.set(id, entry)
    this.bindClose(entry, id)
    this.codexWatcher.start(id, workspace)
    this.flushRegistrySoon()

    return { ok: true, sessionId: id }
  }

  // Kills the existing claude process and re-spawns it in the same slot
  // (same sessionId, same workspace) but with API-mode env vars so it
  // talks to a third-party Anthropic-compatible endpoint instead of
  // Anthropic Cloud. Conversation history is NOT preserved — new
  // process, new transcript. The renderer is responsible for telling
  // the user that before triggering this.
  async restartAsApi(
    sessionId:  number,
    providerId: ApiProviderId,
    modelId:    string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const entry = this.sessions.get(sessionId)
    if (!entry) return { ok: false, error: 'session-not-found' }

    const key = this.apiProviders.readKey(providerId)
    if (!key) return { ok: false, error: 'provider-key-unavailable' }

    // Mark the swap window now so the OLD watcher's `close` event (which
    // will fire as soon as SIGTERM cascades through claude) does NOT
    // remove the session entry from the map — see bindClose.
    this.swapping.add(sessionId)
    try {

    // Two-phase teardown so the user doesn't end up with both the old and
    // new Terminal windows on macOS. The standard killSession on macOS
    // SIGTERMs claude AND fires `tell Terminal to close window` at the
    // same instant — if Terminal sees claude still alive when the close
    // arrives, it raises an "active processes" prompt and the old window
    // stays open while we spawn the new one. Phase 1 here SIGTERMs claude
    // and waits for it to actually exit; phase 2 then runs the standard
    // killSession (AppleScript close runs cleanly because the process is
    // gone) and waits for Terminal to actually drop the window.
    let innerPid = 0
    try { innerPid = parseInt(readFileSync(entry.pidFile, 'utf8').trim(), 10) }
    catch { /* pidfile already removed; nothing to wait on */ }

    if (innerPid && !isNaN(innerPid)) {
      try { process.kill(innerPid, 'SIGTERM') } catch { /* already gone */ }
      const deadline = Date.now() + 2000
      while (Date.now() < deadline) {
        if (!this.adapter.isPidAlive(innerPid)) break
        await new Promise(r => setTimeout(r, 100))
      }
      // Belt-and-suspenders for a hung claude that ignores SIGTERM.
      if (this.adapter.isPidAlive(innerPid)) {
        try { process.kill(innerPid, 'SIGKILL') } catch { /* race */ }
        await new Promise(r => setTimeout(r, 200))
      }
    }

    // Phase 2: standard kill path (cleans up watcher proc, runs the
    // AppleScript close-by-title). With claude already dead, the close
    // can't trigger Terminal's active-processes prompt.
    this.adapter.killSession({ proc: entry.proc, pidFile: entry.pidFile, sessionId })

    // Give Terminal time to actually drop the window before we spawn the
    // replacement. Without this, the new window appears while the old is
    // still on its way out and the user briefly sees two CCC windows.
    await new Promise(resolve => setTimeout(resolve, 800))

    // The old entry's adapter-owned temp files are re-created with the same
    // paths below, so unlink them first. The shared relay is deliberately not
    // in this list. Also stop the old transcript watcher so it doesn't keep
    // running against a stale session record.
    this.hooks.stopTranscript(sessionId)
    for (const f of entry.cleanupPaths) {
      if (!f) continue
      try { unlinkSync(f) } catch { /* ignore */ }
    }

    // Re-create statusline + hooks for the same sessionId.
    const statuslineScript = this.writeRelayScript()
    const statuslineCmd = this.adapter.buildStatusLineCommand(statuslineScript)
    const hookCmds      = this.adapter.buildHookCommands(sessionId, this.port)
    try { this.settings.inject(entry.workspace, hookCmds, statuslineCmd) } catch { /* non-fatal */ }

    const env = {
      ANTHROPIC_BASE_URL:   DEEPSEEK_BASE_URL,
      ANTHROPIC_AUTH_TOKEN: key,
    }

    const result = this.adapter.launchInteractive({
      workspace:            entry.workspace,
      modelId,
      sessionId,
      port:                 this.port,
      statuslineScriptPath: statuslineScript,
      env,
    })

    const newEntry: SessionEntry = {
      proc:             result.proc,
      workspace:        entry.workspace,
      name:             entry.name,
      modelId,
      pidFile:          result.pidFile,
      statuslineScript,
      cleanupPaths:     result.cleanupPaths,
      mode:             'api',
      origin:           'ccc-managed',
      capability:       'full',
      startedAt:        Date.now(),
      apiProviderId:    providerId,
      apiModelId:       modelId,
    }
    this.sessions.set(sessionId, newEntry)
    this.bindClose(newEntry, sessionId)
    this.flushRegistrySoon()

    this.onApiSwitch(sessionId, { providerId, modelId })
    return { ok: true }

    } finally {
      // Always release the swap flag — even on a thrown error we don't
      // want the slot stuck in "ignoring close events" forever.
      this.swapping.delete(sessionId)
    }
  }

  private injectToConsole(sessionId: number, text: string): void {
    const entry = this.sessions.get(sessionId)
    if (!entry) return
    this.adapter.injectKeystrokes({ pidFile: entry.pidFile, text, sessionId })
  }

  // (Re)write the shared relay and hand back its path. Rewritten on every use
  // so an upgraded relay body takes effect without the user reinstalling.
  // Throws on an unwritable userData — callers keep whatever failure handling
  // they had when this was a per-session writeFileSync.
  private writeRelayScript(): string {
    // Atomic: every session writes this same path, and Claude Code may be
    // exec'ing it at that instant on behalf of a session already running.
    // A plain writeFileSync truncates first, so a concurrent read could see
    // a half-written file and lose a tick. Same tmp+rename pattern as
    // ApiUsageStore.
    const tmp = `${this.relayScript}.tmp`
    writeFileSync(tmp, buildStatusLineRelay(this.portFile), 'utf8')
    renameSync(tmp, this.relayScript)
    return this.relayScript
  }

  private cleanup(entry: SessionEntry, sessionId: number): void {
    this.hooks.stopTranscript(sessionId)
    this.hooks.unregisterFullAccessSession(sessionId)
    this.codexWatcher.stop(sessionId)
    // Skip restore if another session is still using this workspace —
    // prevents the late child.on('close') from wiping out a newer session's hooks.
    const workspaceStillActive = [...this.sessions.values()]
      .some(s => s.workspace === entry.workspace)
    if (entry.origin === 'ccc-managed' && entry.mode !== 'codex' && entry.workspace && !workspaceStillActive) {
      try { this.settings.restore(entry.workspace) } catch { /* ignore */ }
    }
    // NOT entry.statuslineScript — the relay is shared by every session on
    // this install, and a workspace's settings.json goes on naming it after
    // this session is gone. Deleting it here is what froze the siblings.
    for (const f of entry.cleanupPaths) {
      if (!f) continue
      try { unlinkSync(f) } catch { /* ignore */ }
    }
  }
}

// Electron-backed CryptoVault for ApiProviderManager. The renderer cannot
// reach safeStorage directly (it lives on the main process); IpcHandlers
// owns this wrapper so unit tests can pass a fake without booting Electron.
class ElectronCryptoVault implements CryptoVault {
  isAvailable(): boolean { return safeStorage.isEncryptionAvailable() }
  encrypt(plaintext: string): Buffer { return safeStorage.encryptString(plaintext) }
  decrypt(buffer: Buffer): string { return safeStorage.decryptString(buffer) }
}

class IpcHandlers {
  public  manager: SessionManager | null = null
  private hooks:   HookServer
  private adapter: PlatformAdapter
  private apiProviders: ApiProviderManager
  private apiUsage: ApiUsageManager | null = null
  private claudeCliManager: ClaudeCliManager
  private codexManager: CodexManager
  private codexWatcher: CodexSessionWatcher
  private registry: SessionPersistence

  constructor(hooks: HookServer, adapter: PlatformAdapter, registry: SessionPersistence) {
    this.hooks        = hooks
    this.adapter      = adapter
    this.registry     = registry
    this.apiProviders = new ApiProviderManager(app.getPath('userData'), new ElectronCryptoVault())
    this.claudeCliManager = new ClaudeCliManager()
    this.codexManager = new CodexManager()
    this.codexWatcher = new CodexSessionWatcher()
  }

  // Pre-sleep snapshot: the registry is the only thing that survives, so pay
  // for a fresh probe here even though routine flushes skip it.
  persistSessions(): PersistedSession[] {
    return this.manager?.persist({ probe: true }) ?? []
  }

  tryRestore(sessions: PersistedSession[], win: BrowserWindow): void {
    this.manager?.tryRestore(sessions, win)
  }

  listKnownSessions(): readonly SessionRestored[] {
    return this.manager?.listKnownSessions() ?? []
  }

  beginRecoveryHold(durationMs: number): void {
    this.manager?.beginRecoveryHold(durationMs)
  }

  endRecoveryHold(): void {
    this.manager?.endRecoveryHold()
  }

  register(win: BrowserWindow): void {
    // ApiUsageManager owns balance polling + per-session token accumulation
    // for API-mode sessions. Constructed here so it has the user-data
    // directory + the in-flight BrowserWindow for IPC broadcasts. Sink set
    // on HookServer below so transcript lines reach the accumulator.
    this.apiUsage = new ApiUsageManager({
      store:       new ApiUsageStore(app.getPath('userData')),
      keys:        this.apiProviders,
      client:      new DeepSeekClient(),
      broadcaster: {
        sendUsage:   (s: ApiUsageSnapshot)   => { win.webContents.send(IPC.API_USAGE_UPDATE,   s) },
        sendBalance: (s: ApiBalanceSnapshot) => { win.webContents.send(IPC.API_BALANCE_UPDATE, s) },
      },
    })
    this.hooks.setTranscriptSink((sessionId, parsed) => {
      this.apiUsage?.onTranscriptLine(sessionId, parsed)
    })

    this.manager = new SessionManager(
      (sessionId) => {
        if (this.hooks.isHarnessSession(sessionId)) {
          // Harness session closed → notify renderer that generation is complete
          this.hooks.unregisterHarnessSession(sessionId)
          win.webContents.send(IPC.HARNESS_COMPLETE, { sessionId })
        }
        // Drop API-mode tracking last so any final transcript-line broadcasts
        // race-free behind the renderer's SESSION_CLOSED handling.
        this.apiUsage?.unregisterSession(sessionId)
        win.webContents.send(IPC.SESSION_CLOSED, sessionId)
      },
      (sessionId, info) => {
        // restartAsApi: the Anthropic-mode session was registered (no-op
        // before this call) and the new API-mode session takes its slot.
        // registerSession is idempotent — safe to call even if for some
        // reason already registered.
        this.apiUsage?.registerSession(sessionId, info.providerId, info.modelId)
        win.webContents.send(IPC.API_SESSION_SWITCHED, {
          sessionId,
          providerId: info.providerId,
          modelId:    info.modelId,
        })
      },
      this.hooks.serverPort,
      this.hooks,
      this.codexWatcher,
      this.adapter,
      this.apiProviders,
      this.registry,
    )
    this.hooks.attachWindow(win)
    this.codexWatcher.attachWindow(win)

    ipcMain.on(IPC.SET_IGNORE_MOUSE, (_e, ignore: boolean) => {
      win.setIgnoreMouseEvents(ignore, { forward: true })
    })

    ipcMain.handle(IPC.OPEN_FOLDER_DIALOG, async () => {
      const r = await dialog.showOpenDialog(win, {
        title: 'Select Workspace', properties: ['openDirectory'],
      })
      return r.canceled ? null : r.filePaths[0] ?? null
    })

    ipcMain.handle(IPC.LAUNCH_SESSION, (_e, workspace: string, modelId: string, skipPermissions = false) => {
      const sessionId = this.manager!.launch(workspace, modelId, skipPermissions)
      return { sessionId }
    })

    ipcMain.on(IPC.KILL_SESSION, (_e, sessionId: number) => {
      this.manager?.kill(sessionId)
    })

    ipcMain.on(IPC.SWITCH_SESSION_EFFORT, (_e, sessionId: number, effort: ClaudeReasoningEffort) => {
      this.manager?.switchEffort(sessionId, effort)
    })

    ipcMain.on(IPC.SWITCH_SESSION_MODEL, (_e, sessionId: number, alias: string) => {
      this.manager?.switchModel(sessionId, alias)
    })

    ipcMain.on(IPC.INJECT_CONSOLE_TEXT, (_e, sessionId: number, text: string) => {
      this.manager?.injectConsoleText(sessionId, text)
    })

    ipcMain.on(IPC.CODEX_CLI_SELECT_MODEL, (_e, sessionId: number, modelMenuIndex: number, effort: CodexReasoningEffort) => {
      this.manager?.switchCodexModel(sessionId, modelMenuIndex, effort)
    })

    ipcMain.on(IPC.SESSION_FOCUS, (_e, sessionId: number) => {
      this.manager?.focusSession(sessionId)
    })

    ipcMain.handle(IPC.SESSION_LIST_KNOWN, () => {
      return this.listKnownSessions()
    })

    // Renderer requests a taller pill window (e.g. when the remote-control
    // popup is open and would otherwise clip below the bottom of WIN_HEIGHT).
    // Pass null to restore the default WIN_HEIGHT.
    ipcMain.on(IPC.MAIN_SET_HEIGHT, (_e, height: number | null) => {
      const sh = screen.getPrimaryDisplay().workAreaSize.height
      const target = height === null
        ? WIN_HEIGHT
        : Math.max(WIN_HEIGHT, Math.min(height, sh - 20))
      const [w] = win.getSize()
      win.setSize(w, target)
    })

    // Overlay-mode bounds: bypasses MAIN_SET_HEIGHT's 520 min-clamp so the
    // strip / circle / drag-mode fullscreen all work. Sanity-clamps to the
    // primary display so a renderer bug can't push the window off-screen.
    ipcMain.on(IPC.OVERLAY_SET_BOUNDS, (
      _e,
      bounds: { x: number; y: number; width: number; height: number },
      opts?: { animate?: boolean },
    ) => {
      const wa = screen.getPrimaryDisplay().workArea
      const width  = Math.max(4, Math.min(Math.floor(bounds.width),  wa.width))
      const height = Math.max(4, Math.min(Math.floor(bounds.height), wa.height))
      const x = Math.max(wa.x, Math.min(Math.floor(bounds.x), wa.x + wa.width  - width))
      const y = Math.max(wa.y, Math.min(Math.floor(bounds.y), wa.y + wa.height - height))
      win.setBounds({ x, y, width, height }, opts?.animate === true)
    })

    ipcMain.handle(IPC.OVERLAY_GET_WORK_AREA, () => {
      return screen.getPrimaryDisplay().workArea
    })

    // ── Harness IPC ──
    ipcMain.handle(IPC.HARNESS_CHECK, (_e, workspace: string) => {
      return checkWorkspace(workspace)
    })

    ipcMain.handle(IPC.HARNESS_LOAD, (_e, workspace: string) => {
      return loadConfig(workspace)
    })

    ipcMain.handle(IPC.HARNESS_SAVE, (_e, workspace: string, config: HarnessConfig) => {
      saveConfig(workspace, config)
    })

    // V2.1: synchronous template render + write. No spawn, no Q&A.
    ipcMain.handle(IPC.HARNESS_GENERATE, (_e, workspace: string, config: HarnessConfig) => {
      return generateHarness(workspace, config)
    })

    // ── CCC-MAGI install flow ──
    ipcMain.handle(IPC.MAGI_CHECK_INSTALLED, (_e, workspace: string) => {
      return { installed: isMagiInstalled(workspace) }
    })

    ipcMain.handle(IPC.MAGI_CHECK_ENV, () => {
      return checkMagiEnvironment()
    })

    ipcMain.handle(IPC.MAGI_INSTALL_ENV, (e, id: MagiEnvId) => {
      return installMagiEnv(id, line =>
        e.sender.send(IPC.MAGI_PROGRESS, { kind: 'env', id, line }))
    })

    ipcMain.handle(IPC.MAGI_INSTALL, (e, workspace: string) => {
      return installMagi(workspace, line =>
        e.sender.send(IPC.MAGI_PROGRESS, { kind: 'magi', line }))
    })

    ipcMain.handle(IPC.MAGI_UPDATE, (e, workspace: string, force?: boolean) => {
      return updateMagi(workspace, line =>
        e.sender.send(IPC.MAGI_PROGRESS, { kind: 'magi', line }), { force: force === true })
    })

    // Window resize for harness wizard
    ipcMain.on(IPC.HARNESS_EXPAND_WINDOW, () => {
      if (!win) return
      const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
      const W = 620, H = Math.min(780, sh - 40)
      win.setResizable(true)
      win.setAlwaysOnTop(false)
      win.setSize(W, H)
      win.setPosition(Math.floor((sw - W) / 2), Math.floor((sh - H) / 2))
    })

    ipcMain.on(IPC.HARNESS_COLLAPSE_WINDOW, () => {
      if (!win) return
      const { width: sw } = screen.getPrimaryDisplay().workAreaSize
      win.setResizable(false)
      win.setAlwaysOnTop(true, 'screen-saver')
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
      win.setSize(WIN_WIDTH, WIN_HEIGHT)
      win.setPosition(Math.floor((sw - WIN_WIDTH) / 2), 0)
    })

    ipcMain.on(IPC.HARNESS_OPEN_WINDOW, (_e, workspace: string) => {
      this.openHarnessWindow(workspace, win)
    })

    ipcMain.on(IPC.HARNESS_CLOSE_WINDOW, (e) => {
      const sender = BrowserWindow.fromWebContents(e.sender)
      if (sender && sender !== win) sender.close()
    })

    // ── Harness visualization dashboard ──
    ipcMain.on(IPC.DASHBOARD_OPEN_WINDOW, (_e, workspace: string) => {
      this.openDashboardWindow(workspace, win)
    })

    ipcMain.handle(IPC.HARNESS_READ, (_e, workspace: string, relPath: string) => {
      return harnessRead(workspace, relPath)
    })

    ipcMain.handle(IPC.HARNESS_SUMMARY, (_e, workspace: string) => {
      return harnessSummary(workspace)
    })

    ipcMain.handle(IPC.HARNESS_LIST_SESSIONS, (_e, workspace: string) => {
      return listSessions(workspace)
    })

    ipcMain.handle(IPC.HARNESS_READ_SESSION, (_e, workspace: string, sessionId: string) => {
      return readTranscriptById(workspace, sessionId)
    })

    ipcMain.handle(IPC.HARNESS_STATS, (_e, workspace: string) => {
      return readProjectStats(workspace)
    })

    // "Resume this session" from the console: spawn a CCC-managed terminal that
    // runs `claude --resume <id>` in the workspace (full island/hooks/lifecycle).
    ipcMain.on(IPC.RESUME_SESSION, (_e, workspace: string, sessionId: string) => {
      // sessionId flows into a shell/PowerShell launch script — restrict to the
      // safe charset a Claude session id uses (uuid: hex + hyphen) to block
      // command injection.
      if (!/^[A-Za-z0-9_-]+$/.test(sessionId)) return
      const id = this.manager?.launch(workspace, '', false, sessionId)
      // Launched from the console window → push it to the main window's island
      // so the resumed session shows up like any other CCC-managed session.
      if (id != null) {
        const payload = this.manager?.restoredPayloadFor(id)
        if (payload) win.webContents.send(IPC.SESSION_RESTORED, payload)
      }
    })

    // ── Remote control (Claude Code native) ──
    // Mark a session as remote-driven so its PreToolUse hook passes through to
    // Claude Code's native permission prompt (→ mobile push) instead of CCC's
    // desktop popup. The renderer also injects `/remote-control` to connect it.
    ipcMain.on(IPC.MARK_SESSION_REMOTE, (_e, sessionId: number) => {
      this.hooks.registerRemoteSession(sessionId)
    })

    // ── Platform capabilities (renderer-side accessibility banner etc.) ──
    ipcMain.handle(IPC.PLATFORM_GET_CAPABILITIES, () => {
      return this.adapter.capabilities()
    })

    ipcMain.on(IPC.OPEN_ACCESSIBILITY_SETTINGS, () => {
      void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')
    })

    // ── API providers ──
    ipcMain.handle(IPC.API_PROVIDER_LIST, () => {
      return this.apiProviders.list()
    })

    ipcMain.handle(IPC.API_PROVIDER_SAVE, (_e, config: ApiProviderConfig, key: string) => {
      try {
        this.apiProviders.save(config, key)
        return { ok: true as const }
      } catch (err) {
        const message = err instanceof VaultUnavailableError
          ? 'vault-unavailable'
          : (err instanceof Error ? err.message : String(err))
        return { ok: false as const, error: message }
      }
    })

    ipcMain.handle(IPC.API_PROVIDER_SET_MODEL, (_e, id: ApiProviderId, modelId: string) => {
      this.apiProviders.setModel(id, modelId)
    })

    ipcMain.handle(IPC.API_PROVIDER_REMOVE, (_e, id: ApiProviderId) => {
      this.apiProviders.remove(id)
    })

    ipcMain.handle(IPC.API_PROVIDER_TEST, (_e, config: ApiProviderConfig, key: string) => {
      // Empty key means "use the stored key" — lets the renderer trigger a
      // round-trip Test for an already-saved provider without ever holding
      // the plaintext.
      const effective = key.trim() === ''
        ? (this.apiProviders.readKey(config.id) ?? '')
        : key
      return this.apiProviders.test(config, effective).then(result => {
        if (key.trim() === '') {
          if (result.ok) this.apiProviders.markVerified(config.id)
          else           this.apiProviders.markUnverified(config.id)
        }
        return result
      })
    })

    ipcMain.handle(IPC.API_SESSION_RESTART, (_e, sessionId: number, providerId: ApiProviderId, modelId: string) => {
      if (!this.manager) return { ok: false as const, error: 'manager-not-ready' }
      return this.manager.restartAsApi(sessionId, providerId, modelId)
    })

    ipcMain.handle(IPC.API_SESSION_LAUNCH_NEW, (_e, workspace: string, providerId: ApiProviderId, modelId: string) => {
      if (!this.manager) return { ok: false as const, error: 'manager-not-ready' }
      const result = this.manager.launchAsApi(workspace, providerId, modelId)
      if (result.ok) this.apiUsage?.registerSession(result.sessionId, providerId, modelId)
      return result
    })

    // ── Claude Code CLI ──
    // detect() returns cached snapshot (60 s TTL) — used by the pill expand
    // path, must stay fast. redetect() bypasses cache — used by Settings →
    // "Check Again" only. See STABILITY_RULES.md §2.1.
    ipcMain.handle(IPC.CLAUDE_CLI_DETECT, () => {
      return this.claudeCliManager.detect()
    })

    ipcMain.handle(IPC.CLAUDE_CLI_REDETECT, () => {
      return this.claudeCliManager.redetect()
    })

    // ── Codex CLI ──
    // Same cached/forced split as Claude CLI above.
    ipcMain.handle(IPC.CODEX_CLI_DETECT, () => {
      return this.codexManager.detect()
    })

    ipcMain.handle(IPC.CODEX_CLI_REDETECT, () => {
      return this.codexManager.redetect()
    })

    ipcMain.handle(IPC.CODEX_CLI_LAUNCH, (_e, workspace: string, modelId: string, skipPermissions = false) => {
      if (!this.manager) return { ok: false as const, error: 'manager-not-ready' }
      return this.manager.launchCodex(workspace, modelId, skipPermissions)
    })
  }

  private harnessWindows = new Map<string, BrowserWindow>()

  private openHarnessWindow(workspace: string, mainWin?: BrowserWindow | null): void {
    // CCC-MAGI already installed → skip the install wizard entirely and open
    // the console (dashboard) directly. The wizard only exists to run the
    // env-check + first install; once installed, the dashboard (with its own
    // "Update CCC-MAGI" control) is the single surface.
    if (isMagiInstalled(workspace)) {
      this.openDashboardWindow(workspace, mainWin)
      return
    }

    const existing = this.harnessWindows.get(workspace)
    if (existing && !existing.isDestroyed()) { existing.focus(); return }

    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
    const W = 532
    const H = Math.min(600, sh - 120)

    // Anchor the install wizard just below the CCC pill near the top, centred on
    // the island. We deliberately DON'T offset by the island's height: this
    // window is opened from the *expanded* panel, so adding main.height would
    // push it to the bottom of the screen (the "too low" bug). Fall back to
    // screen-centre if the main window is gone; clamp so it stays on-screen.
    const TOP_GAP = 72
    const main = mainWin && !mainWin.isDestroyed() ? mainWin.getBounds() : null
    const x = main
      ? Math.max(0, Math.min(Math.floor(main.x + main.width / 2 - W / 2), sw - W))
      : Math.floor((sw - W) / 2)
    const y = main
      ? Math.max(0, Math.min(main.y + TOP_GAP, sh - H))
      : Math.floor((sh - H) / 2)

    const win = new BrowserWindow({
      x,
      y,
      width:           W,
      height:          H,
      frame:           false,
      transparent:     false,
      alwaysOnTop:     false,
      resizable:       true,
      minWidth:        434,
      minHeight:       392,
      skipTaskbar:     false,
      hasShadow:       true,
      backgroundColor: '#0a0a0a',
      title:           'CCC-MAGI',
      webPreferences: {
        preload:          join(__dirname, '../preload/index.js'),
        nodeIntegration:  false,
        contextIsolation: true,
        sandbox:          false,
      },
    })

    this.harnessWindows.set(workspace, win)
    win.on('closed', () => { this.harnessWindows.delete(workspace) })

    const params = `?view=harness&workspace=${encodeURIComponent(workspace)}`
    const isDev = !app.isPackaged
    if (isDev && process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(process.env['ELECTRON_RENDERER_URL'] + params)
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'), { search: params })
    }
  }

  private dashboardWindows = new Map<string, BrowserWindow>()

  // The visualization dashboard is content-heavy (6 tabbed pages), so it opens
  // in a larger, freely-resizable window — distinct from the compact install
  // panel above. One window per workspace; re-opening focuses the existing one.
  private openDashboardWindow(workspace: string, mainWin?: BrowserWindow | null): void {
    const existing = this.dashboardWindows.get(workspace)
    if (existing && !existing.isDestroyed()) { existing.focus(); return }

    const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
    const W = Math.min(1040, sw - 80)
    const H = Math.min(760, sh - 80)
    const main = mainWin && !mainWin.isDestroyed() ? mainWin.getBounds() : null
    const x = main
      ? Math.max(0, Math.min(Math.floor(main.x + main.width / 2 - W / 2), sw - W))
      : Math.floor((sw - W) / 2)
    const y = Math.floor((sh - H) / 2)

    const win = new BrowserWindow({
      x,
      y,
      width:           W,
      height:          H,
      frame:           false,
      transparent:     false,
      alwaysOnTop:     false,
      resizable:       true,
      minWidth:        720,
      minHeight:       520,
      skipTaskbar:     false,
      hasShadow:       true,
      backgroundColor: '#0a0a0a',
      title:           'CCC-MAGI 控制台',
      webPreferences: {
        preload:          join(__dirname, '../preload/index.js'),
        nodeIntegration:  false,
        contextIsolation: true,
        sandbox:          false,
      },
    })

    this.dashboardWindows.set(workspace, win)
    win.on('closed', () => { this.dashboardWindows.delete(workspace) })

    const params = `?view=dashboard&workspace=${encodeURIComponent(workspace)}`
    const isDev = !app.isPackaged
    if (isDev && process.env['ELECTRON_RENDERER_URL']) {
      win.loadURL(process.env['ELECTRON_RENDERER_URL'] + params)
    } else {
      win.loadFile(join(__dirname, '../renderer/index.html'), { search: params })
    }
  }

  cleanup(): void {
    this.manager?.killAll()
    this.hooks.stop()
    ipcMain.removeAllListeners()
  }
}



class AppWindow {
  private win:         BrowserWindow | null = null
  private hookSrv      = new HookServer(undefined, join(app.getPath('userData'), PORT_FILE_NAME))
  private handlers:    IpcHandlers | null = null
  private persistence  = new SessionPersistence()
  private adapter:     PlatformAdapter = createPlatformAdapter()

  shouldQuitOnAllWindowsClosed(): boolean {
    return this.adapter.shouldQuitOnAllWindowsClosed()
  }

  async create(): Promise<void> {
    await this.hookSrv.start()
    this.handlers = new IpcHandlers(this.hookSrv, this.adapter, this.persistence)

    const { width: sw } = screen.getPrimaryDisplay().workAreaSize

    this.win = new BrowserWindow({
      x:               Math.floor((sw - WIN_WIDTH) / 2),
      y:               0,
      width:           WIN_WIDTH,
      height:          WIN_HEIGHT,
      frame:           false,
      transparent:     true,
      alwaysOnTop:     true,
      resizable:       false,
      skipTaskbar:     true,
      hasShadow:       false,
      roundedCorners:  false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload:          join(__dirname, '../preload/index.js'),
        nodeIntegration:  false,
        contextIsolation: true,
        sandbox:          false,
        // The overlay is a realtime HUD. Chromium marks transparent
        // always-on-top windows occluded on Windows after idle, which
        // throttles renderer timers and then flushes them in a burst on
        // the next click — racing the long-press / mouse-passthrough
        // logic (a single click could strand the pill in drag mode).
        // Never throttle this window.
        backgroundThrottling: false,
      },
    })

    this.win.setAlwaysOnTop(true, 'screen-saver')
    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    this.win.setIgnoreMouseEvents(true, { forward: true })

    this.handlers.register(this.win)

    // ── Power management: persist on sleep, restore on wake ──
    powerMonitor.on('suspend', () => {
      this.handlers?.beginRecoveryHold(SLEEP_RECOVERY_HOLD_MS)
      const sessions = this.handlers?.persistSessions() ?? []
      if (sessions.length > 0) this.persistence.save(sessions)
      else this.persistence.clear()
    })

    powerMonitor.on('resume', () => {
      this.handlers?.beginRecoveryHold(RESUME_RECOVERY_HOLD_MS)
      const sessions = this.persistence.load()
      for (const delayMs of RESUME_RESTORE_DELAYS_MS) {
        setTimeout(() => {
          if (!this.win || this.win.isDestroyed()) return
          if (sessions && sessions.length > 0) this.handlers?.tryRestore(sessions, this.win)
          // Repaint the real model AND numbers (context %, usage, resets) on any
          // session whose display went blank while asleep. Fires on each restore
          // tick (not just when there are persisted sessions to re-attach) so a
          // still-tracked session that lost them recovers on wake without an app
          // restart.
          this.hookSrv.rebroadcastSessionMetrics()
        }, delayMs)
      }
      setTimeout(() => {
        this.handlers?.endRecoveryHold()
      }, RESUME_RECOVERY_HOLD_MS)
    })

    const isDev = !app.isPackaged
    if (isDev && process.env['ELECTRON_RENDERER_URL']) {
      await this.win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      await this.win.loadFile(join(__dirname, '../renderer/index.html'))
    }

    const persisted = this.persistence.load()
    if (persisted && persisted.length > 0) {
      setTimeout(() => {
        if (this.win && !this.win.isDestroyed()) {
          this.handlers?.tryRestore(persisted, this.win)
        }
      }, 1000)
    }

    this.win.on('closed', () => {
      this.handlers?.cleanup()
    })

    // Renderer-initiated full quit (Settings → Quit button). app.quit()
    // closes the BrowserWindow, which fires win.on('closed') above and
    // tears down sessions + servers in one path.
    ipcMain.on(IPC.QUIT_APP, () => { app.quit() })
  }
}

const appWindow = new AppWindow()

app.whenReady().then(async () => {
  await appWindow.create()
  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await appWindow.create()
  })
})

app.on('window-all-closed', () => {
  if (appWindow.shouldQuitOnAllWindowsClosed()) app.quit()
})
