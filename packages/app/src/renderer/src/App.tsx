import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { Island, MODELS_INFO } from './components/Island'
import { ApiSwitchPopup } from './components/ApiSwitchPopup'
import { CodexSwitchPopup } from './components/CodexSwitchPopup'
import { NewSessionEnginePopup } from './components/NewSessionEnginePopup'
import { QuitConfirmPopup } from './components/QuitConfirmPopup'
import type { AppState, OverlayMode, Session, ActionType, SessionNotification, SessionStateUpdate, SessionMetricsUpdate, SessionRestored, CodexReasoningEffort, ClaudeReasoningEffort } from './types'

// --- Overlay layout constants ----------------------------------------------
// All overlay-mode bounds are derived from these. Single source so the snap
// zones, the resting positions, and the test mocks stay aligned. The pill is
// always anchored to the top of the work area; only x/width/height change.
const PILL_WIDTH       = 400
const PILL_HEIGHT_BASE = 60
// Window padding around the visible content for shadow space. Every
// non-drag window is sized to include this on all sides so the .island
// box-shadow renders fully and isn't clipped at the BrowserWindow edge.
// 16 is enough headroom for the 10px shadow blur + a couple px buffer.
const SHADOW_PAD       = 16
const CORNER_SIZE      = 46
// CORNER_INSET kept ≥ SHADOW_PAD so the window's x/y never goes negative
// after subtracting the pad — keeps bounds-clamping in main process a no-op.
const CORNER_INSET     = 16
const CORNER_NOTIF_W   = 280
const LONG_PRESS_MS    = 400
const DRAG_THRESHOLD   = 6  // px movement before mousedown becomes a drag

type WorkArea = { x: number; y: number; width: number; height: number }
type Bounds   = { x: number; y: number; width: number; height: number }
type HoverZone = 'top' | 'corner' | 'default'

interface DragState {
  fromMode:  OverlayMode
  // Pointer in *screen* coordinates. Stored as screen coords because the
  // BrowserWindow resizes on drag-engage, so window-local coords would
  // shift mid-drag. Render-time converts to window-local via workArea.
  screenX:   number
  screenY:   number
  // Cursor offset within the pill at mousedown. Pill renders at
  // (cursor − offset), so whatever the user grabbed (left icon, ring,
  // pill body) stays pinned under the cursor for the entire drag.
  offsetX:   number
  offsetY:   number
  hoverZone: HoverZone | null
}

function notifBudget(n: SessionNotification | null): number {
  if (!n) return 0
  if (n.type === 'permission') return 520
  if (n.type === 'message')    return 90
  if (n.type === 'done')       return 70
  return 0
}

// Height budgets for the App-level floating popups that render as siblings
// of Island inside .island-wrapper. The window MUST include this room or
// the popup paints below the BrowserWindow's bottom edge and gets clipped.
// Numbers track each popup's worst-case rendered height + the 6px margin
// the wrapper flow gives between siblings.
const POPUP_ENGINE_PICKER = 290   // .engine-picker-popup (title + hint + perm toggle + warning + 2 buttons)
const POPUP_API_SWITCH    = 230   // .api-switch-popup
const POPUP_CODEX_SWITCH  = 240   // .codex-switch-popup (effort buttons row)
const POPUP_QUIT_CONFIRM  = 180   // .quit-confirm-popup

// Total pill window height for a given UI state. Returns the minimum
// height the BrowserWindow must have so every visible element (pill +
// any popup stacked below it inside the wrapper) renders without being
// clipped. Single source of truth — App.tsx targetBounds and Island
// height-management both read from this.
function computePillHeight(opts: {
  expanded:                 boolean
  showSettings:             boolean
  showModelPicker:          boolean
  notification:             SessionNotification | null
  remotePopupSessionId:     number | null
  pendingEngineWorkspace:   boolean
  pendingApiSwitch:         boolean
  pendingCodexSwitch:       boolean
  showQuitConfirm:          boolean
}): number {
  if (opts.remotePopupSessionId !== null) return 820
  const budget = notifBudget(opts.notification)
  // App-level floating popups stack below the pill in the wrapper flex.
  // Add the tallest one that's currently open — they're mutually exclusive
  // by UX (only one at a time) so we don't need to sum them, but use max
  // defensively in case two ever land in the same render.
  let popupBudget = 0
  if (opts.pendingEngineWorkspace) popupBudget = Math.max(popupBudget, POPUP_ENGINE_PICKER)
  if (opts.pendingApiSwitch)       popupBudget = Math.max(popupBudget, POPUP_API_SWITCH)
  if (opts.pendingCodexSwitch)     popupBudget = Math.max(popupBudget, POPUP_CODEX_SWITCH)
  if (opts.showQuitConfirm)        popupBudget = Math.max(popupBudget, POPUP_QUIT_CONFIRM)
  if (!opts.expanded && !opts.showModelPicker && budget === 0 && popupBudget === 0) {
    return PILL_HEIGHT_BASE
  }
  let h = opts.expanded ? 520 : PILL_HEIGHT_BASE
  // Picker has up to 3 rows (anthropic + deepseek + codex) plus padding.
  // The pre-refactor MAIN_SET_HEIGHT had a 520 min-clamp that masked the
  // need for an accurate number; now that the overlay window is sized
  // exactly to content, the budget has to actually fit. 220 covers the
  // worst case (all rows + per-chip name/desc) with a small buffer.
  if (opts.showModelPicker) h += 220
  if (opts.showSettings)    h  = Math.max(h, 840)
  if (budget > 0)           h += budget
  if (popupBudget > 0)      h += popupBudget
  return h
}

// Snap-zone rects in *screen* coords. Three discrete drop targets:
//   - corner: top-left square → corner-shrunk mode (circle)
//   - top:    thin band along the very top edge → top-hidden mode (strip)
//   - default: pill-shaped box at top-center, just below the hide strip →
//              default mode (the resting position the pill normally sits at)
// Layout is non-overlapping so each is a distinct visible target; corner
// still gets priority on hit-test for safety against future tweaks.
const SNAP_CORNER_SIZE   = 168
const SNAP_HIDE_HEIGHT   = 36
const SNAP_HIDE_WIDTH    = 280
const SNAP_DEFAULT_GAP   = 12      // gap between hide band and default box
const SNAP_DEFAULT_WIDTH = 440
const SNAP_DEFAULT_H     = 84

function cornerZoneRect(wa: WorkArea): Bounds {
  return { x: wa.x, y: wa.y, width: SNAP_CORNER_SIZE, height: SNAP_CORNER_SIZE }
}
function hideZoneRect(wa: WorkArea): Bounds {
  return {
    x: wa.x + Math.floor((wa.width - SNAP_HIDE_WIDTH) / 2),
    y: wa.y,
    width:  SNAP_HIDE_WIDTH,
    height: SNAP_HIDE_HEIGHT,
  }
}
function defaultZoneRect(wa: WorkArea): Bounds {
  return {
    x: wa.x + Math.floor((wa.width - SNAP_DEFAULT_WIDTH) / 2),
    y: wa.y + SNAP_HIDE_HEIGHT + SNAP_DEFAULT_GAP,
    width:  SNAP_DEFAULT_WIDTH,
    height: SNAP_DEFAULT_H,
  }
}
function pointInRect(x: number, y: number, r: Bounds): boolean {
  return x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height
}
function classifyHoverZone(x: number, y: number, wa: WorkArea): HoverZone | null {
  if (pointInRect(x, y, cornerZoneRect(wa)))  return 'corner'
  if (pointInRect(x, y, hideZoneRect(wa)))    return 'top'
  if (pointInRect(x, y, defaultZoneRect(wa))) return 'default'
  return null
}
import type { ApiProviderId, ApiProviderListEntry } from '../../shared/api-provider'
import type { ApiBalanceSnapshot, ApiUsageSnapshot } from '../../shared/api-usage'
import type { ClaudeCliStatus } from '../../shared/claude-cli'
import type { CodexCliStatus } from '../../shared/codex-cli'
import { FALLBACK_CODEX_MODELS } from '../../shared/codex-cli'

function basenameOf(p: string): string {
  return p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p
}

// Advance the per-session permission queue: when the currently-shown
// permission popup is dismissed or answered, pop the next queued one
// (set as the new notification, keep state='waiting') OR if the queue
// is empty, fall back to the caller's onEmpty policy. Centralises the
// "show next permission" logic so every dismiss path stays consistent.
//   - 'streaming': caller answered the popup → start the Claude tool
//                  immediately if no queue; icon flips to streaming.
//   - 'preserve' : caller just closed the popup (dismissNotif) without
//                  answering → keep the lifecycle state unchanged so
//                  the icon doesn't lie about Claude's actual state.
export function advancePermissionQueue(
  s: Session,
  opts: { stateWhenEmpty: AppState | 'preserve' },
): Session {
  const [next, ...rest] = s.pendingPermissions
  if (next) {
    return {
      ...s,
      notification:       { type: 'permission' as const, ...next },
      pendingPermissions: rest,
      state:              'waiting' as const,
      lastActivityAt:     Date.now(),
    }
  }
  return {
    ...s,
    notification:       null,
    pendingPermissions: [],
    state:              opts.stateWhenEmpty === 'preserve' ? s.state : opts.stateWhenEmpty,
    lastActivityAt:     Date.now(),
  }
}

