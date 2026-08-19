export type SessionLifecycleState = 'streaming' | 'done' | 'waiting' | 'idle'

export interface ToolPermission {
  hookKey:   string
  tool:      string
  toolInput: unknown
}

export interface SessionStateUpdate {
  sessionId:   number
  // Omit `state` to leave the renderer's current lifecycle state unchanged
  // (used by Notification dispatches that only carry a message).
  state?:      SessionLifecycleState
  permission?: ToolPermission
  message?:    string
}

// The numeric metrics that ride on a statusLine. Cached per-session in the main
// process (HookServer.lastMetrics) and threaded through restore payloads +
// persistence so a session rebuilt after sleep / long idle / app restart shows
// its last-known numbers immediately instead of resetting to 0 while it waits
// for a fresh statusLine — the exact analog of what SessionRestored.model does
// for the model display name. See metrics-blank-after-sleep fix.
export interface SessionMetrics {
  contextPct?:  number   // 0–1
  // Absolute context-window figures from statusLine `context_window`, so the UI
  // can show "137k / 1M" not just a percentage. contextWindowSize is per-model
  // (200000 default, 1000000 for extended-context models like Opus).
  contextTokens?:      number   // current tokens in context (input + output)
  contextWindowSize?:  number   // max window size in tokens
  usagePct5h?:  number   // 0–1, five_hour rate limit
  usagePct7d?:  number   // 0–1, seven_day rate limit
  // Absolute timestamps (ms since epoch) at which the corresponding rate
  // limit window resets. Sourced from Claude statusLine's
  // `rate_limits.<bucket>.resets_at` ISO field when present; absent =
  // older Claude Code build that doesn't surface it. Renderer formats
  // these into countdown hints on hover.
  reset5hAt?:   number
  reset7dAt?:   number
  // Wall-clock ms at which this observation was taken. Rides with the cached
  // metrics (so a replay carries the ORIGINAL time, not the replay's) and
  // through persistence. The renderer needs it because 5h/7d are account-level
  // but arrive per-terminal: an idle terminal re-emits a stale snapshot
  // indefinitely, so freshness has to be carried explicitly rather than
  // inferred from the values.
  observedAt?:  number
}

export interface SessionMetricsUpdate extends SessionMetrics {
  sessionId:    number
  model?:       string   // display_name from Claude Code
  // True when this is a replay of the last-known values (the on-wake
  // rebroadcast), not a fresh statusLine observation. The renderer still
  // merges the numbers — repainting a blanked session is the whole point —
  // but must not treat a replayed contextPct as a new band crossing, or
  // waking the machine pops the compact/hand-off prompt off a reading the
  // session already had before it slept.
  replay?:      boolean
}

export type SessionMode = 'anthropic' | 'api' | 'codex'

export type SessionOrigin = 'ccc-managed' | 'external'

export type SessionRecoveryCapability = 'full' | 'best-effort' | 'basic'

export interface SessionRestored {
  sessionId:    number
  workspace:    string
  name:         string
  modelId:      string
  // Last real model display name seen on the statusLine (e.g. "Opus 4.8"),
  // remembered by the main process so a session rebuilt after sleep / long
  // idle / app restart shows its true model immediately instead of falling
  // back to the launch alias or "—" while it waits for a fresh statusLine.
  model?:       string
  // Last-known numeric metrics (context %, 5h/7d usage, reset times), remembered
  // by the main process for the same reason as `model`: a rebuilt idle session
  // shows its real numbers immediately instead of 0 until the next statusLine
  // (which never arrives while the session is idle). Absent until the session
  // has emitted at least one statusLine carrying them.
  metrics?:     SessionMetrics
  mode:         SessionMode
  origin:       SessionOrigin
  capability:   SessionRecoveryCapability
  apiProviderId?: string
  apiModelId?:    string
  codexModelId?:  string
  startedAt?:     number
}
