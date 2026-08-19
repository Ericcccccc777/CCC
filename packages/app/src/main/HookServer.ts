import * as http from 'http'
import { AddressInfo } from 'net'
import { BrowserWindow, ipcMain } from 'electron'
import { statSync, openSync, readSync, closeSync } from 'fs'
import { IPC } from '../shared/ipc-channels'
import type { SessionStateUpdate, SessionLifecycleState, ToolPermission, SessionMetrics, SessionMetricsUpdate } from '../shared/session-state'

interface Pending {
  res:       http.ServerResponse
  timer:     ReturnType<typeof setTimeout>
  sessionId: number
}

interface TranscriptEntry {
  path:   string
  offset: number
  timer:  ReturnType<typeof setInterval>
}

export class HookServer {
  private server          = http.createServer((req, res) => this.handleRequest(req, res))
  private port            = 0
  private pendingHooks    = new Map<string, Pending>()
  private transcripts     = new Map<number, TranscriptEntry>()
  private alwaysAllowed   = new Map<number, Set<string>>()
  private lastDoneAt      = new Map<number, number>()
  // Last time genuine model/tool activity was seen for a session (a /hook event
  // or a transcript line). NOT bumped by statusLine refreshes — those tick even
  // when the session is idle. Drives the idle-completion backstop (sweepIdle).
  private lastActivityAt  = new Map<number, number>()
  // Last lifecycle state pushed to the renderer, per session. Lets sweepIdle()
  // distinguish "stuck running" from "already done".
  private lastState       = new Map<number, SessionLifecycleState>()
  // Last real model display name (e.g. "Opus 4.8") seen on this session's
  // statusLine. The renderer normally holds the model, but a session rebuilt
  // after sleep / long idle / app restart loses it and would show "—" until a
  // fresh statusLine arrives (which never comes while the session is idle).
  // Persisting it here — and echoing it into restore payloads — lets a rebuilt
  // session show its true model immediately. See SessionRestored.model.
  private lastModel       = new Map<number, string>()
  // Last-known numeric metrics (context %, 5h/7d usage, reset times) per session.
  // Same rationale as lastModel: they arrive ONLY on statusLine POSTs and live
  // ONLY in the renderer, so a session rebuilt after sleep / long idle / app
  // restart resets them to 0 and — since statusLine only re-POSTs on activity —
  // stays at 0 while idle. Caching them here, threading them into restore
  // payloads + persistence, and re-broadcasting on wake re-hydrates a rebuilt
  // session at once. Merged field-by-field (mergeMetrics) so a partial
  // statusLine never wipes a previously-known value. See SessionRestored.metrics.
  private lastMetrics     = new Map<number, SessionMetrics>()
  // Sessions whose AskUserQuestion popup timed out without a renderer answer.
  // Claude Code is now rendering the question in the terminal and waiting on
  // user input there. Until the next Stop event, transcript→streaming is
  // suppressed so the island icon stays as `?` (matches the actual lifecycle:
  // Claude is still waiting for the user to make a choice). Cleared on Stop,
  // session teardown, and server shutdown.
  private terminalAwaiting = new Set<number>()
  private win:            BrowserWindow | null = null
  private harnessAsk:     { res: http.ServerResponse; timer: ReturnType<typeof setTimeout> } | null = null
  private harnessSessions = new Set<number>()
  // Full-access ("danger mode") sessions: launched with
  // --dangerously-skip-permissions. Claude's own permission prompts are off,
  // but Claude Code still fires the PreToolUse hook regardless of that flag —
  // so without this set CCC would surface its own permission popup anyway.
  // Membership makes dispatch() auto-allow PreToolUse while leaving the
  // statusLine / Stop / Notification hooks intact.
  private fullAccessSessions = new Set<number>()
  // Remote-control sessions: the user enabled Claude Code's native Remote
  // Control to drive this session from a phone/web. For these, CCC must NOT
  // pre-decide PreToolUse (its popup is desktop-only) — it passes through so
  // Claude Code's own permission prompt fires and reaches the phone via mobile
  // push ("Push when actions required").
  private remoteSessions = new Set<number>()
  private readonly preToolUseTimeoutMs: number
  // ApiUsageManager subscribes to every parsed transcript line so it can
  // pull `usage.*` off API-mode assistant messages. Set via setTranscriptSink;
  // null means no consumer (Anthropic-only run).
  private transcriptSink: ((sessionId: number, parsed: Record<string, unknown>) => void) | null = null

