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
import type { HarnessConfig } from './harness-types'
import type {
  MagiEnvId, MagiEnvReport, MagiInstalledResult, MagiOpResult, MagiProgress,
} from '../../shared/magi'
import type {
  ApiProviderConfig, ApiProviderId, ApiProviderListEntry, ApiTestResult,
} from '../../shared/api-provider'
import type { ApiBalanceSnapshot, ApiUsageSnapshot } from '../../shared/api-usage'
import type { CodexReasoningEffort } from '../../shared/codex-cli'
import type { ClaudeReasoningEffort } from '../../shared/claude-cli'

export interface HarnessGenerateResult {
  path:          string
  backedUpFrom?: string
  appendedTo?:   string
}

export type {
  SessionLifecycleState,
  SessionStateUpdate,
  SessionMetricsUpdate,
  SessionRestored,
}

export type AppState = SessionLifecycleState

// Where the pill currently lives on screen. `default` = the historical
// top-center 400×520 window. `top-hidden` = auto-hide strip at top center
// that peeks out on hover or notification. `corner-shrunk` = circle at the
// top-left corner. Drag mode (entered via long-press on the pill body) is
// transient and not persisted — restart always returns to `default`.
export type OverlayMode = 'default' | 'top-hidden' | 'corner-shrunk'

export interface SessionNotification {
  type:       'done' | 'permission' | 'message'
  hookKey?:   string
  tool?:      string
  toolInput?: unknown
  message?:   string
}

// The account-level rate-limit picture, reconciled across every terminal.
// 5h / 7d usage belong to the Anthropic ACCOUNT, but they only ever arrive
// per-terminal on a statusLine, and an idle terminal keeps re-reporting a
// stale snapshot. `observedAt` is what lets the newest report win.
export interface AccountUsage {
  // Undefined means "never observed", which must not be conflated with 0 —
  // an empty ring labelled "0" reads as a real reading of zero usage.
  usagePct?:   number   // 0-1, five_hour
  weeklyPct?:  number   // 0-1, seven_day
  reset5hAt?:  number   // ms epoch
  reset7dAt?:  number   // ms epoch
  observedAt:  number   // ms epoch at which the CLI SAMPLED this (not arrival)
}

