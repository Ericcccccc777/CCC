import type {
  SessionLifecycleState,
  SessionMode,
  SessionOrigin,
  SessionRecoveryCapability,
  ToolPermission,
  SessionStateUpdate,
  SessionMetricsUpdate,
  SessionRestored,
} from '../../shared/session-state'
import type { PlatformCapabilities } from '../../shared/platform'
import type {
  ApiProviderConfig, ApiProviderId, ApiProviderListEntry, ApiTestResult,
} from '../../shared/api-provider'
import type { ApiBalanceSnapshot, ApiUsageSnapshot } from '../../shared/api-usage'
import type { CodexReasoningEffort } from '../../shared/codex-cli'

export type {
  SessionLifecycleState,
  SessionStateUpdate,
  SessionMetricsUpdate,
  SessionRestored,
}

export type AppState = SessionLifecycleState

export interface SessionNotification {
  type:       'done' | 'permission' | 'message'
  hookKey?:   string
  tool?:      string
  toolInput?: unknown
  message?:   string
}

export interface Session {
  readonly id:          number
  readonly workspace:   string
  modelId:              string  // mutable now: API restart can change it in place (Chunk C)
  name:                 string
  model:                string
  contextPct:           number
  usagePct:             number
  weeklyPct:            number
  // Reset timestamps (ms epoch) for the 5h / 7d rate-limit windows;
  // 0 = unknown (older Claude Code builds don't surface them).
  reset5hAt:            number
  reset7dAt:            number
  state:                SessionLifecycleState
  notification:         SessionNotification | null
  lastActivityAt:       number
  // 'anthropic' = stock Claude Cloud (default). 'api' = third-party
  // Anthropic-compatible endpoint via env-var injection (DeepSeek in V1).
  // 'codex' = standalone Codex CLI session (spawns `codex` binary directly).
  mode:                 SessionMode
  origin?:              SessionOrigin
  recoveryCapability?:  SessionRecoveryCapability
  apiProviderId?:       ApiProviderId
  apiModelId?:          string
  codexModelId?:        string
  codexMetrics?:        CodexSessionMetrics
}

export interface CodexSessionMetrics {
  contextPercent?:        number
  fiveHourUsagePercent?:  number
  weeklyUsagePercent?:    number
  sessionStartedAt:       number
  lastActivityAt?:        number
  reasoningEffort?:       CodexReasoningEffort | string
}

export type { CodexReasoningEffort }

export interface ModelInfo {
  readonly id:          string
  readonly switchAlias: string   // short alias for /model command (e.g. 'sonnet')
  readonly name:        string
  readonly desc:        string
}

export type ActionType = 'allow' | 'deny' | 'stop'

export interface CccBridge {
  getPlatformCapabilities: () => Promise<PlatformCapabilities>
  setIgnoreMouseEvents:   (ignore: boolean) => void
  openFolderDialog:       () => Promise<string | null>
  launchSession:          (workspace: string, modelId: string) => Promise<{ sessionId: number }>
  killSession:            (sessionId: number) => void
  onSessionClosed:        (cb: (sessionId: number) => void) => () => void
  onSessionStateChanged:  (cb: (update: SessionStateUpdate) => void) => () => void
  onSessionMetricsUpdated:(cb: (update: SessionMetricsUpdate) => void) => () => void
  sendHookDecision:       (hookKey: string, exitCode: number) => void
  allowToolAlways:        (sessionId: number, tool: string) => void
  switchSessionModel:     (sessionId: number, alias: string) => void
  injectConsoleText:      (sessionId: number, text: string) => void
  focusSession:           (sessionId: number) => void
  onSessionRestored:      (cb: (data: SessionRestored) => void) => () => void
  setMainHeight:          (height: number | null) => void
  // Remote mirror
  getLocalMirrorUrl:      (sessionId: number) => Promise<string>
  // macOS: open System Settings → Accessibility
  openAccessibilitySettings: () => void
  // API providers (DeepSeek + future Anthropic-compatible endpoints)
  apiProviderList:     () => Promise<ApiProviderListEntry[]>
  apiProviderSave:     (config: ApiProviderConfig, key: string) => Promise<{ ok: true } | { ok: false; error: string }>
  apiProviderSetModel: (id: ApiProviderId, modelId: string) => Promise<void>
  apiProviderRemove:   (id: ApiProviderId) => Promise<void>
  apiProviderTest:     (config: ApiProviderConfig, key: string) => Promise<ApiTestResult>
  apiSessionRestart:   (sessionId: number, providerId: ApiProviderId, modelId: string) => Promise<{ ok: true } | { ok: false; error: string }>
  apiSessionLaunchNew: (workspace: string, providerId: ApiProviderId, modelId: string) => Promise<{ ok: true; sessionId: number } | { ok: false; error: string }>
  onApiSessionSwitched:(cb: (data: { sessionId: number; providerId: ApiProviderId; modelId: string }) => void) => () => void
  // Chunk E — runtime usage / balance broadcasts
  onApiBalanceUpdate:  (cb: (snapshot: ApiBalanceSnapshot) => void) => () => void
  onApiUsageUpdate:    (cb: (snapshot: ApiUsageSnapshot)   => void) => () => void
  // Claude Code CLI — user-managed binary.
  // detect = cached (60s TTL); redetect = force-refresh (Settings).
  claudeCliDetect:   () => Promise<import('../../shared/claude-cli').ClaudeCliStatus>
  claudeCliRedetect: () => Promise<import('../../shared/claude-cli').ClaudeCliStatus>
  // Codex CLI — standalone session engine
  codexCliDetect:    () => Promise<import('../../shared/codex-cli').CodexCliStatus>
  codexCliRedetect:  () => Promise<import('../../shared/codex-cli').CodexCliStatus>
  codexCliLaunch:  (workspace: string, modelId: string) => Promise<{ ok: true; sessionId: number } | { ok: false; error: string }>
  codexCliSelectModel: (sessionId: number, modelMenuIndex: number, effort: CodexReasoningEffort) => void
  listKnownSessions: () => Promise<readonly SessionRestored[]>
}

export type { ToolPermission }

declare global {
  interface Window {
    ccc: CccBridge
  }
}
