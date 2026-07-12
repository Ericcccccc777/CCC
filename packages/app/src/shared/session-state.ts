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

export interface SessionMetricsUpdate {
  sessionId:    number
  model?:       string   // display_name from Claude Code
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
  mode:         SessionMode
  origin:       SessionOrigin
  capability:   SessionRecoveryCapability
  apiProviderId?: string
  apiModelId?:    string
  codexModelId?:  string
  startedAt?:     number
}