export interface Session {
  readonly id:          number
  readonly workspace:   string
  modelId:              string  // mutable now: API restart can change it in place (Chunk C)
  name:                 string
  model:                string
  // Undefined until a statusLine reports it. Deliberately NOT seeded to 0: a
  // ring painted "0" is indistinguishable from a real zero reading, so a
  // session whose feed never arrived looked like a confident measurement.
  contextPct?:          number
  // Absolute context-window figures from statusLine (optional — older CLI builds
  // or early in a session may omit them). Drives the "137k / 1M" hover.
  contextTokens?:       number
  contextWindowSize?:   number
  // NOTE: no per-session 5h / weekly fields. Those are account-level, and
  // keeping a private copy per session is what made terminals disagree; they
  // live in a single AccountUsage store reconciled across terminals.
  state:                SessionLifecycleState
  notification:         SessionNotification | null
  // Queue of unanswered parallel permission requests. When Claude makes
  // parallel tool calls, multiple PreToolUse hooks fire ~simultaneously;
  // each becomes its own SESSION_STATE_CHANGED event. Without this queue
  // the second arrival overwrites the first in `notification` and the
  // user only sees the latest popup — the earlier hook silently auto-
  // allows via its server-side timeout. Renderer pushes incoming
  // permission updates here while another is showing; dismissing /
  // answering the current one pops the next from the queue.
  pendingPermissions:   ToolPermission[]
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
  // True once the user enabled Claude Code native Remote Control on this session
  // (drives it from phone/web; CCC defers permissions to native). Shows an RC badge.
  remote?:              boolean
  // Last reasoning-effort the user picked for this (anthropic) session via the
  // model picker's effort row. Optimistic — Claude Code doesn't echo the active
  // effort back, so this reflects the user's selection only (used to highlight
  // the chosen chip). Undefined until they pick one.
  reasoningEffort?:     ClaudeReasoningEffort
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
export type { ClaudeReasoningEffort }

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
  launchSession:          (workspace: string, modelId: string, skipPermissions?: boolean) => Promise<{ sessionId: number }>
  killSession:            (sessionId: number) => void
  onSessionClosed:        (cb: (sessionId: number) => void) => () => void
  onSessionStateChanged:  (cb: (update: SessionStateUpdate) => void) => () => void
  onSessionMetricsUpdated:(cb: (update: SessionMetricsUpdate) => void) => () => void
  sendHookDecision:       (hookKey: string, exitCode: number) => void
  allowToolAlways:        (sessionId: number, tool: string) => void
  switchSessionModel:     (sessionId: number, alias: string) => void
  switchSessionEffort:    (sessionId: number, effort: ClaudeReasoningEffort) => void
  injectConsoleText:      (sessionId: number, text: string) => void
  focusSession:           (sessionId: number) => void
  onSessionRestored:      (cb: (data: SessionRestored) => void) => () => void
  setMainHeight:          (height: number | null) => void
  setOverlayBounds:       (bounds: { x: number; y: number; width: number; height: number }, opts?: { animate?: boolean }) => void
  getWorkArea:            () => Promise<{ x: number; y: number; width: number; height: number }>
  // Harness wizard
  openHarnessWindow:      (workspace: string) => void
  closeHarnessWindow:     () => void
  harnessCheck:           (workspace: string) => Promise<{ hasConfig: boolean; hasClaudeMd: boolean }>
  harnessLoad:            (workspace: string) => Promise<HarnessConfig | null>
  harnessSave:            (workspace: string, config: HarnessConfig) => Promise<void>
  harnessGenerate:        (workspace: string, config: HarnessConfig) => Promise<HarnessGenerateResult>
  // Harness visualization dashboard (read-only project-state viewer)
  openDashboard:          (workspace: string) => void
  harnessRead:            (workspace: string, relPath: string) => Promise<string | null>
  harnessSummary:         (workspace: string) => Promise<import('../../shared/harness').HarnessSummary>
  harnessListSessions:    (workspace: string) => Promise<import('../../shared/harness').SessionListItem[]>
  harnessReadSession:     (workspace: string, sessionId: string) => Promise<import('../../shared/harness').TranscriptMessage[]>
  harnessStats:           (workspace: string) => Promise<import('../../shared/harness').ProjectStats>
  resumeSession:          (workspace: string, sessionId: string) => void
  // CCC-MAGI install flow
  magiCheckInstalled:     (workspace: string) => Promise<MagiInstalledResult>
  magiCheckEnv:           () => Promise<MagiEnvReport>
  magiInstallEnv:         (id: MagiEnvId) => Promise<MagiOpResult>
  magiInstall:            (workspace: string) => Promise<MagiOpResult>
  magiUpdate:             (workspace: string, force?: boolean) => Promise<MagiOpResult>
  onMagiProgress:         (cb: (p: MagiProgress) => void) => () => void
  // Remote mirror
  markSessionRemote:      (sessionId: number) => void
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
  codexCliLaunch:  (workspace: string, modelId: string, skipPermissions?: boolean) => Promise<{ ok: true; sessionId: number } | { ok: false; error: string }>
  codexCliSelectModel: (sessionId: number, modelMenuIndex: number, effort: CodexReasoningEffort) => void
  listKnownSessions: () => Promise<readonly SessionRestored[]>
  // App lifecycle — Settings → Quit. Fire-and-forget; main kills all
  // sessions + stops servers + app.quit()s.
  quitApp:           () => void
}

export type { ToolPermission }

declare global {
  interface Window {
    ccc: CccBridge
  }
}
