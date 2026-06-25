import '@testing-library/jest-dom'
import { configure } from '@testing-library/react'
import { vi } from 'vitest'

// The default findBy*/waitFor timeout (1000ms) is tight for the heavier
// multi-step flows (e.g. opening the engine picker and launching several
// sessions in one test) when the whole suite runs in parallel and CPU is
// contended. Raise it so those resolve reliably; tests that fail for real
// (render-time errors) still fail immediately rather than waiting this out.
configure({ asyncUtilTimeout: 5000 })

// Minimal `window.ccc` stub for renderer-side tests. Components that hit
// the preload bridge during render (e.g. ApiProvidersPanel's mount-time
// list() call) get a no-op response by default. Individual tests can
// override any method with `vi.spyOn(window.ccc, 'method').mock…`.
;(globalThis as unknown as { window: { ccc: Record<string, (...a: unknown[]) => unknown> } }).window ??=
  ({} as { ccc: Record<string, (...a: unknown[]) => unknown> })
;(window as unknown as { ccc: Record<string, (...a: unknown[]) => unknown> }).ccc = {
  getPlatformCapabilities: vi.fn().mockResolvedValue({ platform: 'darwin', needsAccessibilityPermission: false }),
  setIgnoreMouseEvents:    vi.fn(),
  openFolderDialog:        vi.fn().mockResolvedValue(null),
  launchSession:           vi.fn().mockResolvedValue({ sessionId: 0 }),
  killSession:             vi.fn(),
  onSessionClosed:         vi.fn().mockReturnValue(() => {}),
  onSessionStateChanged:   vi.fn().mockReturnValue(() => {}),
  onSessionMetricsUpdated: vi.fn().mockReturnValue(() => {}),
  sendHookDecision:        vi.fn(),
  allowToolAlways:         vi.fn(),
  switchSessionModel:      vi.fn(),
  injectConsoleText:       vi.fn(),
  focusSession:            vi.fn(),
  onSessionRestored:       vi.fn().mockReturnValue(() => {}),
  setMainHeight:           vi.fn(),
  setOverlayBounds:        vi.fn(),
  getWorkArea:             vi.fn().mockResolvedValue({ x: 0, y: 0, width: 1440, height: 900 }),
  openHarnessWindow:       vi.fn(),
  closeHarnessWindow:      vi.fn(),
  harnessCheck:            vi.fn().mockResolvedValue({ hasConfig: false, hasClaudeMd: false }),
  harnessLoad:             vi.fn().mockResolvedValue(null),
  harnessSave:             vi.fn().mockResolvedValue(undefined),
  harnessGenerate:         vi.fn().mockResolvedValue({ path: '' }),
  markSessionRemote:       vi.fn(),
  openAccessibilitySettings: vi.fn(),
  apiProviderList:         vi.fn().mockResolvedValue([]),
  apiProviderSave:         vi.fn().mockResolvedValue({ ok: true }),
  apiProviderSetModel:     vi.fn().mockResolvedValue(undefined),
  apiProviderRemove:       vi.fn().mockResolvedValue(undefined),
  apiProviderTest:         vi.fn().mockResolvedValue({ ok: true, message: 'Connected' }),
  apiSessionRestart:       vi.fn().mockResolvedValue({ ok: true }),
  apiSessionLaunchNew:     vi.fn().mockResolvedValue({ ok: true, sessionId: 1 }),
  onApiSessionSwitched:    vi.fn().mockReturnValue(() => {}),
  onApiBalanceUpdate:      vi.fn().mockReturnValue(() => {}),
  onApiUsageUpdate:        vi.fn().mockReturnValue(() => {}),
  claudeCliDetect:         vi.fn().mockResolvedValue({ installed: true, loggedIn: false, account: null, version: '2.1.119 (Claude Code)' }),
  claudeCliRedetect:       vi.fn().mockResolvedValue({ installed: true, loggedIn: false, account: null, version: '2.1.119 (Claude Code)' }),
  codexCliDetect:          vi.fn().mockResolvedValue({ installed: false, loggedIn: false, email: null, models: [] }),
  codexCliRedetect:        vi.fn().mockResolvedValue({ installed: false, loggedIn: false, email: null, models: [] }),
  codexCliLaunch:          vi.fn().mockResolvedValue({ ok: true, sessionId: 1 }),
  codexCliSelectModel:     vi.fn(),
  listKnownSessions:       vi.fn().mockResolvedValue([]),
  quitApp:                 vi.fn(),
}