  // Idle-completion backstop timer (see sweepIdle). Started in start(),
  // cleared in stop().
  private idleSweepTimer: ReturnType<typeof setInterval> | null = null

  // Trailing PreToolUse POSTs can land AFTER a Stop on slow transports
  // (Windows spawns hooks via PowerShell — far slower than macOS node), which
  // would flip a just-`done` session back to `streaming`. Within this window
  // after a Stop, auto-allowed tool calls still reply normally but do NOT flip
  // lifecycle state. Mirrors the 2 s transcript grace in processTranscriptLine.
  private static readonly STREAM_GRACE_MS = 3_000
  // Backstop: a session stuck in a running state with no activity for this long
  // is force-completed (covers any missed Stop or unmodeled hook-ordering race).
  private static readonly IDLE_DONE_MS  = 5 * 60_000
  private static readonly IDLE_SWEEP_MS = 30_000

  // 120s default (was 30s). With the renderer-side permission queue
  // (parallel-tool-call fix), the user can have multiple permission popups
  // pending and may need real wall-clock time to work through them. At
  // 30s, queued items still auto-allow before the user gets to them —
  // 120s gives reasonable headroom without breaking AskUserQuestion's
  // terminal-picker fallback semantics (the picker just takes longer to
  // appear if the user is genuinely AFK).
  constructor(preToolUseTimeoutMs = 120_000) {
    this.preToolUseTimeoutMs = preToolUseTimeoutMs
  }

  setTranscriptSink(sink: (sessionId: number, parsed: Record<string, unknown>) => void): void {
    this.transcriptSink = sink
  }

  allowToolAlways(sessionId: number, tool: string): void {
    let set = this.alwaysAllowed.get(sessionId)
    if (!set) { set = new Set(); this.alwaysAllowed.set(sessionId, set) }
    set.add(tool)
  }

  registerHarnessSession(sessionId: number): void {
    this.harnessSessions.add(sessionId)
  }

  unregisterHarnessSession(sessionId: number): void {
    this.harnessSessions.delete(sessionId)
  }

  isHarnessSession(sessionId: number): boolean {
    return this.harnessSessions.has(sessionId)
  }

  registerFullAccessSession(sessionId: number): void {
    this.fullAccessSessions.add(sessionId)
  }

  unregisterFullAccessSession(sessionId: number): void {
    this.fullAccessSessions.delete(sessionId)
  }

  registerRemoteSession(sessionId: number): void {
    this.remoteSessions.add(sessionId)
  }

  unregisterRemoteSession(sessionId: number): void {
    this.remoteSessions.delete(sessionId)
  }

  answerHarnessAsk(answer: string): void {
    if (!this.harnessAsk) return
    clearTimeout(this.harnessAsk.timer)
    this.reply(this.harnessAsk.res, { answer })
    this.harnessAsk = null
  }

  start(): Promise<number> {
    return new Promise(resolve => {
      this.server.listen(0, '127.0.0.1', () => {
        this.port = (this.server.address() as AddressInfo).port
        this.idleSweepTimer = setInterval(() => this.sweepIdle(), HookServer.IDLE_SWEEP_MS)
        resolve(this.port)
      })
    })
  }

  attachWindow(win: BrowserWindow): void {
    this.win = win
    ipcMain.on(IPC.HOOK_DECISION, (_e, hookKey: string, exitCode: number) => {
      const pending = this.pendingHooks.get(hookKey)
      if (!pending) return
      clearTimeout(pending.timer)
      this.pendingHooks.delete(hookKey)
      this.reply(pending.res, { exitCode })
    })

    ipcMain.on(IPC.ALLOW_TOOL_ALWAYS, (_e, sessionId: number, tool: string) => {
      this.allowToolAlways(sessionId, tool)
    })

    ipcMain.on(IPC.HARNESS_ANSWER, (_e, answer: string) => {
      this.answerHarnessAsk(answer)
    })
  }