// Strip "Claude " prefix and look up in MODELS_INFO; returns '' if not found
function canonicalModelId(displayName: string): string {
  const stripped = displayName.replace(/^Claude\s+/i, '')
  return MODELS_INFO.find(m => m.name === stripped)?.id ?? ''
}

function sessionFromRestored(data: SessionRestored): Session {
  const now = Date.now()
  const model = data.mode === 'codex'
    ? data.codexModelId ?? data.modelId
    : (data.apiModelId ?? data.modelId ?? '—')
  return {
    id:            data.sessionId,
    workspace:     data.workspace,
    modelId:       data.modelId,
    name:          data.name,
    model:         model || '—',
    contextPct:    0,
    usagePct:      0,
    weeklyPct:     0,
    reset5hAt:     0,
    reset7dAt:     0,
    state:         'idle',
    notification:  null,
    pendingPermissions: [],
    lastActivityAt: now,
    mode:          data.mode,
    origin:        data.origin,
    recoveryCapability: data.capability,
    ...(data.apiProviderId && { apiProviderId: data.apiProviderId as ApiProviderId }),
    ...(data.apiModelId && { apiModelId: data.apiModelId }),
    ...(data.codexModelId && { codexModelId: data.codexModelId }),
    ...(data.mode === 'codex' && {
      codexMetrics: {
        sessionStartedAt: data.startedAt ?? now,
        lastActivityAt: now,
      },
    }),
  }
}

