import { useState, useEffect, useRef, useCallback } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { Island, MODELS_INFO } from './components/Island'
import { ApiSwitchPopup } from './components/ApiSwitchPopup'
import { CodexSwitchPopup } from './components/CodexSwitchPopup'
import { NewSessionEnginePopup } from './components/NewSessionEnginePopup'
import type { AppState, Session, ActionType, SessionNotification, SessionStateUpdate, SessionMetricsUpdate, SessionRestored, CodexReasoningEffort } from './types'
import type { ApiProviderId, ApiProviderListEntry } from '../../shared/api-provider'
import type { ApiBalanceSnapshot, ApiUsageSnapshot } from '../../shared/api-usage'
import type { ClaudeCliStatus } from '../../shared/claude-cli'
import type { CodexCliStatus } from '../../shared/codex-cli'
import { FALLBACK_CODEX_MODELS } from '../../shared/codex-cli'

function basenameOf(p: string): string {
  return p.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? p
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
  const [backgroundNotification, setBackgroundNotification] = useState<SessionNotification | null>(null)
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

  const setIgnoreMouseDeduped = useCallback((ignore: boolean): void => {
    if (lastIgnoreMouseRef.current === ignore) return
    lastIgnoreMouseRef.current = ignore
    window.ccc?.setIgnoreMouseEvents(ignore)
  }, [])

  const releaseMousePassthrough = useCallback((): void => {
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

  // Safety timeout: clear spinner if statusLine never fires after a switch
  useEffect(() => {
    if (!isSwitchingModel) return
    const t = setTimeout(() => setIsSwitchingModel(false), 8_000)
    return () => clearTimeout(t)
  }, [isSwitchingModel])

  // Grow the pill window so the QR popup is not clipped at the bottom.
  // Tall enough for: pill (36) + expanded panel (~250) + margin + popup (~440).
  useEffect(() => {
    window.ccc?.setMainHeight(remotePopupSessionId !== null ? 820 : null)
  }, [remotePopupSessionId])

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
        const notification: SessionNotification | null =
          update.permission ? { type: 'permission', ...update.permission } :
          update.message    ? { type: 'message',    message: update.message } :
          update.state === 'done' ? { type: 'done' } :
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
  const contextPct    = activeSession?.contextPct ?? 0
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

  useEffect(() => {
    if (hasInteractiveOverlay) {
      captureMouseForCcc()
      return
    }
    releaseMousePassthroughUnlessPointerOverCcc()
  }, [captureMouseForCcc, hasInteractiveOverlay, releaseMousePassthroughUnlessPointerOverCcc])

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

  // Only clears the popup — does NOT reset state so the icon persists
  const dismissNotif = useCallback((): void => {
    if (activeSession?.notification) {
      setSessions(prev => prev.map(s =>
        s.id === activeId ? { ...s, notification: null } : s
      ))
      return
    }
    setBackgroundNotification(null)
  }, [activeId, activeSession?.notification])

  const hookDecision = (hookKey: string, exitCode: number): void => {
    window.ccc?.sendHookDecision(hookKey, exitCode)
    setSessions(prev => prev.map(s =>
      s.id === activeId ? { ...s, notification: null, state: 'streaming' as const } : s
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
      s.id === activeId ? { ...s, notification: null, state: 'streaming' as const } : s
    ))
  }, [activeId])

  const allowAlways = useCallback((hookKey: string, tool: string): void => {
    if (activeId !== null) {
      window.ccc?.allowToolAlways(activeId, tool)
    }
    window.ccc?.sendHookDecision(hookKey, 0)
    setSessions(prev => prev.map(s =>
      s.id === activeId ? { ...s, notification: null, state: 'streaming' as const } : s
    ))
  }, [activeId])

  const createClaudeSession = useCallback(async (workspace: string): Promise<void> => {
    // Look up alias for the chosen default; empty string → no --model flag
    const info = MODELS_INFO.find(m => m.id === defaultModelId)
    const modelAlias = info?.switchAlias ?? ''
    const { sessionId } = await window.ccc.launchSession(workspace, modelAlias)
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
      lastActivityAt: Date.now(),
      mode:          'anthropic',
    }
    setSessions(prev => [...prev, session])
    setActiveId(sessionId)
  }, [defaultModelId])

  const defaultCodexModelId = useCallback((): string => {
    return codexStatus?.defaultModelId ?? (codexStatus?.models[0] ?? FALLBACK_CODEX_MODELS[0]).id
  }, [codexStatus])

  const createCodexSession = useCallback(async (workspace: string, modelId: string = defaultCodexModelId()): Promise<void> => {
    const result = await window.ccc?.codexCliLaunch(workspace, modelId)
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

    if (claudeAvailable && codexAvailable) {
      setExpanded(false)
      setShowModelPicker(false)
      setRemotePopupSessionId(null)
      setPendingEngineWorkspace(workspace)
      return
    }
    if (codexAvailable && !claudeAvailable) {
      await createCodexSession(workspace)
      return
    }
    if (claudeAvailable) {
      await createClaudeSession(workspace)
      return
    }
    setBackgroundNotification({ type: 'message', message: 'No Claude Code CLI or Codex CLI detected' })
  }

  const cancelNewSessionEngine = (): void => {
    setPendingEngineWorkspace(null)
    releaseMousePassthroughUnlessPointerOverCcc()
  }

  const confirmNewSessionClaude = useCallback(async (): Promise<void> => {
    if (!pendingEngineWorkspace) return
    setNewSessionBusy(true)
    try {
      await createClaudeSession(pendingEngineWorkspace)
      setPendingEngineWorkspace(null)
    } finally {
      setNewSessionBusy(false)
    }
  }, [createClaudeSession, pendingEngineWorkspace])

  const confirmNewSessionCodex = useCallback(async (): Promise<void> => {
    if (!pendingEngineWorkspace) return
    setNewSessionBusy(true)
    try {
      await createCodexSession(pendingEngineWorkspace)
      setPendingEngineWorkspace(null)
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

  const openRemote     = (id: number): void => setRemotePopupSessionId(id)
  const closeRemote    = (): void => setRemotePopupSessionId(null)
  const activateRemote = (id: number): void => {
    window.ccc?.injectConsoleText(id, '/remote-control')
  }

  return (
    <div
      className="island-wrapper"
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
        onToggleExpand={() => {
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
        codexModels={codexModels}
        onSelectCodexModel={requestCodexSwitch}
        onAddSession={addSession}
        onRemoveSession={removeSession}
        onRenameSession={renameSession}
        onSelectSession={selectSession}
        onOpenRemote={openRemote}
        onCloseRemote={closeRemote}
        onActivateRemote={activateRemote}
        onAction={handleAction}
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
          onSelectClaude={() => void confirmNewSessionClaude()}
          onSelectCodex={() => void confirmNewSessionCodex()}
          onCancel={cancelNewSessionEngine}
        />
      )}
    </div>
  )
}