  stop(): void {
    for (const [, p] of this.pendingHooks) {
      clearTimeout(p.timer)
      this.reply(p.res, { exitCode: 0 })
    }
    this.pendingHooks.clear()
    if (this.harnessAsk) {
      clearTimeout(this.harnessAsk.timer)
      this.reply(this.harnessAsk.res, { answer: 'D' })
      this.harnessAsk = null
    }
    for (const [, t] of this.transcripts) clearInterval(t.timer)
    this.transcripts.clear()
    if (this.idleSweepTimer) { clearInterval(this.idleSweepTimer); this.idleSweepTimer = null }
    this.alwaysAllowed.clear()
    this.lastDoneAt.clear()
    this.lastActivityAt.clear()
    this.lastState.clear()
    this.lastModel.clear()
    this.lastMetrics.clear()
    this.terminalAwaiting.clear()
    this.harnessSessions.clear()
    this.fullAccessSessions.clear()
    this.remoteSessions.clear()
    this.server.close()
    ipcMain.removeAllListeners(IPC.HOOK_DECISION)
    ipcMain.removeAllListeners(IPC.ALLOW_TOOL_ALWAYS)
    ipcMain.removeAllListeners(IPC.HARNESS_ANSWER)
  }

  stopTranscript(sessionId: number): void {
    // Clear the transcript watcher if one was started (a session may never get
    // one — the watch only begins once a statusLine carries a transcript_path).
    const t = this.transcripts.get(sessionId)
    if (t) {
      clearInterval(t.timer)
      this.transcripts.delete(sessionId)
    }
    // Per-session bookkeeping is cleared unconditionally so nothing leaks for a
    // session that never opened a transcript (e.g. torn down very early).
    this.lastDoneAt.delete(sessionId)
    this.lastActivityAt.delete(sessionId)
    this.lastState.delete(sessionId)
    this.lastModel.delete(sessionId)
    this.lastMetrics.delete(sessionId)
    this.terminalAwaiting.delete(sessionId)
    this.remoteSessions.delete(sessionId)
  }

  get serverPort(): number { return this.port }

  // Last real model display name seen on this session's statusLine, if any.
  // Used to re-hydrate the model of a session rebuilt after sleep / restart.
  lastKnownModel(sessionId: number): string | undefined {
    return this.lastModel.get(sessionId)
  }

  // Seed the model cache from a persisted session on restore, so the very
  // first restore payload after an app restart already carries the real model
  // (the cache is otherwise empty until the session emits a statusLine).
  seedModel(sessionId: number, model: string): void {
    if (model) this.lastModel.set(sessionId, model)
  }

  // Last-known numeric metrics for a session, if any. Used to re-hydrate the
  // context %, usage, and reset times of a session rebuilt after sleep/restart.
  lastKnownMetrics(sessionId: number): SessionMetrics | undefined {
    return this.lastMetrics.get(sessionId)
  }

  // Seed the metrics cache from a persisted session on restore (analog of
  // seedModel), so the first restore payload after an app restart already
  // carries the real numbers instead of 0.
  seedMetrics(sessionId: number, metrics: SessionMetrics): void {
    this.mergeMetrics(sessionId, metrics)
  }

  // Merge only the *defined* fields of a metrics patch into the cache, so a
  // statusLine that carries context but no rate_limits (or vice-versa) never
  // clobbers a previously-known value with undefined. A patch with nothing
  // defined is a no-op (never creates an empty entry).
  private mergeMetrics(sessionId: number, patch: SessionMetrics): void {
    const defined: SessionMetrics = {}
    for (const [k, v] of Object.entries(patch)) {
      if (v !== undefined) (defined as Record<string, unknown>)[k] = v
    }
    if (Object.keys(defined).length === 0) return
    this.lastMetrics.set(sessionId, { ...this.lastMetrics.get(sessionId), ...defined })
  }

  // Re-push the last-known model AND numeric metrics for every tracked session.
  // Called on wake: a session whose model/numbers went blank in the renderer
  // (rebuilt during sleep) is repainted at once, without waiting for a focus
  // event or the next statusLine — which may never arrive while the session
  // sits idle. This is the reliable recovery path, since the click-through
  // overlay window can't count on focus/visibility events firing after the
  // display wakes.
  rebroadcastSessionMetrics(): void {
    const sessionIds = new Set<number>([...this.lastModel.keys(), ...this.lastMetrics.keys()])
    for (const sessionId of sessionIds) {
      const model   = this.lastModel.get(sessionId)
      const metrics = this.lastMetrics.get(sessionId)
      if (!model && !metrics) continue
      const update: SessionMetricsUpdate = { sessionId, replay: true, ...(model ? { model } : {}), ...metrics }
      try { this.win?.webContents.send(IPC.SESSION_METRICS_UPDATED, update) } catch { /* window gone */ }
    }
  }