export function App(): JSX.Element {
  const [sessions, setSessions]               = useState<Session[]>([])
  const [activeId, setActiveId]               = useState<number | null>(null)
  const [expanded, setExpanded]               = useState(false)
  const [showModelPicker, setShowModelPicker] = useState(false)
  const [defaultModelId, setDefaultModelId]   = useState('')
  const [isSwitchingModel, setIsSwitchingModel] = useState(false)
  const [remotePopupSessionId, setRemotePopupSessionId] = useState<number | null>(null)
  const [showAccessibilityWarning, setShowAccessibilityWarning] = useState(false)
  const [apiProviders, setApiProviders]       = useState<ApiProviderListEntry[]>([])
  const [pendingApiSwitch, setPendingApiSwitch] = useState<{ providerId: ApiProviderId; modelId: string } | null>(null)
  const [apiSwitchBusy, setApiSwitchBusy]     = useState(false)
  const [claudeStatus, setClaudeStatus]       = useState<ClaudeCliStatus | null>(null)
  const [codexStatus, setCodexStatus]         = useState<CodexCliStatus | null>(null)
  const [pendingCodexSwitch, setPendingCodexSwitch] = useState<{ modelId: string } | null>(null)
  const [pendingEngineWorkspace, setPendingEngineWorkspace] = useState<string | null>(null)
  const [newSessionBusy, setNewSessionBusy]   = useState(false)
  const [showQuitConfirm, setShowQuitConfirm] = useState(false)
  const [backgroundNotification, setBackgroundNotification] = useState<SessionNotification | null>(null)
  // Showing the Settings sub-panel inside the expanded panel. Lifted out of
  // Island.tsx so window-bounds computation in non-default overlay modes can
  // see it (otherwise the bounds effect would not know to budget the 840px
  // tall settings height).
  const [showSettings, setShowSettings] = useState(false)
  // --- Overlay mode (hide-to-top / shrink-to-corner) -----------------------
  const [overlayMode, setOverlayMode] = useState<OverlayMode>('default')
  // top-hidden: the pill is "peeking out" right now. Driven by hover on the
  // strip, by the presence of a notification, or by expanded === true. The
  // window also resizes from strip → pill while this is true.
  const [overlayPeek, setOverlayPeek] = useState(false)
  const [dragState,   setDragState]   = useState<DragState | null>(null)
  const [workArea,    setWorkArea]    = useState<WorkArea | null>(null)
  // Corner-mode "Session complete" banner auto-hides 3s after state→done.
  // Tracked here so the corner banner condition can fall back to a bare
  // circle once the timeout fires. Resets on mode-change or state-change.
  const [cornerDoneExpired, setCornerDoneExpired] = useState(false)
  // Corner-mode "待回答" (waiting) banner can be dismissed by clicking the
  // circle. Once dismissed, stays bare until the next state transition —
  // the assistant-msg fallback (HookServer) sometimes lags so this gives
  // the user an explicit "我知道了" affordance.
  const [cornerWaitingDismissed, setCornerWaitingDismissed] = useState(false)
  // Chunk E — DeepSeek balance + per-session token usage. Map keys are
  // providerId for balance (one stream per provider) and sessionId for
  // usage (one stream per session).
  const [apiBalances, setApiBalances] = useState<Record<ApiProviderId, ApiBalanceSnapshot>>({} as Record<ApiProviderId, ApiBalanceSnapshot>)
  const [apiUsage,    setApiUsage]    = useState<Record<number, ApiUsageSnapshot>>({})
  const wrapperRef                            = useRef<HTMLDivElement>(null)
  const pointerPositionRef                    = useRef<{ x: number; y: number } | null>(null)

  // mousemove fires at 60–120 Hz inside the island; without a guard, every
  // event would cross the renderer→main IPC boundary even when the value
  // is unchanged. STABILITY_RULES.md §2.5 mandates that the renderer caches
  // the last-sent value and skips duplicates. `lastIgnoreMouseRef` lives at
  // the component scope so it survives re-renders.
  const lastIgnoreMouseRef = useRef<boolean | null>(null)
  // True between a primary-button mousedown on the pill and its mouseup.
  // Used to (a) block passthrough release mid-press and (b) sanity-check
  // the long-press timer — see the lost-mouseup notes below.
  const primaryPressActiveRef = useRef(false)

  const setIgnoreMouseDeduped = useCallback((ignore: boolean): void => {
    if (lastIgnoreMouseRef.current === ignore) return
    lastIgnoreMouseRef.current = ignore
    window.ccc?.setIgnoreMouseEvents(ignore)
  }, [])

  const releaseMousePassthrough = useCallback((): void => {
    // Never go click-through while the user is physically holding the pill
    // or dragging it. Releasing mid-press makes the OS deliver the coming
    // mouseup to the window underneath, so the renderer never sees it —
    // the long-press timer then fires unopposed and a plain click "sticks"
    // in drag mode. Seen on Windows after an idle period, where Chromium's
    // occlusion throttling flushes stale timers (hover-leave fades, auto-
    // rehide) right as the user clicks.
    if (primaryPressActiveRef.current || dragStateRef.current) return
    setIgnoreMouseDeduped(true)
  }, [setIgnoreMouseDeduped])

  const captureMouseForCcc = useCallback((): void => {
    setIgnoreMouseDeduped(false)
  }, [setIgnoreMouseDeduped])

  const isPointerOverVisibleCcc = useCallback((): boolean => {
    const pos = pointerPositionRef.current
    const island = wrapperRef.current?.querySelector<HTMLElement>('.island')
    if (!pos || !island) return false
    const rect = island.getBoundingClientRect()
    return pos.x >= rect.left
      && pos.x <= rect.right
      && pos.y >= rect.top
      && pos.y <= rect.bottom
  }, [])

  const releaseMousePassthroughUnlessPointerOverCcc = useCallback((): void => {
    if (isPointerOverVisibleCcc()) {
      captureMouseForCcc()
      return
    }
    releaseMousePassthrough()
  }, [captureMouseForCcc, isPointerOverVisibleCcc, releaseMousePassthrough])

  // Reload the API providers list. Called on mount and after the user
  // adds / removes a provider in Settings (the Settings panel doesn't
  // notify us via IPC; instead the model-picker re-fetches on every open).
  const reloadApiProviders = useCallback(async (): Promise<void> => {
    try {
      const list = await window.ccc?.apiProviderList()
      setApiProviders(list ?? [])
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { void reloadApiProviders() }, [reloadApiProviders])

  const reloadClaudeStatus = useCallback(async (): Promise<void> => {
    try {
      const s = await window.ccc?.claudeCliDetect()
      setClaudeStatus(s ?? null)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { void reloadClaudeStatus() }, [reloadClaudeStatus])

  // Reload Codex CLI status. Called on mount and when the user opens
  // settings / model picker so the Codex row stays current.
  const reloadCodexStatus = useCallback(async (): Promise<void> => {
    try {
      const s = await window.ccc?.codexCliDetect()
      setCodexStatus(s ?? null)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { void reloadCodexStatus() }, [reloadCodexStatus])

  const syncKnownSessions = useCallback(async (): Promise<void> => {
    try {
      const known = await window.ccc?.listKnownSessions()
      if (!known || known.length === 0) return
      setSessions(prev => {
        const byId = new Map(prev.map(session => [session.id, session]))
        for (const restored of known) {
          if (!byId.has(restored.sessionId)) {
            byId.set(restored.sessionId, sessionFromRestored(restored))
          }
        }
        return [...byId.values()]
      })
      setActiveId(current => current ?? known[0].sessionId)
    } catch { /* non-fatal: normal restore event path still works */ }
  }, [])

  useEffect(() => {
    void syncKnownSessions()
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void syncKnownSessions()
    }
    const onFocus = (): void => { void syncKnownSessions() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [syncKnownSessions])

  // Listen for api-mode session swaps (kill + respawn with new env).
  // Updates the session record so the UI shows the new model immediately
  // without waiting for the statusline relay to fire.
  useEffect(() => {
    const cleanup = window.ccc?.onApiSessionSwitched(({ sessionId, providerId, modelId }) => {
      setSessions(prev => prev.map(s => s.id === sessionId ? {
        ...s,
        mode:          'api' as const,
        apiProviderId: providerId,
        apiModelId:    modelId,
        modelId,
        // Don't clobber `model` (display name) — statusline relay will
        // overwrite it with whatever DeepSeek reports back. Keep the
        // current value as a placeholder until then.
      } : s))
    })
    return cleanup
  }, [])

  // Probe macOS Accessibility permission once on mount. Renderer never
  // reads process.platform itself (Rule 11) — capabilities come from main.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const caps = await window.ccc?.getPlatformCapabilities()
        if (cancelled || !caps) return
        const missing = caps.platform === 'darwin'
          && caps.needsAccessibilityPermission
          && caps.hasAccessibilityPermissionInitially === false
        setShowAccessibilityWarning(missing)
      } catch { /* IPC unreachable — leave banner hidden */ }
    })()
    return () => { cancelled = true }
  }, [])

  // Re-probe Accessibility permission *only while the banner is showing*, so it
  // clears the moment the user grants it in System Settings — no app restart
  // needed. This effect never runs when permission was already granted at
  // launch (the banner never shows), and it tears itself down the instant a
  // grant is detected, so there's no steady-state polling of the OS. The
  // probe (`isTrustedAccessibilityClient(false)` in main) re-reads the live
  // permission on every call, so a fresh grant surfaces here as `true`.
  useEffect(() => {
    if (!showAccessibilityWarning) return
    let cancelled = false
    const reprobe = async () => {
      try {
        const caps = await window.ccc?.getPlatformCapabilities()
        if (cancelled || !caps) return
        if (caps.hasAccessibilityPermissionInitially === true) {
          setShowAccessibilityWarning(false)
        }
      } catch { /* IPC unreachable — keep banner, retry next tick */ }
    }
    // Instant clear when switching back from System Settings…
    window.addEventListener('focus', reprobe)
    document.addEventListener('visibilitychange', reprobe)
    // …plus a gentle fallback, since the always-on-top click-through overlay
    // may never receive focus events. One cheap syscall every 2s, and it stops
    // the moment permission lands.
    const id = window.setInterval(reprobe, 2_000)
    return () => {
      cancelled = true
      window.removeEventListener('focus', reprobe)
      document.removeEventListener('visibilitychange', reprobe)
      window.clearInterval(id)
    }
  }, [showAccessibilityWarning])

  // Safety timeout: clear spinner if statusLine never fires after a switch
  useEffect(() => {
    if (!isSwitchingModel) return
    const t = setTimeout(() => setIsSwitchingModel(false), 8_000)
    return () => clearTimeout(t)
  }, [isSwitchingModel])

  // Collapsing the expanded panel dismisses the Settings sub-panel — same
  // semantics as when Island.tsx owned this flag locally; lifted up so the
  // bounds calc can see settings height.
  useEffect(() => {
    if (!expanded && showSettings) setShowSettings(false)
  }, [expanded, showSettings])

  // Fetch the primary display's work area once on mount. Renderer needs
  // this in screen coords so drag/snap math is right on multi-monitor or
  // taskbar-offset setups. Re-fetched only on hard restart (workArea won't
  // change at runtime in practice).
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const wa = await window.ccc?.getWorkArea()
        if (!cancelled && wa) setWorkArea(wa)
      } catch { /* fall back to no overlay-mode UI */ }
    })()
    return () => { cancelled = true }
  }, [])

  // Target window bounds — derived from the full overlay state. Single source
  // of truth so we can't end up with a 6×96 strip showing a 400×520 pill or
  // vice versa. Drag mode goes through a separate effect (window is sized to
  // the full work area for the duration of the drag so the pill can float to
  // any cursor position).
  const overlayActiveSession   = sessions.find(s => s.id === activeId) ?? sessions[0] ?? null
  const overlayNotification: SessionNotification | null =
    overlayActiveSession?.notification ?? backgroundNotification
  const overlayState: AppState = overlayActiveSession?.state ?? 'idle'
  // 3-second auto-hide for the corner "Session complete" banner. The timer
  // is armed ONLY on a state→done transition; mode changes never re-arm
  // it. That means dragging corner → default → corner while still on a
  // done state goes straight to the bare circle (the banner already had
  // its 3s in whichever mode the user was in when done fired). The next
  // banner appears only on the NEXT done transition.
  //
  // overlayMode and cornerDoneExpired are intentionally NOT in deps:
  //   - overlayMode in deps would re-arm on mode change (the bug above).
  //   - cornerDoneExpired in deps would loop: timer sets it true, effect
  //     re-runs, sets it back to false, starts new timer (a previous bug).
  // The single dep [overlayState] is sufficient: state change to/from done
  // is the only event that should toggle the armed timer.
  useEffect(() => {
    if (overlayState !== 'done') {
      setCornerDoneExpired(false)
      return
    }
    setCornerDoneExpired(false)
    const t = window.setTimeout(() => setCornerDoneExpired(true), 3000)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayState])
  // Reset waiting-dismiss whenever state changes — so a brand-new
  // waiting transition (post-streaming → next question) shows the banner
  // again, even if the user had dismissed the previous one. Same
  // single-dep policy as cornerDoneExpired above.
  useEffect(() => {
    setCornerWaitingDismissed(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayState])
  const hasCornerHint =
    overlayMode === 'corner-shrunk'
    && ((overlayState === 'waiting'
         || (overlayState === 'done' && !cornerDoneExpired))
        || overlayNotification !== null)

  const targetBounds: Bounds | null = useMemo(() => {
    if (!workArea) return null
    if (dragState) {
      return { x: workArea.x, y: workArea.y, width: workArea.width, height: workArea.height }
    }
    // ── Single overlay-window architecture ──
    // All non-drag modes share ONE BrowserWindow: full work-area width, at
    // the top of the work area. CSS positions visible content (pill, strip,
    // circle, expanded panel) inside this window. Modes never trigger a
    // window resize/reposition — only the *height* grows to accommodate
    // expand/notification/picker, which is the only resize the user sees.
    //
    // Why: small transparent BrowserWindows on macOS (e.g. the previous
    // 78×78 corner mode) hit Electron+CoreAnimation edge cases where the
    // un-painted area renders as the OS default background (white in
    // Light mode). A wide window with most of its pixels painted alpha=0
    // by the renderer chain avoids that path entirely.
    const h = computePillHeight({
      expanded, showSettings, showModelPicker,
      notification: overlayNotification, remotePopupSessionId,
      pendingEngineWorkspace: pendingEngineWorkspace !== null,
      pendingApiSwitch:       pendingApiSwitch !== null,
      pendingCodexSwitch:     pendingCodexSwitch !== null,
      showQuitConfirm,
    })
    // Default + top-hidden: window height = pill height (60 collapsed,
    // dynamic when expanded / picker open / notification budget added).
    // Top-hidden needs a *vertical hover buffer*: the body's mouseleave
    // drives auto-hide, and a 60px-tall window will fire mouseleave on
    // even small downward cursor jitter past the pill (~y=46). 120px
    // gives the user ~70px of forgiving area below the pill before the
    // re-hide grace starts. Window stays transparent so the extra area
    // doesn't visibly affect anything; click-passthrough is preserved.
    if (overlayMode === 'default' || overlayMode === 'top-hidden') {
      const minH = overlayMode === 'top-hidden' ? 120 : PILL_HEIGHT_BASE
      return {
        x: workArea.x, y: workArea.y,
        width: workArea.width, height: Math.max(minH, h),
      }
    }
    // corner-shrunk: window height = visible corner content + top inset +
    // shadow space below. The .island sits at CSS top:CORNER_INSET, so we
    // need enough vertical room for whatever variant is showing PLUS any
    // app-level floating popup (engine picker, api/codex switch, quit
    // confirm) stacked below it.
    let popupBudget = 0
    if (pendingEngineWorkspace !== null) popupBudget = Math.max(popupBudget, POPUP_ENGINE_PICKER)
    if (pendingApiSwitch !== null)       popupBudget = Math.max(popupBudget, POPUP_API_SWITCH)
    if (pendingCodexSwitch !== null)     popupBudget = Math.max(popupBudget, POPUP_CODEX_SWITCH)
    if (showQuitConfirm)                 popupBudget = Math.max(popupBudget, POPUP_QUIT_CONFIRM)
    const popupGap = popupBudget > 0 ? 6 : 0
    let cornerHeight: number
    if (expanded || showModelPicker || remotePopupSessionId !== null) {
      // Expanded panel mode — the `.island` itself is full-sized (h
      // already accounts for everything stacked inside the pill, including
      // popup budgets via computePillHeight above).
      cornerHeight = CORNER_INSET + h + SHADOW_PAD
    } else if (hasCornerHint) {
      const popupH = notifBudget(overlayNotification)
      cornerHeight = CORNER_INSET + CORNER_SIZE + popupH + popupGap + popupBudget + SHADOW_PAD
    } else {
      cornerHeight = CORNER_INSET + CORNER_SIZE + popupGap + popupBudget + SHADOW_PAD
    }
    return {
      x: workArea.x, y: workArea.y,
      width: workArea.width, height: cornerHeight,
    }
  }, [workArea, dragState, overlayMode, overlayPeek, expanded, showSettings, showModelPicker, overlayNotification, remotePopupSessionId, hasCornerHint, pendingEngineWorkspace, pendingApiSwitch, pendingCodexSwitch, showQuitConfirm])

  useEffect(() => {
    if (!targetBounds) return
    window.ccc?.setOverlayBounds(targetBounds)
  }, [targetBounds])

  // --- Long-press + drag mechanics -----------------------------------------
  // Long-press starts the moment the user mousedowns the pill body (NOT the
  // model-name button, NOT a ring hover target). After LONG_PRESS_MS without
  // moving more than DRAG_THRESHOLD px, drag mode engages: the window goes
  // fullscreen, the pill becomes position:fixed at the cursor, and snap
  // zones light up. On mouseup, the pointer's hit-zone decides the resting
  // overlayMode.
  const longPressTimerRef    = useRef<number | null>(null)
  const longPressStartRef    = useRef<{ x: number; y: number } | null>(null)
  const dragStateRef         = useRef<DragState | null>(null)
  const overlayModeRef       = useRef<OverlayMode>('default')
  const workAreaRef          = useRef<WorkArea | null>(null)
  const justDraggedRef       = useRef(false)
  // Track the wall-clock of the last notification → null transition so the
  // top-hidden auto-rehide grace can hold the pill out for 2 s after the
  // popup goes away (per the spec).
  const lastNotifClearedAtRef = useRef<number | null>(null)

  useEffect(() => { dragStateRef.current   = dragState   }, [dragState])
  useEffect(() => { overlayModeRef.current = overlayMode }, [overlayMode])
  useEffect(() => { workAreaRef.current    = workArea    }, [workArea])

  const cancelLongPress = useCallback((): void => {
    if (longPressTimerRef.current !== null) {
      window.clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
    longPressStartRef.current = null
  }, [])

  const handlePillPointerDown = useCallback((e: ReactMouseEvent): void => {
    // Drag is disabled while expanded — user said "展开状态无法移动".
    if (expanded || showModelPicker) return
    // Don't trigger from clicks on the model picker button (which is its
    // own action) or on a ring hover target. The pill body is everything
    // else inside .island-pill.
    const t = e.target as HTMLElement
    if (t.closest('.model-name-btn') || t.closest('.ring-hover-target') || t.closest('.usage-cost-badge')) return
    if (e.button !== 0) return  // left-click only
    const startClientX = e.clientX
    const startClientY = e.clientY
    // Snapshot the window's screen position right now. The window is about
    // to be resized when drag engages, which changes window.screenX/Y, so
    // we can't recompute screen coords for the start point after the fact.
    const startWinScreenX = window.screenX
    const startWinScreenY = window.screenY
    // Cursor offset within the pill's bounding box — render-time pins the
    // pill at (cursor − offset) so wherever the user grabbed (the state
    // icon on the left, the ring on the right, etc.) stays under the
    // cursor for the entire drag. Without this the pill snaps so its
    // center jumps to the cursor at drag-engage.
    const pillEl = (e.currentTarget as HTMLElement).closest<HTMLElement>('.island')
    const pillRect = pillEl?.getBoundingClientRect()
    const offsetX = pillRect ? startClientX - pillRect.left : 0
    const offsetY = pillRect ? startClientY - pillRect.top  : 0
    primaryPressActiveRef.current = true
    longPressStartRef.current = { x: startClientX, y: startClientY }
    longPressTimerRef.current = window.setTimeout(() => {
      // Long-press fired — engage drag mode.
      longPressTimerRef.current = null
      // Belt-and-braces: if the press has been released through any path
      // that didn't clear this timer (lost mouseup, blur), never engage.
      if (!primaryPressActiveRef.current) return
      const wa = workAreaRef.current
      if (!wa) return
      // Convert from old-window-local to screen coords using the window
      // position captured at mousedown.
      const screenX = startWinScreenX + startClientX
      const screenY = startWinScreenY + startClientY
      setDragState({
        fromMode:  overlayModeRef.current,
        screenX,
        screenY,
        offsetX,
        offsetY,
        hoverZone: classifyHoverZone(screenX, screenY, wa),
      })
    }, LONG_PRESS_MS)
  }, [expanded, showModelPicker])

  // Settle an engaged drag at the given window-local point. Shared by the
  // normal mouseup path and the lost-mouseup self-heal in onMove below.
  const settleDragAt = useCallback((clientX: number, clientY: number): void => {
    const cur = dragStateRef.current
    if (!cur) return
    const wa = workAreaRef.current
    const screenX = window.screenX + clientX
    const screenY = window.screenY + clientY
    const zone = wa ? classifyHoverZone(screenX, screenY, wa) : null
    // Dropping outside every zone reverts to whichever mode the drag
    // started from — never lose the prior mode by accident.
    const nextMode: OverlayMode =
      zone === 'top'     ? 'top-hidden'    :
      zone === 'corner'  ? 'corner-shrunk' :
      zone === 'default' ? 'default'       :
      cur.fromMode
    // Suppress the trailing click that follows mouseup so the pill doesn't
    // immediately toggle expand after a drag.
    justDraggedRef.current = true
    window.setTimeout(() => { justDraggedRef.current = false }, 150)
    setDragState(null)
    setOverlayMode(nextMode)
    // Entering a new mode resets peek — pill starts collapsed and any
    // hover/notif logic re-opens it from scratch.
    setOverlayPeek(false)
  }, [])

  // Document-level move/up: track pointer for long-press cancellation +
  // drag tracking. Always mounted so the listeners are stable.
  useEffect(() => {
    const onMove = (e: MouseEvent): void => {
      // Self-heal a lost mouseup: if the OS says the primary button is no
      // longer down while a press or drag is still in flight, the mouseup
      // was delivered elsewhere (focus change / passthrough flip — seen on
      // Windows after idle). Treat this move as the missed mouseup so a
      // plain click can never strand the pill in drag mode.
      if ((e.buttons & 1) === 0 && (primaryPressActiveRef.current || dragStateRef.current)) {
        primaryPressActiveRef.current = false
        cancelLongPress()
        settleDragAt(e.clientX, e.clientY)
        return
      }
      // Cancel pending long-press if the user moved before the timer fired
      // (treat that as a normal click-drag, not a long-press).
      const start = longPressStartRef.current
      if (start && longPressTimerRef.current !== null) {
        const dx = e.clientX - start.x
        const dy = e.clientY - start.y
        if (dx * dx + dy * dy > DRAG_THRESHOLD * DRAG_THRESHOLD) cancelLongPress()
      }
      // Update drag position once engaged. Window is fullscreen-sized during
      // drag, so window.screenX/Y track workArea.x/y and we can derive
      // screen coords from e.clientX/Y consistently.
      const cur = dragStateRef.current
      if (cur) {
        const wa = workAreaRef.current
        const screenX = window.screenX + e.clientX
        const screenY = window.screenY + e.clientY
        const zone = wa ? classifyHoverZone(screenX, screenY, wa) : null
        setDragState({ ...cur, screenX, screenY, hoverZone: zone })
      }
    }
    const onUp = (e: MouseEvent): void => {
      // e.buttons on mouseup excludes the button just released, so this
      // clears the press flag exactly when the primary button comes up.
      if ((e.buttons & 1) === 0) primaryPressActiveRef.current = false
      cancelLongPress()
      settleDragAt(e.clientX, e.clientY)
    }
    // Focus loss / occlusion mid-press means the mouseup will be delivered
    // elsewhere — a pending long-press must not engage drag afterwards.
    const onFocusLost = (): void => {
      primaryPressActiveRef.current = false
      cancelLongPress()
    }
    const onVisibilityChange = (): void => {
      if (document.visibilityState !== 'visible') onFocusLost()
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    window.addEventListener('blur', onFocusLost)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      window.removeEventListener('blur', onFocusLost)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [cancelLongPress, settleDragAt])

  // Auto-peek for top-hidden mode:
  //   - When a notification fires: peek out (pill + popup visible).
  //   - 2 s after the notification clears AND the user isn't hovering and
  //     hasn't expanded: re-hide to strip.
  // Hover is the other peek trigger and is wired through the strip element
  // directly (setOverlayPeek(true) on enter, leave starts a short fade).
  useEffect(() => {
    if (overlayMode !== 'top-hidden') {
      lastNotifClearedAtRef.current = null
      return
    }
    if (overlayNotification !== null) {
      setOverlayPeek(true)
      lastNotifClearedAtRef.current = null
      return
    }
    // Notification just cleared → start 2s grace, then re-hide unless
    // the user kept the pill out via hover/expand.
    lastNotifClearedAtRef.current = Date.now()
    const t = window.setTimeout(() => {
      if (overlayModeRef.current !== 'top-hidden') return
      if (expanded || showModelPicker) return
      setOverlayPeek(false)
    }, 2000)
    return () => window.clearTimeout(t)
  }, [overlayMode, overlayNotification, expanded, showModelPicker])

  // Top-hidden peek detection. The BrowserWindow stays pill-sized (no resize)
  // and is in passthrough mode while peek=false (setIgnoreMouseEvents(true,
  // forward:true)). With forward:true the renderer still receives DOM mouse
  // events for cursor positions inside the window — so we can use plain
  // document-level enter/leave on the body element:
  //   - Cursor enters the window → peek = true (pill slides in).
  //   - Cursor leaves the window → peek = false after a 280ms grace so a
  //     momentary off-by-1 at the screen edge doesn't snap it back.
  // Mid-window stillness keeps peek=true (no timer running unless leave
  // actually fires), which is the property that was missing in the
  // previous strip-mouseenter/timeout-based implementation.
  useEffect(() => {
    if (overlayMode !== 'top-hidden') return
    let leaveTimer: number | null = null
    const onEnter = (): void => {
      if (leaveTimer !== null) {
        window.clearTimeout(leaveTimer)
        leaveTimer = null
      }
      setOverlayPeek(true)
    }
    const onLeave = (): void => {
      if (leaveTimer !== null) window.clearTimeout(leaveTimer)
      leaveTimer = window.setTimeout(() => {
        // Don't auto-hide if there's still a reason for the pill to be out:
        // active notification, expanded panel, model picker open, etc.
        // 500ms grace (was 280) so a quick out-and-back-in motion doesn't
        // visibly flicker the pill — that was the "突然消失" the user hit.
        if (overlayModeRef.current !== 'top-hidden') return
        if (expanded || showModelPicker || remotePopupSessionId !== null) return
        setOverlayPeek(false)
      }, 500)
    }
    document.body.addEventListener('mouseenter', onEnter)
    document.body.addEventListener('mouseleave', onLeave)
    return () => {
      document.body.removeEventListener('mouseenter', onEnter)
      document.body.removeEventListener('mouseleave', onLeave)
      if (leaveTimer !== null) window.clearTimeout(leaveTimer)
    }
  }, [overlayMode, expanded, showModelPicker, remotePopupSessionId])

  // Stub callbacks the Island still expects on the strip — they're inert
  // now that body-level enter/leave drives peek state, but keeping the
  // props lets Island's render path stay simple.
  const handleStripPointerEnter = useCallback((): void => { /* handled at body level */ }, [])
  const handleOverlayPointerLeave = useCallback((): void => { /* handled at body level */ }, [])

  useEffect(() => {
    const releaseIfPointerIsOutsideCcc = (): void => {
      releaseMousePassthroughUnlessPointerOverCcc()
    }
    const onVisibility = (): void => {
      if (document.visibilityState !== 'visible') releaseMousePassthrough()
    }
    window.addEventListener('blur', releaseIfPointerIsOutsideCcc)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('blur', releaseIfPointerIsOutsideCcc)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [releaseMousePassthrough, releaseMousePassthroughUnlessPointerOverCcc])

  // Collapse when clicking outside the island
  useEffect(() => {
    const handler = (e: MouseEvent): void => {
      pointerPositionRef.current = { x: e.clientX, y: e.clientY }
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowModelPicker(false)
        setExpanded(false)
        setRemotePopupSessionId(null)
        releaseMousePassthrough()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [releaseMousePassthrough])

  // Listen for process exit
  useEffect(() => {
    const cleanup = window.ccc?.onSessionClosed((sessionId: number) => {
      setSessions(prev => {
        const closing = prev.find(s => s.id === sessionId)
        if (!closing) return prev
        if (activeId !== sessionId) {
          const engine = closing.mode === 'codex' ? 'Codex' : (closing.mode === 'api' ? 'DeepSeek' : 'Claude')
          const detail = closing.mode === 'codex'
            ? `${closing.name}/${closing.codexModelId ?? closing.model}`
            : `${closing.name}/${closing.model}`
          setBackgroundNotification({ type: 'message', message: `${engine} · ${detail} process ended` })
        }
        const next = prev.filter(s => s.id !== sessionId)
        setActiveId(cur => {
          if (cur !== sessionId) return cur
          return next.length > 0 ? next[next.length - 1].id : null
        })
        return next
      })
    })
    return cleanup
  }, [activeId])

  // Re-attach sessions that survived system sleep (main process restored them)
  useEffect(() => {
    const cleanup = window.ccc?.onSessionRestored((data: SessionRestored) => {
      setSessions(prev => {
        if (prev.some(s => s.id === data.sessionId)) return prev
        return [...prev, sessionFromRestored(data)]
      })
      setActiveId(id => id ?? data.sessionId)
    })
    return cleanup
  }, [])

  // Listen for hook-based state updates (stop / pretooluse / notification)
  useEffect(() => {
    const cleanup = window.ccc?.onSessionStateChanged((update: SessionStateUpdate) => {
      setSessions(prev => prev.map(s => {
        if (s.id !== update.sessionId) return s
        // When `state` is omitted (e.g. notification-only updates), keep the
        // session's current lifecycle state — don't accidentally flip to busy.
        const nextState = update.state ?? s.state

        // Permission incoming: if there's already a permission being shown,
        // queue the new one behind it (parallel-tool-call case). Otherwise
        // it replaces whatever info-only popup was up. Without this queue
        // the second parallel permission silently overwrites the first;
        // the user sees only the latest popup and the earlier hooks
        // auto-allow via server-side timeout.
        if (update.permission) {
          if (s.notification?.type === 'permission') {
            return {
              ...s,
              state:               nextState,
              pendingPermissions:  [...s.pendingPermissions, update.permission],
              lastActivityAt:      Date.now(),
            }
          }
          return {
            ...s,
            state:           nextState,
            notification:    { type: 'permission', ...update.permission },
            lastActivityAt:  Date.now(),
          }
        }

        const notification: SessionNotification | null =
          update.message    ? { type: 'message',    message: update.message } :
          // Turn finished (stop hook → state 'done'): intentionally show NO
          // popup. The pill's done icon (driven by `state`, not the
          // notification) already signals completion; the "response complete"
          // bubble that used to pop up after every turn added nothing.
          update.state === 'done' ? null :
          // No explicit notification-bearing field and no lifecycle change →
          // keep whatever popup the user is already looking at.
          update.state === undefined ? s.notification :
          null
        return { ...s, state: nextState, notification, lastActivityAt: Date.now() }
      }))

      // Only auto-switch when: no session is selected, OR the session needs attention (waiting)
      setActiveId(cur => {
        if (cur === null) return update.sessionId
        if (update.state === 'waiting') return update.sessionId
        return cur
      })
    })
    return cleanup
  }, [])

  // Chunk E — subscribe to balance + usage broadcasts from ApiUsageManager.
  // Both fire-and-forget; the renderer state is rebuilt from broadcasts on
  // every poll/transcript line, so a missed message just means the next one
  // catches us up (no replay protocol needed).
  useEffect(() => {
    const cleanupBalance = window.ccc?.onApiBalanceUpdate((snapshot: ApiBalanceSnapshot) => {
      setApiBalances(prev => ({ ...prev, [snapshot.providerId]: snapshot }))
    })
    const cleanupUsage = window.ccc?.onApiUsageUpdate((snapshot: ApiUsageSnapshot) => {
      setApiUsage(prev => ({ ...prev, [snapshot.sessionId]: snapshot }))
    })
    return () => { cleanupBalance?.(); cleanupUsage?.() }
  }, [])

  // When a session closes, drop its accumulated usage so a re-used sessionId
  // (rare; only happens after sleep/wake restoration) doesn't show stale
  // numbers from the previous run.
  useEffect(() => {
    const cleanup = window.ccc?.onSessionClosed((sessionId: number) => {
      setApiUsage(prev => {
        if (!(sessionId in prev)) return prev
        const next = { ...prev }
        delete next[sessionId]
        return next
      })
    })
    return cleanup
  }, [])

  // Listen for statusLine metrics (context%, 5h usage, 7d usage, real model name)
  useEffect(() => {
    const cleanup = window.ccc?.onSessionMetricsUpdated((update: SessionMetricsUpdate) => {
      if (update.model !== undefined) {
        setIsSwitchingModel(false)
      }
      setSessions(prev => prev.map(s => {
        if (s.id !== update.sessionId) return s
        return {
          ...s,
          ...(update.model      !== undefined && { model:      update.model }),
          ...(update.contextPct !== undefined && { contextPct: update.contextPct }),
          ...(update.contextTokens     !== undefined && { contextTokens:     update.contextTokens }),
          ...(update.contextWindowSize !== undefined && { contextWindowSize: update.contextWindowSize }),
          ...(update.usagePct5h !== undefined && { usagePct:   update.usagePct5h }),
          ...(update.usagePct7d !== undefined && { weeklyPct:  update.usagePct7d }),
          ...(update.reset5hAt  !== undefined && { reset5hAt:  update.reset5hAt }),
          ...(update.reset7dAt  !== undefined && { reset7dAt:  update.reset7dAt }),
        }
      }))
    })
    return cleanup
  }, [])

  // Derive display values from active session
  const activeSession = sessions.find(s => s.id === activeId) ?? sessions[0] ?? null

  const displayState: AppState = activeSession?.state ?? 'idle'
  const displayModel  = activeSession?.model ?? '—'
  const contextPct        = activeSession?.contextPct ?? 0
  const contextTokens     = activeSession?.contextTokens
  const contextWindowSize = activeSession?.contextWindowSize
  const usagePct      = activeSession?.usagePct   ?? 0
  const weeklyPct     = activeSession?.weeklyPct  ?? 0
  const reset5hAt     = activeSession?.reset5hAt  ?? 0
  const reset7dAt     = activeSession?.reset7dAt  ?? 0
  const notification  = activeSession?.notification ?? backgroundNotification
  // Active session's API usage snapshot (mode === 'api' only). Used by
  // Island to swap the second ring out for a session-cost display.
  const activeApiUsage = activeSession?.mode === 'api'
    ? apiUsage[activeSession.id] ?? null
    : null
  const hasInteractiveOverlay =
    expanded ||
    showModelPicker ||
    remotePopupSessionId !== null ||
    pendingApiSwitch !== null ||
    pendingCodexSwitch !== null ||
    pendingEngineWorkspace !== null ||
    notification !== null

  // When to ALWAYS capture the mouse (no passthrough to the underlying app),
  // regardless of where the cursor sits. Under the single-window architecture
  // every non-drag mode shares a full work-area-wide BrowserWindow, so the
  // visible chrome is a small slice and the rest of the window MUST stay
  // passthrough — otherwise we'd block clicks across the whole top of the
  // user's screen. Capture-always is therefore only for drag mode (where the
  // entire fullscreen canvas is interactive snap-zone territory).
  const overlayCapturesAlways = dragState !== null

  useEffect(() => {
    if (hasInteractiveOverlay || overlayCapturesAlways) {
      captureMouseForCcc()
      return
    }
    releaseMousePassthroughUnlessPointerOverCcc()
  }, [captureMouseForCcc, hasInteractiveOverlay, overlayCapturesAlways, releaseMousePassthroughUnlessPointerOverCcc])

  // Codex models exposed in the picker only when Codex CLI is installed and
  // logged in; otherwise the picker hides the Codex row.
  const codexModels = codexStatus?.installed && codexStatus?.loggedIn
    ? codexStatus.models
    : (codexStatus?.installed ? codexStatus.models : [])

  // Determine selected model ID — match active session's real model if possible
  const activeModelId = activeSession?.mode === 'codex'
    ? activeSession.codexModelId ?? activeSession.modelId
    : activeSession?.mode === 'api'
      ? activeSession.apiModelId ?? activeSession.modelId
      : (activeSession ? canonicalModelId(activeSession.model) : defaultModelId)

  const rememberPointer = (e: ReactMouseEvent): void => {
    pointerPositionRef.current = { x: e.clientX, y: e.clientY }
  }

  const handleMouseEnter = (e: ReactMouseEvent): void => {
    rememberPointer(e)
    captureMouseForCcc()
  }

  const handleMouseMove = (e: ReactMouseEvent): void => {
    rememberPointer(e)
    if (isPointerOverVisibleCcc()) captureMouseForCcc()
  }

  const handleMouseLeave = (): void => {
    pointerPositionRef.current = null
    releaseMousePassthrough()
  }

  // Quit-confirm popup: opening it collapses every nested sub-panel /
  // floating popup so the user sees only the expanded pill + the
  // confirm popup directly below it. The session list stays so the
  // user can read the count from the popup against the rows above.
  const openQuitConfirm = (): void => {
    setShowModelPicker(false)
    setRemotePopupSessionId(null)
    setPendingApiSwitch(null)
    setPendingCodexSwitch(null)
    setPendingEngineWorkspace(null)
    setBackgroundNotification(null)
    setShowQuitConfirm(true)
  }

  const cancelQuitConfirm = (): void => {
    setShowQuitConfirm(false)
  }

  const confirmQuit = (): void => {
    window.ccc?.quitApp()
  }

  const handleAction = (action: ActionType): void => {
    if (action === 'stop') {
      sessions.forEach(s => window.ccc?.killSession(s.id))
      setSessions([])
      setActiveId(null)
      setExpanded(false)
      setShowModelPicker(false)
      setRemotePopupSessionId(null)
      setPendingApiSwitch(null)
      setPendingCodexSwitch(null)
      setPendingEngineWorkspace(null)
      setBackgroundNotification(null)
      setIsSwitchingModel(false)
      releaseMousePassthrough()
    }
  }

  // Only clears the popup — does NOT reset state so the icon persists.
  // When the queue has another permission waiting, advance to it instead
  // of going blank.
  const dismissNotif = useCallback((): void => {
    if (activeSession?.notification) {
      setSessions(prev => prev.map(s =>
        s.id === activeId ? advancePermissionQueue(s, { stateWhenEmpty: 'preserve' }) : s
      ))
      return
    }
    setBackgroundNotification(null)
  }, [activeId, activeSession?.notification])

  const hookDecision = (hookKey: string, exitCode: number): void => {
    window.ccc?.sendHookDecision(hookKey, exitCode)
    setSessions(prev => prev.map(s =>
      s.id === activeId ? advancePermissionQueue(s, { stateWhenEmpty: 'streaming' }) : s
    ))
  }

  // Inject user's typed text into Claude's stdin, then allow the tool
  const replyAndAllow = useCallback((hookKey: string, text: string): void => {
    if (activeId !== null && text.trim()) {
      window.ccc?.injectConsoleText(activeId, text)
    }
    // Small delay so injected text lands before the tool proceeds
    setTimeout(() => {
      window.ccc?.sendHookDecision(hookKey, 0)
    }, 150)
    setSessions(prev => prev.map(s =>
      s.id === activeId ? advancePermissionQueue(s, { stateWhenEmpty: 'streaming' }) : s
    ))
  }, [activeId])

  const allowAlways = useCallback((hookKey: string, tool: string): void => {
    if (activeId !== null) {
      window.ccc?.allowToolAlways(activeId, tool)
    }
    window.ccc?.sendHookDecision(hookKey, 0)
    setSessions(prev => prev.map(s =>
      s.id === activeId ? advancePermissionQueue(s, { stateWhenEmpty: 'streaming' }) : s
    ))
  }, [activeId])

  const createClaudeSession = useCallback(async (workspace: string, skipPermissions = false): Promise<void> => {
    // Look up alias for the chosen default; empty string → no --model flag
    const info = MODELS_INFO.find(m => m.id === defaultModelId)
    const modelAlias = info?.switchAlias ?? ''
    const { sessionId } = await window.ccc.launchSession(workspace, modelAlias, skipPermissions)
    const session: Session = {
      id:            sessionId,
      workspace,
      modelId:       defaultModelId,
      name:          basenameOf(workspace),
      model:         info?.name ?? '—',
      contextPct:    0,
      usagePct:      0,
      weeklyPct:     0,
      reset5hAt:     0,
      reset7dAt:     0,
      state:         'idle',
      notification:  null,
      pendingPermissions: [],
      lastActivityAt: Date.now(),
      mode:          'anthropic',
    }
    setSessions(prev => [...prev, session])
    setActiveId(sessionId)
  }, [defaultModelId])

  const defaultCodexModelId = useCallback((): string => {
    return codexStatus?.defaultModelId ?? (codexStatus?.models[0] ?? FALLBACK_CODEX_MODELS[0]).id
  }, [codexStatus])

  const createCodexSession = useCallback(async (workspace: string, modelId: string = defaultCodexModelId(), skipPermissions = false): Promise<void> => {
    const result = await window.ccc?.codexCliLaunch(workspace, modelId, skipPermissions)
    if (!result || !result.ok) {
      console.error('codexCliLaunch failed:', result?.ok === false ? result.error : 'unknown')
      return
    }
    const now = Date.now()
    const session: Session = {
      id:             result.sessionId,
      workspace,
      modelId,
      name:           basenameOf(workspace),
      model:          modelId,
      contextPct:     0,
      usagePct:       0,
      weeklyPct:      0,
      reset5hAt:      0,
      reset7dAt:      0,
      state:          'idle',
      notification:   null,
      pendingPermissions: [],
      lastActivityAt: now,
      mode:           'codex',
      codexModelId:   modelId,
      codexMetrics:   {
        sessionStartedAt: now,
        lastActivityAt: now,
        ...(codexStatus?.reasoningEffort && { reasoningEffort: codexStatus.reasoningEffort }),
      },
    }
    setSessions(prev => [...prev, session])
    setActiveId(result.sessionId)
  }, [defaultCodexModelId])

  const addSession = async (): Promise<void> => {
    const workspace = await window.ccc?.openFolderDialog()
    if (!workspace) return

    const claudeAvailable = claudeStatus?.installed !== false
    const codexAvailable = codexStatus === null || codexStatus.installed === true

    if (!claudeAvailable && !codexAvailable) {
      setBackgroundNotification({ type: 'message', message: 'No Claude Code CLI or Codex CLI detected' })
      return
    }

    // Always open the picker — even with a single CLI installed — so the
    // permission mode (normal vs full-access) can be chosen for every session.
    // The picker hides whichever engine is unavailable.
    setExpanded(false)
    setShowModelPicker(false)
    setRemotePopupSessionId(null)
    setPendingEngineWorkspace(workspace)
  }

  const cancelNewSessionEngine = (): void => {
    setPendingEngineWorkspace(null)
    releaseMousePassthroughUnlessPointerOverCcc()
  }

  const confirmNewSessionClaude = useCallback(async (skipPermissions: boolean): Promise<void> => {
    if (!pendingEngineWorkspace) return
    setNewSessionBusy(true)
    try {
      await createClaudeSession(pendingEngineWorkspace, skipPermissions)
      setPendingEngineWorkspace(null)
      // addSession collapsed the panel to surface the picker; re-expand so the
      // new session (and the New Session button) are visible again.
      setExpanded(true)
    } finally {
      setNewSessionBusy(false)
    }
  }, [createClaudeSession, pendingEngineWorkspace])

  const confirmNewSessionCodex = useCallback(async (skipPermissions: boolean): Promise<void> => {
    if (!pendingEngineWorkspace) return
    setNewSessionBusy(true)
    try {
      await createCodexSession(pendingEngineWorkspace, undefined, skipPermissions)
      setPendingEngineWorkspace(null)
      setExpanded(true)
    } finally {
      setNewSessionBusy(false)
    }
  }, [createCodexSession, pendingEngineWorkspace])

  const removeSession = (id: number): void => {
    window.ccc?.killSession(id)
    setSessions(prev => {
      if (!prev.some(s => s.id === id)) return prev
      const next = prev.filter(s => s.id !== id)
      setActiveId(cur => {
        if (cur !== id) return cur
        return next.length > 0 ? next[next.length - 1].id : null
      })
      return next
    })
  }

  // Inject /model <alias> into running Claude Code terminal (e.g. /model sonnet)
  // Uses the short alias so Claude Code selects its built-in model, not a custom one.
  const selectModel = (modelId: string): void => {
    setDefaultModelId(modelId)
    if (activeSession) {
      const info = MODELS_INFO.find(m => m.id === modelId)
      if (canonicalModelId(activeSession.model) !== modelId) {
        setIsSwitchingModel(true)
      }
      window.ccc?.switchSessionModel(activeSession.id, info?.switchAlias ?? modelId)
    }
  }

  // Inject /effort <level> into the running Claude Code terminal (anthropic
  // sessions only). Claude Code accepts the level inline, so this is the same
  // one-shot path as /model. No statusline echoes the active effort back, so we
  // optimistically record the pick on the session to highlight the chosen chip.
  const selectEffort = (effort: ClaudeReasoningEffort): void => {
    if (!activeSession || activeSession.mode !== 'anthropic') return
    window.ccc?.switchSessionEffort(activeSession.id, effort)
    setSessions(prev => prev.map(s =>
      s.id === activeSession.id ? { ...s, reasoningEffort: effort } : s))
  }

  // User clicked a custom-API model chip in the picker → open the switch
  // popup. We re-fetch providers first so a user who added a key in Settings
  // since last mount still gets the right modelId.
  const requestApiSwitch = useCallback(async (providerId: 'deepseek', modelId: string): Promise<void> => {
    if (!activeSession) return
    await reloadApiProviders()
    setPendingApiSwitch({ providerId, modelId })
  }, [activeSession?.id, reloadApiProviders])

  const cancelApiSwitch = (): void => {
    setPendingApiSwitch(null)
    releaseMousePassthroughUnlessPointerOverCcc()
  }

  const confirmApiRestart = useCallback(async (): Promise<void> => {
    if (!activeSession || !pendingApiSwitch) return
    setApiSwitchBusy(true)
    setIsSwitchingModel(true)
    try {
      const result = await window.ccc?.apiSessionRestart(
        activeSession.id, pendingApiSwitch.providerId, pendingApiSwitch.modelId,
      )
      if (result && !result.ok) {
        // Surface the error in the same channel as the API panel —
        // briefly via console; UI feedback would be nicer but is
        // out-of-scope for Chunk C.
        console.error('apiSessionRestart failed:', result.error)
      }
    } finally {
      setApiSwitchBusy(false)
      setPendingApiSwitch(null)
      // isSwitchingModel auto-clears when the new statusline arrives, or
      // via the 8 s safety timeout already wired above.
    }
  }, [activeSession?.id, pendingApiSwitch])

  // "Open a new session" path — leaves the active session untouched and
  // spawns a brand-new API session in the same workspace. We add the row
  // to local state right away so the user sees it appear; metrics +
  // model name fill in as the new claude's statusline reports.
  const confirmApiOpenNew = useCallback(async (): Promise<void> => {
    if (!activeSession || !pendingApiSwitch) return
    setApiSwitchBusy(true)
    try {
      const result = await window.ccc?.apiSessionLaunchNew(
        activeSession.workspace, pendingApiSwitch.providerId, pendingApiSwitch.modelId,
      )
      if (!result || !result.ok) {
        console.error('apiSessionLaunchNew failed:', result?.ok === false ? result.error : 'unknown')
        return
      }
      const newSession: Session = {
        id:             result.sessionId,
        workspace:      activeSession.workspace,
        modelId:        pendingApiSwitch.modelId,
        name:           activeSession.name,
        model:          pendingApiSwitch.modelId,
        contextPct:     0,
        usagePct:       0,
        weeklyPct:      0,
        reset5hAt:      0,
        reset7dAt:      0,
        state:          'idle',
        notification:   null,
        pendingPermissions: [],
        lastActivityAt: Date.now(),
        mode:           'api',
        apiProviderId:  pendingApiSwitch.providerId,
        apiModelId:     pendingApiSwitch.modelId,
      }
      setSessions(prev => [...prev, newSession])
      setActiveId(result.sessionId)
    } finally {
      setApiSwitchBusy(false)
      setPendingApiSwitch(null)
    }
  }, [activeSession?.id, activeSession?.workspace, activeSession?.name, pendingApiSwitch])

  const requestCodexSwitch = useCallback((modelId: string): void => {
    if (!activeSession || activeSession.mode !== 'codex') return
    setPendingCodexSwitch({ modelId })
  }, [activeSession?.id, activeSession?.mode])

  const cancelCodexSwitch = (): void => {
    setPendingCodexSwitch(null)
    releaseMousePassthroughUnlessPointerOverCcc()
  }

  const selectCodexEffort = useCallback((effort: CodexReasoningEffort): void => {
    if (!activeSession || activeSession.mode !== 'codex' || !pendingCodexSwitch) return
    const now = Date.now()
    const modelMenuIndex = codexModels.findIndex(m => m.id === pendingCodexSwitch.modelId) + 1
    if (modelMenuIndex < 1 || modelMenuIndex > 9) {
      console.error('codex model menu index unavailable:', pendingCodexSwitch.modelId)
      setPendingCodexSwitch(null)
      return
    }
    setIsSwitchingModel(true)
    window.ccc?.codexCliSelectModel(activeSession.id, modelMenuIndex, effort)
    setSessions(prev => prev.map(s => s.id === activeSession.id ? {
      ...s,
      modelId:        pendingCodexSwitch.modelId,
      model:          pendingCodexSwitch.modelId,
      codexModelId:   pendingCodexSwitch.modelId,
      lastActivityAt: now,
      codexMetrics: {
        ...(s.codexMetrics ?? { sessionStartedAt: now }),
        lastActivityAt: now,
        reasoningEffort: effort,
      },
    } : s))
    setPendingCodexSwitch(null)
  }, [activeSession?.id, activeSession?.mode, codexModels, pendingCodexSwitch])

  const renameSession = (id: number, name: string): void =>
    setSessions(s => s.map(x => x.id === id ? { ...x, name } : x))

  const selectSession = (id: number): void => {
    setActiveId(id)
    setExpanded(true)
    // Bring this session's terminal to the foreground on the user's
    // desktop. macOS does this via AppleScript window-fronting; Windows
    // is currently a no-op (user can taskbar / Alt-Tab themselves).
    window.ccc?.focusSession(id)
  }

  const openHarness = (id: number): void => {
    const s = sessions.find(x => x.id === id)
    if (!s) return
    window.ccc?.openHarnessWindow(s.workspace)
    // The console/wizard opens in its own window — collapse the expanded island
    // back to the pill so it's not left hanging open behind the new page.
    setExpanded(false)
    setShowModelPicker(false)
  }

  const openRemote     = (id: number): void => setRemotePopupSessionId(id)
  const closeRemote    = (): void => setRemotePopupSessionId(null)
  const activateRemote = (id: number): void => {
    const s = sessions.find(x => x.id === id)
    if (!s || s.mode === 'codex' || s.mode === 'api') return  // native RC = claude.ai sessions only
    // Connect Claude Code's native Remote Control + bring the terminal forward so
    // the user sees its URL/QR + tell main to defer permissions to native (so
    // mobile push can approve them). Mark the session so the island shows a badge.
    window.ccc?.injectConsoleText(id, '/remote-control')
    window.ccc?.markSessionRemote(id)
    window.ccc?.focusSession(id)
    setSessions(prev => prev.map(x => x.id === id ? { ...x, remote: true } : x))
  }

  const wrapperClass = [
    'island-wrapper',
    overlayMode !== 'default' ? `island-wrapper--${overlayMode}` : '',
    // In top-hidden mode the BrowserWindow stays pill-sized; CSS uses the
    // .island-wrapper--peek class to toggle strip-only vs pill display.
    // Without this class the strip is shown; with it the pill appears.
    overlayMode === 'top-hidden' && overlayPeek ? 'island-wrapper--peek' : '',
    dragState ? 'island-wrapper--dragging' : '',
  ].filter(Boolean).join(' ')

  // Convert drag screen coords to window-local for Island's `position: fixed`
  // pill. During drag the BrowserWindow is fullscreen at workArea.x/y, so
  // local = screen - workArea origin. Subtract the grab-offset so the pill's
  // top-left edge sits at (cursor − offset) — the point the user grabbed
  // stays pinned under the cursor.
  const islandDragState = dragState && workArea ? {
    fromMode:  dragState.fromMode,
    pointerX:  dragState.screenX - workArea.x - dragState.offsetX,
    pointerY:  dragState.screenY - workArea.y - dragState.offsetY,
    hoverZone: dragState.hoverZone,
  } : null

  return (
    <div
      className={wrapperClass}
      ref={wrapperRef}
      onMouseEnter={handleMouseEnter}
      onMouseDown={rememberPointer}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <Island
        state={displayState}
        model={displayModel}
        selectedModelId={activeModelId}
        isSwitchingModel={isSwitchingModel}
        contextPct={contextPct}
        contextTokens={contextTokens}
        contextWindowSize={contextWindowSize}
        usagePct={usagePct}
        weeklyPct={weeklyPct}
        reset5hAt={reset5hAt}
        reset7dAt={reset7dAt}
        activeSessionMode={activeSession?.mode ?? 'anthropic'}
        activeApiUsage={activeApiUsage}
        expanded={expanded}
        showModelPicker={showModelPicker}
        notification={notification}
        sessions={sessions}
        activeSessionId={activeId}
        remotePopupSessionId={remotePopupSessionId}
        showAccessibilityWarning={showAccessibilityWarning}
        apiProviders={apiProviders}
        apiBalances={apiBalances}
        apiUsage={apiUsage}
        overlayMode={overlayMode}
        overlayPeek={overlayPeek}
        cornerDoneExpired={cornerDoneExpired}
        cornerWaitingDismissed={cornerWaitingDismissed}
        dragState={islandDragState}
        showSettings={showSettings}
        onToggleSettings={() => setShowSettings(s => !s)}
        onPillPointerDown={handlePillPointerDown}
        onStripPointerEnter={handleStripPointerEnter}
        onOverlayPointerLeave={handleOverlayPointerLeave}
        onToggleExpand={() => {
          // Suppress the click that comes right after a drag-release so
          // dropping the pill back at top-center doesn't immediately open
          // the panel.
          if (justDraggedRef.current) return
          // User-driven dismiss for the corner-mode waiting banner. If
          // the user clicks the circle while "待回答" is showing, treat
          // it as "我知道了" — collapse to a bare circle and don't expand.
          // The reset effect above will re-arm the banner on the next
          // state transition.
          if (
            overlayMode === 'corner-shrunk'
            && !expanded
            && overlayState === 'waiting'
            && !cornerWaitingDismissed
          ) {
            setCornerWaitingDismissed(true)
            return
          }
          setShowModelPicker(false)
          setExpanded(e => !e)
          void reloadApiProviders()
          void reloadCodexStatus()
          void reloadClaudeStatus()
        }}
        onToggleModelPicker={() => {
          setShowModelPicker(p => !p)
          void reloadApiProviders()
          void reloadCodexStatus()
          void reloadClaudeStatus()
        }}
        onSelectModel={selectModel}
        onSelectApiModel={(providerId, modelId) => void requestApiSwitch(providerId, modelId)}
        selectedEffort={activeSession?.reasoningEffort}
        onSelectEffort={selectEffort}
        codexModels={codexModels}
        onSelectCodexModel={requestCodexSwitch}
        onAddSession={addSession}
        onRemoveSession={removeSession}
        onRenameSession={renameSession}
        onSelectSession={selectSession}
        onOpenHarness={openHarness}
        onOpenRemote={openRemote}
        onCloseRemote={closeRemote}
        onActivateRemote={activateRemote}
        onAction={handleAction}
        onQuit={openQuitConfirm}
        onDismissNotif={dismissNotif}
        onHookDecision={hookDecision}
        onAllowAlways={allowAlways}
        onReplyAndAllow={replyAndAllow}
      />

      {pendingApiSwitch && (
        <ApiSwitchPopup
          providerLabel={pendingApiSwitch.modelId}
          busy={apiSwitchBusy}
          onRestart={() => void confirmApiRestart()}
          onOpenNew={() => void confirmApiOpenNew()}
          onCancel={cancelApiSwitch}
        />
      )}

      {pendingCodexSwitch && (
        <CodexSwitchPopup
          modelLabel={pendingCodexSwitch.modelId}
          busy={isSwitchingModel}
          onSelectEffort={selectCodexEffort}
          onCancel={cancelCodexSwitch}
        />
      )}

      {pendingEngineWorkspace && (
        <NewSessionEnginePopup
          busy={newSessionBusy}
          claudeAvailable={claudeStatus?.installed !== false}
          codexAvailable={codexStatus === null || codexStatus.installed === true}
          onSelectClaude={(skip) => void confirmNewSessionClaude(skip)}
          onSelectCodex={(skip) => void confirmNewSessionCodex(skip)}
          onCancel={cancelNewSessionEngine}
        />
      )}

      {showQuitConfirm && (
        <QuitConfirmPopup
          sessionCount={sessions.length}
          onConfirm={confirmQuit}
          onCancel={cancelQuitConfirm}
        />
      )}
    </div>
  )
}
