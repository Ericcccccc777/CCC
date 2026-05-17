import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type {
  SessionStateUpdate,
  SessionMetricsUpdate,
  SessionRestored,
} from '../shared/session-state'
import type { PlatformCapabilities } from '../shared/platform'
import type {
  ApiProviderConfig,
  ApiProviderId,
  ApiProviderListEntry,
  ApiTestResult,
} from '../shared/api-provider'
import type { ApiBalanceSnapshot, ApiUsageSnapshot } from '../shared/api-usage'
import type { CodexReasoningEffort } from '../shared/codex-cli'

contextBridge.exposeInMainWorld('ccc', {
  // Renderer asks the main process for the active PlatformAdapter's
  // capabilities — Rule 11 says preload never reads `process.platform`.
  getPlatformCapabilities: (): Promise<PlatformCapabilities> =>
    ipcRenderer.invoke(IPC.PLATFORM_GET_CAPABILITIES),

  setIgnoreMouseEvents: (ignore: boolean): void =>
    ipcRenderer.send(IPC.SET_IGNORE_MOUSE, ignore),

  openFolderDialog: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC.OPEN_FOLDER_DIALOG),

  launchSession: (workspace: string, modelId: string): Promise<{ sessionId: number }> =>
    ipcRenderer.invoke(IPC.LAUNCH_SESSION, workspace, modelId),

  killSession: (sessionId: number): void =>
    ipcRenderer.send(IPC.KILL_SESSION, sessionId),

  onSessionClosed: (cb: (sessionId: number) => void): (() => void) => {
    const h = (_e: IpcRendererEvent, id: number): void => cb(id)
    ipcRenderer.on(IPC.SESSION_CLOSED, h)
    return () => ipcRenderer.removeListener(IPC.SESSION_CLOSED, h)
  },

  onSessionStateChanged: (cb: (update: SessionStateUpdate) => void): (() => void) => {
    const h = (_e: IpcRendererEvent, u: SessionStateUpdate): void => cb(u)
    ipcRenderer.on(IPC.SESSION_STATE_CHANGED, h)
    return () => ipcRenderer.removeListener(IPC.SESSION_STATE_CHANGED, h)
  },

  onSessionMetricsUpdated: (cb: (update: SessionMetricsUpdate) => void): (() => void) => {
    const h = (_e: IpcRendererEvent, u: SessionMetricsUpdate): void => cb(u)
    ipcRenderer.on(IPC.SESSION_METRICS_UPDATED, h)
    return () => ipcRenderer.removeListener(IPC.SESSION_METRICS_UPDATED, h)
  },

  sendHookDecision: (hookKey: string, exitCode: number): void =>
    ipcRenderer.send(IPC.HOOK_DECISION, hookKey, exitCode),

  allowToolAlways: (sessionId: number, tool: string): void =>
    ipcRenderer.send(IPC.ALLOW_TOOL_ALWAYS, sessionId, tool),

  switchSessionModel: (sessionId: number, alias: string): void =>
    ipcRenderer.send(IPC.SWITCH_SESSION_MODEL, sessionId, alias),

  injectConsoleText: (sessionId: number, text: string): void =>
    ipcRenderer.send(IPC.INJECT_CONSOLE_TEXT, sessionId, text),

  focusSession: (sessionId: number): void =>
    ipcRenderer.send(IPC.SESSION_FOCUS, sessionId),

  onSessionRestored: (cb: (data: SessionRestored) => void): (() => void) => {
    const h = (_e: IpcRendererEvent, d: SessionRestored): void => cb(d)
    ipcRenderer.on(IPC.SESSION_RESTORED, h)
    return () => ipcRenderer.removeListener(IPC.SESSION_RESTORED, h)
  },

  // Pass null to restore the default pill height
  setMainHeight: (height: number | null): void =>
    ipcRenderer.send(IPC.MAIN_SET_HEIGHT, height),

  // ── Remote mirror ──
  getLocalMirrorUrl: (sessionId: number): Promise<string> =>
    ipcRenderer.invoke(IPC.REMOTE_MIRROR_URL, sessionId),

  openAccessibilitySettings: (): void =>
    ipcRenderer.send(IPC.OPEN_ACCESSIBILITY_SETTINGS),

  // ── API providers ──
  apiProviderList: (): Promise<ApiProviderListEntry[]> =>
    ipcRenderer.invoke(IPC.API_PROVIDER_LIST),

  apiProviderSave: (config: ApiProviderConfig, key: string): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke(IPC.API_PROVIDER_SAVE, config, key),

  apiProviderSetModel: (id: ApiProviderId, modelId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.API_PROVIDER_SET_MODEL, id, modelId),

  apiProviderRemove: (id: ApiProviderId): Promise<void> =>
    ipcRenderer.invoke(IPC.API_PROVIDER_REMOVE, id),

  apiProviderTest: (config: ApiProviderConfig, key: string): Promise<ApiTestResult> =>
    ipcRenderer.invoke(IPC.API_PROVIDER_TEST, config, key),

  // Session-level: restart an existing session in API mode (kill + respawn
  // with ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN env). Same sessionId,
  // same workspace; conversation history is not preserved.
  apiSessionRestart: (sessionId: number, providerId: ApiProviderId, modelId: string): Promise<{ ok: true } | { ok: false; error: string }> =>
    ipcRenderer.invoke(IPC.API_SESSION_RESTART, sessionId, providerId, modelId),

  apiSessionLaunchNew: (workspace: string, providerId: ApiProviderId, modelId: string): Promise<{ ok: true; sessionId: number } | { ok: false; error: string }> =>
    ipcRenderer.invoke(IPC.API_SESSION_LAUNCH_NEW, workspace, providerId, modelId),

  onApiSessionSwitched: (cb: (data: { sessionId: number; providerId: ApiProviderId; modelId: string }) => void): (() => void) => {
    const h = (_e: IpcRendererEvent, d: { sessionId: number; providerId: ApiProviderId; modelId: string }): void => cb(d)
    ipcRenderer.on(IPC.API_SESSION_SWITCHED, h)
    return () => ipcRenderer.removeListener(IPC.API_SESSION_SWITCHED, h)
  },

  // ── API runtime usage / balance broadcasts (Chunk E) ──
  onApiBalanceUpdate: (cb: (snapshot: ApiBalanceSnapshot) => void): (() => void) => {
    const h = (_e: IpcRendererEvent, s: ApiBalanceSnapshot): void => cb(s)
    ipcRenderer.on(IPC.API_BALANCE_UPDATE, h)
    return () => ipcRenderer.removeListener(IPC.API_BALANCE_UPDATE, h)
  },

  onApiUsageUpdate: (cb: (snapshot: ApiUsageSnapshot) => void): (() => void) => {
    const h = (_e: IpcRendererEvent, s: ApiUsageSnapshot): void => cb(s)
    ipcRenderer.on(IPC.API_USAGE_UPDATE, h)
    return () => ipcRenderer.removeListener(IPC.API_USAGE_UPDATE, h)
  },

  // ── Claude Code CLI ──
  // detect = cached (60s TTL) — used by the pill expand path; must stay cheap.
  // redetect = forced refresh — Settings → "Check Again" only.
  claudeCliDetect: (): Promise<import('../shared/claude-cli').ClaudeCliStatus> =>
    ipcRenderer.invoke(IPC.CLAUDE_CLI_DETECT),

  claudeCliRedetect: (): Promise<import('../shared/claude-cli').ClaudeCliStatus> =>
    ipcRenderer.invoke(IPC.CLAUDE_CLI_REDETECT),

  // ── Codex CLI ──
  codexCliDetect: (): Promise<import('../shared/codex-cli').CodexCliStatus> =>
    ipcRenderer.invoke(IPC.CODEX_CLI_DETECT),

  codexCliRedetect: (): Promise<import('../shared/codex-cli').CodexCliStatus> =>
    ipcRenderer.invoke(IPC.CODEX_CLI_REDETECT),

  codexCliLaunch: (workspace: string, modelId: string): Promise<{ ok: true; sessionId: number } | { ok: false; error: string }> =>
    ipcRenderer.invoke(IPC.CODEX_CLI_LAUNCH, workspace, modelId),

  codexCliSelectModel: (sessionId: number, modelMenuIndex: number, effort: CodexReasoningEffort): void =>
    ipcRenderer.send(IPC.CODEX_CLI_SELECT_MODEL, sessionId, modelMenuIndex, effort),

  listKnownSessions: (): Promise<readonly SessionRestored[]> =>
    ipcRenderer.invoke(IPC.SESSION_LIST_KNOWN),
})