  private reply(res: http.ServerResponse, body: unknown): void {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(body))
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    if (req.method !== 'POST') { res.writeHead(404); res.end(); return }
    let body = ''
    req.on('data', (chunk: Buffer) => { body += chunk.toString() })
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body)
        if (req.url === '/hook') {
          this.dispatch(parsed as {
            sessionId: number; event: string
            tool?: string; toolInput?: unknown; message?: string
          }, res)
        } else if (req.url === '/statusline') {
          this.handleStatusLine(parsed as { sessionId: number; data: Record<string, unknown> }, res)
        } else if (req.url === '/harness-ask') {
          this.handleHarnessAsk(parsed as { question: string; options: string[] }, res)
        } else {
          res.writeHead(404); res.end()
        }
      } catch { res.writeHead(400); res.end() }
    })
  }

  private handleHarnessAsk(data: { question: string; options: string[] }, res: http.ServerResponse): void {
    // Cancel any previous pending ask (shouldn't happen, but be safe)
    if (this.harnessAsk) {
      clearTimeout(this.harnessAsk.timer)
      this.reply(this.harnessAsk.res, { answer: 'D' })
    }
    // Broadcast to every open window — the harness wizard window subscribes,
    // the main pill window ignores it. (Wizard runs in its own BrowserWindow.)
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send(IPC.HARNESS_QUESTION, {
        question: data.question,
        options:  data.options,
      })
    }
    // Block until answered — 5 minute timeout defaults to "D"
    const timer = setTimeout(() => {
      this.harnessAsk = null
      this.reply(res, { answer: 'D' })
    }, 300_000)
    this.harnessAsk = { res, timer }
  }

  private handleStatusLine(p: { sessionId: number; data: Record<string, unknown> }, res: http.ServerResponse): void {
    this.reply(res, {})
    const { sessionId, data } = p
    if (!data || typeof data !== 'object') return

    const modelObj = data['model'] as { id?: string; display_name?: string } | undefined
    const model    = modelObj?.display_name ?? modelObj?.id
    // Remember the real model so a rebuilt session can be re-hydrated without
    // waiting for the next statusLine (see lastModel / lastKnownModel).
    if (model) this.lastModel.set(sessionId, model)

    const cw       = data['context_window'] as {
      used_percentage?: number; context_window_size?: number
      total_input_tokens?: number; total_output_tokens?: number
    } | undefined
    const contextPct = typeof cw?.used_percentage === 'number' ? cw.used_percentage / 100 : undefined
    const contextWindowSize = typeof cw?.context_window_size === 'number' ? cw.context_window_size : undefined
    // Current context tokens = input (incl. cache) + output, per statusLine
    // (as of CLI 2.1.132 these reflect current usage, not cumulative).
    const inTok  = typeof cw?.total_input_tokens  === 'number' ? cw.total_input_tokens  : 0
    const outTok = typeof cw?.total_output_tokens === 'number' ? cw.total_output_tokens : 0
    const contextTokens = (inTok > 0 || outTok > 0) ? inTok + outTok : undefined

    const rl = data['rate_limits'] as Record<string, unknown> | undefined
    const fiveHour = rl?.['five_hour'] as Record<string, unknown> | undefined
    const sevenDay = rl?.['seven_day'] as Record<string, unknown> | undefined
    const pct = (b: Record<string, unknown> | undefined): number | undefined => {
      const v = b?.['used_percentage']
      return typeof v === 'number' ? v / 100 : undefined
    }
    const usagePct5h = pct(fiveHour)
    const usagePct7d = pct(sevenDay)
    // resets-at parser. Claude Code's statusLine emits
    //   { rate_limits: { five_hour: { resets_at: <unix-seconds>, ... }, ... } }
    // (verified 2026-05-09 against the user's running CLI). We've also seen
    // older / hypothetical builds use ISO strings or relative seconds, so
    // the parser is broadened to accept any of:
    //   - number  → Unix seconds (< 1e11) or ms (>= 1e11), discriminated by
    //               magnitude (1e11 ms ≈ 1973-03; 1e11 s ≈ year 5138)
    //   - string  → ISO 8601 via Date.parse
    //   - companion keys for unambiguous formats (reset_at_unix_ms, reset_in_seconds)
    const parseReset = (b: Record<string, unknown> | undefined): number | undefined => {
      if (!b) return undefined
      for (const k of ['resets_at', 'reset_at', 'reset_time', 'resetsAt']) {
        const v = b[k]
        if (typeof v === 'number' && Number.isFinite(v)) {
          return v < 1e11 ? v * 1000 : v
        }
        if (typeof v === 'string') {
          const ms = Date.parse(v)
          if (Number.isFinite(ms)) return ms
        }
      }
      for (const k of ['reset_at_unix_ms', 'reset_at_ms', 'resets_at_ms']) {
        const v = b[k]
        if (typeof v === 'number' && Number.isFinite(v)) return v
      }
      for (const k of ['reset_in_seconds', 'resets_in_seconds', 'reset_in']) {
        const v = b[k]
        if (typeof v === 'number' && Number.isFinite(v)) return Date.now() + v * 1000
      }
      return undefined
    }
    const reset5hAt = parseReset(fiveHour)
    const reset7dAt = parseReset(sevenDay)

    const metrics: SessionMetricsUpdate = {
      sessionId, model, contextPct, contextTokens, contextWindowSize, usagePct5h, usagePct7d, reset5hAt, reset7dAt,
    }
    // Remember the numbers so a session rebuilt after sleep/idle/restart can be
    // re-hydrated immediately (see lastMetrics / rebroadcastSessionMetrics).
    this.mergeMetrics(sessionId, { contextPct, contextTokens, contextWindowSize, usagePct5h, usagePct7d, reset5hAt, reset7dAt })
    this.win?.webContents.send(IPC.SESSION_METRICS_UPDATED, metrics)

    const transcriptPath = typeof data['transcript_path'] === 'string' ? data['transcript_path'] : null
    if (transcriptPath && !this.transcripts.has(sessionId)) {
      this.startTranscriptWatch(sessionId, transcriptPath)
    }
  }

  private startTranscriptWatch(sessionId: number, path: string): void {
    const entry: TranscriptEntry = { path, offset: 0, timer: null as unknown as ReturnType<typeof setInterval> }
    let synced = false
    try { entry.offset = statSync(path).size; synced = true } catch { /* not created yet */ }

    // 2 s polling: STABILITY_RULES.md §2.3 bans sub-2 s sync-statSync loops.
    // The visible cost of this latency is a ≤ 2 s delay before the island
    // icon flips from `done` back to `streaming` when Claude resumes output.
    // The user cannot perceive that delay; the previous 800 ms cadence was
    // sustained syscall pressure (~7 sc/sec at 6 sessions) for no UX win.
    entry.timer = setInterval(() => {
      try {
        const stat = statSync(entry.path)
        if (!synced) {
          // File just appeared — skip all existing content, only watch new writes
          entry.offset = stat.size
          synced = true
          return
        }
        if (stat.size <= entry.offset) return
        const fd  = openSync(entry.path, 'r')
        const buf = Buffer.alloc(stat.size - entry.offset)
        readSync(fd, buf, 0, buf.length, entry.offset)
        closeSync(fd)
        entry.offset = stat.size

        for (const line of buf.toString('utf8').split('\n')) {
          const t = line.trim()
          if (!t) continue
          this.processTranscriptLine(sessionId, t)
        }
      } catch { /* file gone */ }
    }, 2000)

    this.transcripts.set(sessionId, entry)
  }

  // Extracted from startTranscriptWatch's setInterval closure so it can be
  // exercised by unit tests without spinning up real fs polling. `line` must
  // already be a non-empty trimmed JSONL row.
  private processTranscriptLine(sessionId: number, line: string): void {
    let obj: Record<string, unknown>
    try { obj = JSON.parse(line) as Record<string, unknown> } catch { return }
    this.lastActivityAt.set(sessionId, Date.now())
    // Forward every parsed line to ApiUsageManager (no-op for Anthropic
    // sessions; ApiUsageManager filters by registered sessionId). The sink
    // never throws — even if it did we want to keep the lifecycle logic
    // below running, so we wrap defensively.
    if (this.transcriptSink) {
      try { this.transcriptSink(sessionId, obj) } catch { /* never block lifecycle on sink errors */ }
    }
    const msg = obj['message'] as Record<string, unknown> | undefined

    // user-role messages cover the human's terminal input AND tool_result
    // entries written back when a tool finishes. Their arrival means the
    // user has interacted with the terminal — clear terminalAwaiting so the
    // *next* assistant message can flip to streaming naturally.
    //
    // If terminalAwaiting WAS set (the AskUserQuestion popup timed out and
    // Claude is now showing the picker in the terminal), the user just
    // answered there. Push state='streaming' so the renderer drops any
    // stale notification + flips state immediately, without waiting for
    // the next assistant message. This triggers the per-mode dismiss
    // behavior the user asked for:
    //   - default mode: popup closes
    //   - top-hidden:   notification clears → 2s auto-rehide kicks in →
    //                   pill goes back to the strip
    //   - corner-shrunk: cornerHintActive becomes false → banner collapses
    //                   to bare circle
    const isUser =
      obj['type'] === 'user' ||
      msg?.['role'] === 'user'
    if (isUser) {
      const wasTerminalAwaiting = this.terminalAwaiting.has(sessionId)
      this.terminalAwaiting.delete(sessionId)
      if (wasTerminalAwaiting) {
        this.sendState({ sessionId, state: 'streaming' })
      }
      return
    }

    const isAssistant =
      obj['type'] === 'assistant' ||
      msg?.['role'] === 'assistant'
    if (!isAssistant) return

    // Suppress transcript→streaming when:
    //   (a) A PreToolUse hook is currently pending for this session — the
    //       assistant line we just saw is Claude's record of the tool_use
    //       call we're holding, not actual streaming. Without this, the
    //       popup gets clobbered ~800ms after appearing (visible bug:
    //       "popup flashes once and disappears").
    //   (c) Within 2s of a Stop event — prevents transcript watcher from
    //       overriding 'done' after model switch.
    const hasPendingHook = [...this.pendingHooks.values()]
      .some(p => p.sessionId === sessionId)
    if (hasPendingHook) return

    // Forward-progress fallback (DECISION_LOG 2026-05-17-3 option B): if
    // terminalAwaiting is still set when an assistant message arrives,
    // the user MUST have already answered the terminal picker for Claude
    // to be writing this. The user-msg detection above didn't match in
    // observed Claude Code schemas — assistant-msg is a strict superset
    // of "user has answered" and clears the flag here instead of
    // suppressing the streaming flip.
    if (this.terminalAwaiting.has(sessionId)) {
      this.terminalAwaiting.delete(sessionId)
      // Fall through to the streaming-flip below (still guarded by the
      // 2s-after-done window so we don't clobber a fresh `done`).
    }
    const lastDone = this.lastDoneAt.get(sessionId) ?? 0
    if (Date.now() - lastDone > 2000) {
      this.sendState({ sessionId, state: 'streaming' })
    }
  }

  private dispatch(
    p: { sessionId: number; event: string; tool?: string; toolInput?: unknown; message?: string },
    res: http.ServerResponse,
  ): void {
    this.lastActivityAt.set(p.sessionId, Date.now())
    if (p.event === 'pretooluse') {
      const tool = p.tool ?? 'unknown'
      // Harness sessions auto-allow all tool use (Claude is writing harness files)
      if (this.harnessSessions.has(p.sessionId)) {
        this.reply(res, { exitCode: 0 })
        this.maybeStream(p.sessionId)
        return
      }
      // Full-access / danger-mode sessions: the user explicitly opted out of
      // permission prompts. Auto-allow without surfacing a popup.
      if (this.fullAccessSessions.has(p.sessionId)) {
        this.reply(res, { exitCode: 0 })
        this.maybeStream(p.sessionId)
        return
      }
      // Remote-control sessions: defer to Claude Code's native permission prompt
      // (passthrough = hook exits without a decision) so the request reaches the
      // phone via mobile push instead of CCC's desktop-only popup.
      if (this.remoteSessions.has(p.sessionId)) {
        this.reply(res, { passthrough: true })
        this.maybeStream(p.sessionId)
        return
      }
      if (this.alwaysAllowed.get(p.sessionId)?.has(tool)) {
        this.reply(res, { exitCode: 0 })
        this.maybeStream(p.sessionId)
        return
      }
      const hookKey = `ptu-${p.sessionId}-${Date.now()}`
      const timer   = setTimeout(() => {
        this.pendingHooks.delete(hookKey)
        this.reply(res, { exitCode: 0 })
        if (tool === 'AskUserQuestion') {
          // Tool will now run and render its own picker in the terminal,
          // waiting for user input there. Keep the icon in `waiting` (clear
          // the popup but don't flip to streaming) and suppress
          // transcript→streaming until the next Stop event.
          this.terminalAwaiting.add(p.sessionId)
          this.sendState({ sessionId: p.sessionId, state: 'waiting' })
        } else {
          this.sendState({ sessionId: p.sessionId, state: 'streaming' })
        }
      }, this.preToolUseTimeoutMs)
      this.pendingHooks.set(hookKey, { res, timer, sessionId: p.sessionId })
      const permission: ToolPermission = {
        hookKey, tool, toolInput: p.toolInput ?? {},
      }
      this.sendState({ sessionId: p.sessionId, state: 'waiting', permission })
    } else {
      this.reply(res, { exitCode: 0 })
      if (p.event === 'stop') {
        this.lastDoneAt.set(p.sessionId, Date.now())
        this.terminalAwaiting.delete(p.sessionId)
        this.sendState({ sessionId: p.sessionId, state: 'done' })
      } else if (p.event === 'notification') {
        // Notification hooks fire for things like 60-second idle reminders
        // and "Claude needs your attention" — they must NOT flip lifecycle
        // back to streaming. Carry the message only; preserve current state.
        // Suppress the redundant "waiting for input" idle nudge — the
        // pill's `?` icon already signals exactly this state, the popup
        // adds nothing and the user explicitly asked it removed twice.
        const msg = (p.message ?? '').toLowerCase()
        const isIdleNudge = msg.includes('waiting for your input')
                         || msg.includes('waiting for you input')
                         || msg.includes('waiting for input')
        if (!isIdleNudge) {
          this.sendState({ sessionId: p.sessionId, message: p.message })
        }
      }
    }
  }

  // Send `streaming` only when outside the post-Stop grace window. A trailing
  // PreToolUse arriving just after a Stop (common on Windows, where hooks are
  // spawned via slow PowerShell) must not resurrect a `done` session.
  private maybeStream(sessionId: number): void {
    const lastDone = this.lastDoneAt.get(sessionId) ?? 0
    if (Date.now() - lastDone > HookServer.STREAM_GRACE_MS) {
      this.sendState({ sessionId, state: 'streaming' })
    }
  }

  // Backstop only — the STREAM_GRACE_MS guard in dispatch() is the real fix for
  // the known trailing-PreToolUse race. Force-completes a session stuck in a
  // running state with no activity for IDLE_DONE_MS. Never fires while the
  // session is legitimately blocked on the user (open permission popup or an
  // AskUserQuestion terminal picker). Caveat: a single tool call that runs
  // silently for > IDLE_DONE_MS (e.g. a very long build) is marked done early;
  // the icon self-corrects to streaming on the next transcript write.
  private sweepIdle(): void {
    const now = Date.now()
    for (const [sessionId, last] of this.lastActivityAt) {
      const state = this.lastState.get(sessionId)
      if (state !== 'streaming' && state !== 'waiting') continue
      if (now - last < HookServer.IDLE_DONE_MS) continue
      const hasPendingHook = [...this.pendingHooks.values()].some(p => p.sessionId === sessionId)
      if (hasPendingHook || this.terminalAwaiting.has(sessionId)) continue
      this.lastDoneAt.set(sessionId, now)
      this.sendState({ sessionId, state: 'done' })
    }
  }

  private sendState(update: SessionStateUpdate): void {
    if (update.state) this.lastState.set(update.sessionId, update.state)
    this.win?.webContents.send(IPC.SESSION_STATE_CHANGED, update)
  }
}
