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
  mode:         SessionMode
  origin:       SessionOrigin
  capability:   SessionRecoveryCapability
  apiProviderId?: string
  apiModelId?:    string
  codexModelId?:  string
  startedAt?:     number
}
