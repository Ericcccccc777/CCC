import { useEffect, useState } from 'react'
import type { CSSProperties, MouseEvent as ReactMouseEvent } from 'react'
import type { AppState, OverlayMode, Session, ModelInfo, ActionType, SessionNotification } from '../types'
import { useLang, useLangContext, LANG_LABELS } from '../i18n'
import type { LangCode } from '../i18n'
import { DEEPSEEK_MODELS, type ApiProviderId, type ApiProviderListEntry } from '../../../shared/api-provider'
import type { ApiBalanceSnapshot, ApiUsageSnapshot } from '../../../shared/api-usage'
import { StateIcon } from './StateIcon'
import { Ring } from './Ring'
import { SessionRow } from './SessionRow'
import { NotificationPopup } from './NotificationPopup'
import { RemoteControlPopup } from './RemoteControlPopup'
import { ApiProvidersPanel } from './ApiProvidersPanel'
import { CodexCliPanel } from './CodexCliPanel'
import type { CodexModel } from '../../../shared/codex-cli'
import { claudeEffortsForModel } from '../../../shared/claude-cli'
import type { ClaudeReasoningEffort } from '../types'

// Note on switchAlias: Claude Code's `/model <alias>` accepts aliases for
// each picker entry. As of CLI 2.1.x the "Default (recommended)" picker
// entry IS Opus 4.8 ("with 1M context · Best for everyday, complex
// tasks"); its alias is `default`, NOT `opus`. Sending `/model opus`
// makes the CLI create a *custom* model entry instead of selecting the
// built-in default — so the Opus chip must send `default`. Sonnet, Fable
// and Haiku are distinct picker entries with their own short aliases.
// `name` must match the statusline display_name exactly (see
// canonicalModelId) so the chip highlights when that model is active.
export const MODELS_INFO: readonly ModelInfo[] = [
  { id: 'claude-opus-4-8',           switchAlias: 'default', name: 'Opus 4.8',   desc: 'Default · 1M context' },
  { id: 'claude-sonnet-4-6',         switchAlias: 'sonnet',  name: 'Sonnet 4.6', desc: 'Efficient · Routine tasks' },
  { id: 'claude-fable-5',            switchAlias: 'fable',   name: 'Fable 5',    desc: 'Frontier · Hardest problems' },
  { id: 'claude-haiku-4-5-20251001', switchAlias: 'haiku',   name: 'Haiku 4.5',  desc: 'Lightweight · Economy' },
]

const HARNESS_BUTTON_VISIBLE = true

interface ModelPickerStripProps {
  selectedModelId: string
  onSelect:        (modelId: string) => void
  variant:         'pill' | 'panel'
  mode:            'anthropic' | 'api' | 'codex'
  apiProviders:    readonly ApiProviderListEntry[]
  onSelectApi:     (providerId: 'deepseek', modelId: string) => void
  codexModels:     readonly CodexModel[]
  onSelectCodex:   (modelId: string) => void
  selectedEffort?: ClaudeReasoningEffort
  onSelectEffort?: (effort: ClaudeReasoningEffort) => void
}

function ModelPickerStrip({ selectedModelId, onSelect, variant, mode, apiProviders, onSelectApi, codexModels, onSelectCodex, selectedEffort, onSelectEffort }: ModelPickerStripProps): JSX.Element {
  const t = useLang()
  const hasVerifiedDeepSeekKey = apiProviders.some(p => p.id === 'deepseek' && p.hasKey && p.verified)
  const effortLabel = (eff: ClaudeReasoningEffort): string =>
    eff === 'low'    ? t.codexEffortLow :
    eff === 'medium' ? t.codexEffortMedium :
    eff === 'high'   ? t.codexEffortHigh :
    eff === 'xhigh'  ? t.codexEffortXhigh :
    t.effortMax
  if (mode === 'codex') {
    return (
      <div
        className={`model-picker-strip model-picker-strip--${variant}`}
        onClick={e => e.stopPropagation()}
      >
        {codexModels.length > 0 && (
          <div className="model-picker-codex-row">
            {codexModels.map(m => (
              <button
                key={m.id}
                className={`model-chip model-chip--codex${selectedModelId === m.id ? ' model-chip--selected' : ''}`}
                aria-pressed={selectedModelId === m.id}
                onClick={() => onSelectCodex(m.id)}
                aria-label={`${t.codexCliPickerLabel} — ${m.label}`}
              >
                <span className="model-chip__name">{m.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div
      className={`model-picker-strip model-picker-strip--${variant}`}
      onClick={e => e.stopPropagation()}
    >
      <div className="model-picker-anthropic-row">
        {MODELS_INFO.map(m => (
          <button
            key={m.id}
            className={`model-chip${selectedModelId === m.id ? ' model-chip--selected' : ''}`}
            aria-pressed={selectedModelId === m.id}
            onClick={() => onSelect(m.id)}
          >
            <span className="model-chip__name">{m.name}</span>
            <span className="model-chip__desc">{m.desc}</span>
          </button>
        ))}
      </div>

      {/* Reasoning-effort row — Claude only (not API/DeepSeek). Levels are
         gated to what the selected model supports (Haiku → none, so the row
         hides; Sonnet → no xhigh). Clicking injects `/effort <level>`. */}
      {mode === 'anthropic' && (() => {
        const efforts = claudeEffortsForModel(selectedModelId)
        if (efforts.length === 0) return null
        return (
          <div className="effort-row" role="radiogroup" aria-label={t.codexReasoningEffort}>
            <span className="effort-row__label">{t.codexReasoningEffort}</span>
            <div className="effort-row__chips">
              {efforts.map(eff => (
                <button
                  key={eff}
                  className={`effort-chip${selectedEffort === eff ? ' effort-chip--selected' : ''}`}
                  role="radio"
                  aria-checked={selectedEffort === eff}
                  aria-label={`${t.codexReasoningEffort} — ${effortLabel(eff)}`}
                  onClick={() => onSelectEffort?.(eff)}
                >
                  {effortLabel(eff)}
                </button>
              ))}
            </div>
          </div>
        )
      })()}

      {hasVerifiedDeepSeekKey && (
        <>
          <div className="model-picker-divider" aria-hidden="true" />
          <div className="model-picker-custom-row">
            {DEEPSEEK_MODELS.map(m => (
              <button
                key={m.id}
                className={`model-chip model-chip--api${selectedModelId === m.id ? ' model-chip--selected' : ''}`}
                aria-pressed={selectedModelId === m.id}
                onClick={() => onSelectApi('deepseek', m.id)}
                aria-label={`${t.apiSwitchPickerLabel} — ${m.label}`}
              >
                <span className="model-chip__name">{m.label.replace(/^deepseek-/i, 'DeepSeek ')}</span>
                <span className="model-chip__desc">{m.id}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function barColor(p: number): string {
  if (p < 0.5)  return 'oklch(0.65 0.18 145)'
  if (p < 0.75) return 'oklch(0.72 0.18 75)'
  return 'oklch(0.6 0.22 25)'
}

function shortName(model: string): string {
  return model.replace(/^Claude\s+/i, '')
}

// "3h 12m" / "2d 3h 45m" / "8m" — coarse countdown for rate-limit reset
// hints. Ranges:
//   < 1m       → "<1m"
//   < 1h       → "Nm"
//   < 1d       → "Nh Mm"
//   >= 1d      → "Nd Mh Pm"
// Returns null for past timestamps or invalid input so callers can fall
// back to a percentage-only hint.
export function formatCountdown(targetMs: number, nowMs = Date.now()): string | null {
  if (!Number.isFinite(targetMs) || targetMs <= 0) return null
  const ms = targetMs - nowMs
  if (ms <= 0) return null
  const totalMin = Math.floor(ms / 60_000)
  if (totalMin < 1) return '<1m'
  const days  = Math.floor(totalMin / (60 * 24))
  const hours = Math.floor((totalMin - days * 60 * 24) / 60)
  const mins  = totalMin - days * 60 * 24 - hours * 60
  if (days  > 0) return `${days}d ${hours}h ${mins}m`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

function formatTokensCompact(n: number): string {
  if (n < 1000)      return String(n)
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

// Pixel art spinner — 8 squares on a circle, trail opacity, steps(8) CSS spin
function ModelSwitchingSpinner(): JSX.Element {
  const opacities = [1, 0.75, 0.55, 0.38, 0.24, 0.14, 0.08, 0.03]
  const R = 5
  return (
    <svg className="model-switching-spinner" width="14" height="14" viewBox="-7 -7 14 14">
      {opacities.map((op, i) => {
        const a = (i / 8) * 2 * Math.PI - Math.PI / 2
        return (
          <rect
            key={i}
            x={R * Math.cos(a) - 1}
            y={R * Math.sin(a) - 1}
            width={2} height={2} rx={0.3}
            fill="oklch(0.70 0.16 55)"
            opacity={op}
          />
        )
      })}
    </svg>
  )
}

// Pixel art C (5×7 grid) — S=2, Claude orange
const C_PIXELS: ReadonlyArray<[number, number]> = [
  [1,0],[2,0],[3,0],
  [0,1],[4,1],
  [0,2], [0,3], [0,4],
  [0,5],[4,5],
  [1,6],[2,6],[3,6],
]

function PixelCCC(): JSX.Element {
  const S = 2, W = 5, G = 2, H = 7
  const totalW = (3 * W + 2 * G) * S
  const totalH = H * S
  return (
    <svg width={totalW} height={totalH} viewBox={`0 0 ${totalW} ${totalH}`} style={{ display: 'block' }}>
      {[0, 1, 2].map(li =>
        C_PIXELS.map(([x, y]) => (
          <rect
            key={`${li}-${x}-${y}`}
            x={(li * (W + G) + x) * S}
            y={y * S}
            width={S - 0.3}
            height={S - 0.3}
            fill="oklch(0.70 0.16 55)"
            rx={0.4}
          />
        ))
      )}
    </svg>
  )
}

// Snapshot of in-flight drag state from App.tsx. The pill's CSS position is
// driven from pointerX/pointerY (window-local) while a drag is engaged;
// hoverZone drives the snap-zone highlight.
export interface IslandDragState {
  fromMode:  OverlayMode
  pointerX:  number
  pointerY:  number
  hoverZone: 'top' | 'corner' | 'default' | null
}

// Whether the NotificationPopup should be hidden for a given overlay mode +
// notification type. Single source of truth for the per-mode rules; exposed
// so the matching renderer tests can assert against the same table.
//
// Rule of thumb: in non-default modes, suppress popups that are purely
// informational (done = "Response complete", message = background toast)
// because the user opted out of pill-takeover and the corner-hint banner
// already conveys the gist. KEEP actionable popups (permission, which
// carries Yes/No/Always or a textarea reply) — the user must be able to
// respond without switching modes.
export function shouldSuppressNotifPopup(
  mode:           OverlayMode,
  notifType:      SessionNotification['type'],
): boolean {
  if (mode === 'default') return false
  if (notifType === 'done' || notifType === 'message') return true
  return false
}

interface IslandProps {
  state:            AppState
  model:            string
  selectedModelId:  string
  selectedEffort?:  ClaudeReasoningEffort
  isSwitchingModel: boolean
  contextPct:       number
  contextTokens?:      number
  contextWindowSize?:  number
  usagePct:         number
  weeklyPct:        number
  reset5hAt:        number
  reset7dAt:        number
  // 'api' = active session uses a third-party endpoint (DeepSeek in V1);
  // when this is 'api' and an apiUsage snapshot is present, the second
  // ring is replaced with a session-cost display per the user's request
  // (the Anthropic 5h rate limit is meaningless on API sessions).
  activeSessionMode: 'anthropic' | 'api' | 'codex'
  activeApiUsage:    ApiUsageSnapshot | null
  expanded:         boolean
  showModelPicker:  boolean
  notification:     SessionNotification | null
  sessions:         Session[]
  activeSessionId:  number | null
  remotePopupSessionId: number | null
  showAccessibilityWarning: boolean
  apiProviders:     readonly ApiProviderListEntry[]
  apiBalances:      Record<ApiProviderId, ApiBalanceSnapshot>
  apiUsage:         Record<number, ApiUsageSnapshot>
  // Overlay-mode props (drag/hide/shrink). Default values keep this
  // component backwards-compatible for tests that don't exercise the new
  // surface.
  overlayMode?:        OverlayMode
  overlayPeek?:        boolean
  // True once the 5s auto-hide timer for the corner "Session complete"
  // banner has fired. Drives Island's cornerHintActive to collapse back
  // to a bare circle even though state === 'done' still holds.
  cornerDoneExpired?:  boolean
  // True once the user has manually dismissed the corner "待回答" /
  // "Question pending" banner by clicking the circle. App.tsx resets
  // this on any state transition so a new question re-arms the banner.
  cornerWaitingDismissed?: boolean
  dragState?:          IslandDragState | null
  showSettings?:       boolean
  onToggleSettings?:   () => void
  onPillPointerDown?:  (e: ReactMouseEvent) => void
  onStripPointerEnter?: () => void
  onOverlayPointerLeave?: () => void
  onToggleExpand:   () => void
  onToggleModelPicker: () => void
  onSelectModel:      (modelId: string) => void
  onSelectApiModel:   (providerId: 'deepseek', modelId: string) => void
  codexModels:         readonly CodexModel[]
  onSelectCodexModel:  (modelId: string) => void
  onSelectEffort?:     (effort: ClaudeReasoningEffort) => void
  onAddSession:     () => void | Promise<void>
  onRemoveSession:  (id: number) => void
  onRenameSession:  (id: number, name: string) => void
  onSelectSession:  (id: number) => void
  onOpenHarness:    (id: number) => void
  onOpenRemote:     (id: number) => void
  onCloseRemote:    () => void
  onActivateRemote: (id: number) => void
  onAction:         (action: ActionType) => void
  onQuit:           () => void
  onDismissNotif:   () => void
  onHookDecision:   (hookKey: string, exitCode: number) => void
  onAllowAlways:    (hookKey: string, tool: string) => void
  onReplyAndAllow:  (hookKey: string, text: string) => void
}

export function Island({
  state, model, selectedModelId, isSwitchingModel, contextPct, contextTokens, contextWindowSize, usagePct, weeklyPct,
  reset5hAt, reset7dAt, activeSessionMode, activeApiUsage,
  expanded, showModelPicker, notification, sessions, activeSessionId,
  remotePopupSessionId, showAccessibilityWarning, apiProviders, apiBalances, apiUsage,
  overlayMode = 'default', overlayPeek = false, cornerDoneExpired = false, cornerWaitingDismissed = false, dragState = null,
  showSettings: showSettingsProp, onToggleSettings,
  onPillPointerDown, onStripPointerEnter, onOverlayPointerLeave,
  onToggleExpand, onToggleModelPicker, onSelectModel, onSelectApiModel,
  codexModels, onSelectCodexModel, onSelectEffort,
  selectedEffort,
  onAddSession, onRemoveSession, onRenameSession, onSelectSession, onOpenHarness,
  onOpenRemote, onCloseRemote, onActivateRemote, onAction, onQuit,
  onDismissNotif, onHookDecision, onAllowAlways, onReplyAndAllow,
}: IslandProps): JSX.Element {
  const t               = useLang()
  const { lang, setLang } = useLangContext()
  // Settings can be controlled by the parent (App.tsx) so non-default overlay
  // modes can size the window to fit the tall settings panel. We fall back
  // to a local-only flag if the parent didn't wire it up — preserves the
  // backwards-compat path for tests + earlier component consumers.
  const [showSettingsLocal, setShowSettingsLocal] = useState(false)
  const showSettings = showSettingsProp ?? showSettingsLocal
  const toggleSettings = (): void => {
    if (onToggleSettings) onToggleSettings()
    else                  setShowSettingsLocal(s => !s)
  }
  const [collapsedGroups, setCollapsedGroups] = useState<{ anthropic: boolean; codex: boolean }>({
    anthropic: false,
    codex:     false,
  })
  // Hover-hint area: the pill is at top-of-screen with no room below for
  // native title tooltips, so they get clipped. Instead, we repurpose the
  // model-name slot in the pill center as a hover-hint area: ring/button
  // mouseEnter sets a string here, mouseLeave clears it. While set, the
  // pill renders the hint instead of the model name.
  const [hoverHint, setHoverHint] = useState<string | null>(null)

  // Settings should default to closed every time the island re-opens —
  // collapsing implicitly dismisses the settings panel. Local fallback only
  // (when App.tsx is providing showSettings, it owns this lifecycle).
  useEffect(() => {
    if (!expanded && showSettingsProp === undefined) setShowSettingsLocal(false)
  }, [expanded, showSettingsProp])

  // Clear any hover-hint when the panel collapses. A hovered SessionRow button
  // (CCC-Harness / remote) unmounts on collapse before its mouseLeave fires —
  // without this, its label stays stuck in the pill centre (instead of the
  // model name) until the user hovers something else. Triggered e.g. when
  // clicking CCC-Harness, which collapses the island.
  useEffect(() => {
    if (!expanded) setHoverHint(null)
  }, [expanded])
  // Window-height management lives in App.tsx now (single source so overlay
  // modes can size the strip / circle without fighting this effect). The
  // previous per-component setMainHeight call was removed when the overlay
  // state machine landed; see App.tsx's targetBounds useMemo.

  const hasSession = sessions.length > 0
  const remoteSession = remotePopupSessionId !== null
    ? sessions.find(s => s.id === remotePopupSessionId) ?? null
    : null
  const remoteBusy = remoteSession
    ? (remoteSession.state === 'streaming' || remoteSession.state === 'waiting')
    : false

  const statusLabel: Record<AppState, string> = {
    idle:      t.statusIdle,
    streaming: t.statusStreaming,
    waiting:   t.statusWaiting,
    done:      t.statusDone,
  }

  const handlePickerSelect = (modelId: string): void => {
    onSelectModel(modelId)
    onToggleModelPicker()
  }

  const handleApiPickerSelect = (providerId: 'deepseek', modelId: string): void => {
    onSelectApiModel(providerId, modelId)
    onToggleModelPicker()
  }

  // ── Overlay-mode render derivations ──
  // Strip renders whenever we're in top-hidden mode. CSS (.island-wrapper--peek)
  // toggles whether the strip is visually shown (peek=false) or the pill is
  // shown (peek=true) — the BrowserWindow no longer resizes between the two
  // states, so there's nothing to flicker.
  const showStrip = overlayMode === 'top-hidden' && !dragState
  // Corner "collapsed" = circle, optionally with a text-banner. Expanded
  // anchors the panel at the corner but uses the same render path as
  // default mode so settings / sessions / etc. still work.
  const cornerCollapsed = overlayMode === 'corner-shrunk' && !expanded && !dragState
  // Banner gating:
  //   - waiting: shows until the user clicks-to-dismiss (cornerWaitingDismissed
  //     is flipped by App.tsx's onToggleExpand intercept) OR state changes.
  //     App resets the flag on every state transition so a brand-new question
  //     re-arms the banner.
  //   - done:    shows until the App-level 3s timer flips cornerDoneExpired.
  //   - message: shows for the lifetime of the (background) message notif.
  //     'done' notifications are intentionally NOT a trigger — the done
  //     state already covers that and we don't want the popup-state +
  //     timer to fight each other.
  const cornerHintActive = cornerCollapsed
    && (((state === 'waiting' && !cornerWaitingDismissed))
        || (state === 'done' && !cornerDoneExpired)
        || (notification !== null && notification.type === 'message'))
  const cornerHintText =
    notification?.type === 'message' && notification.message ? notification.message :
    state === 'waiting' ? t.overlayCornerQuestion :
    state === 'done'    ? t.overlayCornerDone :
    ''

  // Inline position while dragging — pill's *top-left corner* is at
  // (pointerX, pointerY). App.tsx already subtracted the grab-offset so the
  // point the user originally grabbed stays under the cursor. No transform
  // here — see .island--dragging in global.css for the lifted scale.
  const islandStyle: CSSProperties | undefined = dragState ? {
    position: 'fixed',
    left:     dragState.pointerX,
    top:      dragState.pointerY,
  } : undefined

  return (
    <>
      {showStrip && (
        <div
          className="top-strip"
          onMouseEnter={onStripPointerEnter}
          onMouseLeave={onOverlayPointerLeave}
          aria-label="CCC overlay (auto-hidden)"
        />
      )}
      <div
        className={[
          'island',
          expanded ? 'island-expanded' : '',
          showModelPicker && !expanded ? 'island--with-picker' : '',
          cornerCollapsed ? 'island--corner' : '',
          cornerHintActive ? 'island--corner-hint' : '',
          dragState ? 'island--dragging' : '',
        ].filter(Boolean).join(' ')}
        style={islandStyle}
        onMouseDown={onPillPointerDown}
        onMouseLeave={onOverlayPointerLeave}
        onClick={() => { if (showModelPicker) onToggleModelPicker(); else onToggleExpand() }}
      >
        <div className="island-pill">
          <StateIcon state={state} />

          <div className="pill-center">
            {cornerHintActive ? (
              <div className="corner-hint-text" aria-live="polite">{cornerHintText}</div>
            ) : hasSession ? (
              <button
                className="model-name-btn"
                onClick={e => { e.stopPropagation(); onToggleModelPicker() }}
              >
                {isSwitchingModel
                  ? <ModelSwitchingSpinner />
                  : <div className={`model-name${hoverHint ? ' is-hover-hint' : ''}`}>
                      {hoverHint ?? shortName(model)}
                    </div>
                }
                {!hoverHint && state !== 'waiting' && <span className="status-text">{statusLabel[state]}</span>}
              </button>
            ) : (
              <div className="ccc-logo">
                <PixelCCC />
              </div>
            )}
          </div>

          {/* Rings — hover hints render in the model-name slot above
             instead of native HTML tooltips, which the pill (top-of-screen,
             nothing below it) clips. The second slot becomes a session-cost
             badge for API-mode sessions where Claude's 5h rate-limit ring
             is meaningless. */}
          <div className="rings">
            {activeSessionMode !== 'codex' && (
              <div
                className="ring-hover-target"
                onMouseEnter={() => setHoverHint(
                  // Show absolute "used / window (pct)" when statusLine gave us the
                  // figures (window size is per-model: 200k / 1M for Opus); fall back
                  // to percentage-only before the first API response / after /compact.
                  contextTokens !== undefined && contextWindowSize
                    ? `${t.contextHover} ${formatTokensCompact(contextTokens)} / ${formatTokensCompact(contextWindowSize)} (${Math.round(contextPct * 100)}%)`
                    : `${t.contextHover} ${Math.round(contextPct * 100)}%`,
                )}
                onMouseLeave={() => setHoverHint(null)}
              >
                <Ring pct={contextPct} size={22} label={`Context ${Math.round(contextPct * 100)}%`} />
              </div>
            )}
            {activeSessionMode === 'codex' ? (
              <div
                className="codex-process-badge"
                aria-label={`${t.codexProcessState} ${state}`}
                onMouseEnter={() => setHoverHint(`${t.codexProcessState} ${state}`)}
                onMouseLeave={() => setHoverHint(null)}
              >
                Codex
              </div>
            ) : activeSessionMode === 'api' && activeApiUsage ? (
              <div
                className="usage-cost-badge"
                aria-label={`Session cost ${activeApiUsage.estimatedCostUsd.toFixed(4)} USD`}
                onMouseEnter={() => setHoverHint(
                  `${t.sessionHover} ${formatTokensCompact(activeApiUsage.inputTokens)} → ${formatTokensCompact(activeApiUsage.outputTokens)} · $${activeApiUsage.estimatedCostUsd.toFixed(4)}`
                )}
                onMouseLeave={() => setHoverHint(null)}
              >
                ${activeApiUsage.estimatedCostUsd < 0.01
                  ? activeApiUsage.estimatedCostUsd.toFixed(4)
                  : activeApiUsage.estimatedCostUsd.toFixed(2)}
              </div>
            ) : (
              <div
                className="ring-hover-target"
                onMouseEnter={() => {
                  const pct  = `${Math.round(usagePct * 100)}%`
                  const tail = formatCountdown(reset5hAt)
                  setHoverHint(`${t.usage5hHover} ${pct}${tail ? ` · ${t.resetsIn} ${tail}` : ''}`)
                }}
                onMouseLeave={() => setHoverHint(null)}
              >
                <Ring pct={usagePct} size={22} label={`5h Usage ${Math.round(usagePct * 100)}%`} />
              </div>
            )}
          </div>
        </div>

        {showModelPicker && !expanded && (
          <ModelPickerStrip
            selectedModelId={selectedModelId}
            onSelect={handlePickerSelect}
            variant="pill"
            mode={activeSessionMode}
            apiProviders={apiProviders}
            onSelectApi={handleApiPickerSelect}
            codexModels={codexModels}
            onSelectCodex={onSelectCodexModel}
            selectedEffort={selectedEffort}
            onSelectEffort={onSelectEffort}
          />
        )}

        {expanded && (
          <div className="expanded-content" onClick={e => e.stopPropagation()}>
            {showAccessibilityWarning && (
              <div className="accessibility-banner" role="alert">
                <div className="accessibility-banner__title">{t.accessibilityBannerTitle}</div>
                <div className="accessibility-banner__hint">{t.accessibilityBannerHint}</div>
                <button
                  className="accessibility-banner__btn"
                  aria-label={t.accessibilityBannerBtn}
                  onClick={() => window.ccc?.openAccessibilitySettings()}
                >
                  {t.accessibilityBannerBtn}
                </button>
              </div>
            )}

            {showModelPicker && (
              <ModelPickerStrip
                selectedModelId={selectedModelId}
                onSelect={handlePickerSelect}
                variant="panel"
                mode={activeSessionMode}
                apiProviders={apiProviders}
                onSelectApi={handleApiPickerSelect}
                codexModels={codexModels}
                onSelectCodex={onSelectCodexModel}
                selectedEffort={selectedEffort}
                onSelectEffort={onSelectEffort}
              />
            )}

            {activeSessionMode !== 'codex' && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span className="expanded-label">{t.weeklyUsage}</span>
                  <span className="expanded-value">{Math.round(weeklyPct * 100)}%</span>
                </div>
                <div className="bar-wrap">
                  <div className="bar-fill" style={{ width: `${weeklyPct * 100}%`, background: barColor(weeklyPct) }} />
                </div>
                {(() => {
                  const tail = formatCountdown(reset7dAt)
                  if (!tail) return null
                  return <div className="usage-reset-hint">{t.resetsIn} {tail}</div>
                })()}
              </div>
            )}

            <div className="divider" />

            {(() => {
              // Split sessions into two groups for display: stock
              // Anthropic sessions vs API-mode sessions. Each group's
              // label only renders if at least one session belongs to
              // it, so a user without any API providers configured sees
              // exactly the same UI as before.
              const anthropicSessions = sessions.filter(s => s.mode !== 'api' && s.mode !== 'codex')
              const apiSessions       = sessions.filter(s => s.mode === 'api')
              const codexSessions     = sessions.filter(s => s.mode === 'codex')
              const canCollapseAnthropic = anthropicSessions.length >= 3
              const canCollapseCodex     = codexSessions.length >= 3
              const showAnthropicRows    = !canCollapseAnthropic || !collapsedGroups.anthropic
              const showCodexRows        = !canCollapseCodex || !collapsedGroups.codex
              const toggleGroup = (group: 'anthropic' | 'codex'): void => {
                setCollapsedGroups(prev => ({ ...prev, [group]: !prev[group] }))
              }
              const renderRow = (s: Session): JSX.Element => (
                <SessionRow
                  key={s.id}
                  session={s}
                  active={activeSessionId !== null && s.id === activeSessionId}
                  apiBalance={s.mode === 'api' && s.apiProviderId ? apiBalances[s.apiProviderId] ?? null : null}
                  apiUsage={s.mode === 'api' ? apiUsage[s.id] ?? null : null}
                  onSelect={() => onSelectSession(s.id)}
                  onRemove={() => onRemoveSession(s.id)}
                  onRename={name => onRenameSession(s.id, name)}
                  onOpenHarness={HARNESS_BUTTON_VISIBLE ? () => onOpenHarness(s.id) : undefined}
                  onOpenRemote={() => onOpenRemote(s.id)}
                  onHoverHint={setHoverHint}
                />
              )
              return (
                <>
                  {anthropicSessions.length > 0 && (
                    <>
                      <div className="session-group-header">
                        <span className="expanded-label">{t.sessions}</span>
                        {canCollapseAnthropic && (
                          <button
                            className="session-group-toggle"
                            type="button"
                            aria-expanded={!collapsedGroups.anthropic}
                            aria-label={`${collapsedGroups.anthropic ? 'Expand' : 'Collapse'} ${t.sessions}`}
                            onClick={() => toggleGroup('anthropic')}
                          >
                            {collapsedGroups.anthropic ? '▸' : '▾'}
                          </button>
                        )}
                      </div>
                      {showAnthropicRows && <div className="sessions-list">{anthropicSessions.map(renderRow)}</div>}
                    </>
                  )}
                  {apiSessions.length > 0 && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, marginTop: anthropicSessions.length > 0 ? 10 : 0 }}>
                        <span className="expanded-label">{t.apiSessions}</span>
                      </div>
                      <div className="sessions-list sessions-list--api">{apiSessions.map(renderRow)}</div>
                    </>
                  )}
                  {codexSessions.length > 0 && (
                    <>
                      <div className="session-group-header" style={{ marginTop: (anthropicSessions.length > 0 || apiSessions.length > 0) ? 10 : 0 }}>
                        <span className="expanded-label">{t.codexSessions}</span>
                        {canCollapseCodex && (
                          <button
                            className="session-group-toggle"
                            type="button"
                            aria-expanded={!collapsedGroups.codex}
                            aria-label={`${collapsedGroups.codex ? 'Expand' : 'Collapse'} ${t.codexSessions}`}
                            onClick={() => toggleGroup('codex')}
                          >
                            {collapsedGroups.codex ? '▸' : '▾'}
                          </button>
                        )}
                      </div>
                      {showCodexRows && <div className="sessions-list sessions-list--codex">{codexSessions.map(renderRow)}</div>}
                    </>
                  )}
                </>
              )
            })()}

            <button className="add-session-btn" onClick={onAddSession}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <line x1="5" y1="1" x2="5" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <line x1="1" y1="5" x2="9" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {t.newSession}
            </button>

            <div className="action-row">
              <button
                className={`action-btn${showSettings ? ' active' : ''}`}
                onClick={toggleSettings}
                aria-label="Settings"
              >
                <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                  <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"
                    stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                {t.settings}
              </button>
              <button className="action-btn danger" onClick={() => onAction('stop')}>
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
                  <rect x="1.5" y="1.5" width="6" height="6" rx="1" fill="currentColor" opacity="0.85" />
                </svg>
                {t.stopAll}
              </button>
              <button
                className="action-btn danger-strong"
                onClick={() => { if (showSettings) toggleSettings(); onQuit() }}
                aria-label={t.quitApp}
              >
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                  <path d="M5 1.5 V5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  <path d="M2.4 3.2 A3.2 3.2 0 1 0 7.6 3.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
                </svg>
                {t.quitApp}
              </button>
            </div>

            {showSettings && (
              <div className="settings-panel">
                <ApiProvidersPanel
                  list={() => window.ccc.apiProviderList()}
                  save={(c, k) => window.ccc.apiProviderSave(c, k)}
                  remove={(id) => window.ccc.apiProviderRemove(id)}
                  test={(c, k) => window.ccc.apiProviderTest(c, k)}
                />

                <CodexCliPanel
                  // Settings → "Check Again" should bypass the 60 s cache.
                  // Fall back to the cached detect() in the unlikely case
                  // that the preload bundle is older than this renderer
                  // build (preload doesn't HMR — a stale dev session can
                  // otherwise throw "redetect is not a function").
                  detectClaude={() => (window.ccc.claudeCliRedetect ?? window.ccc.claudeCliDetect)()}
                  detect       ={() => (window.ccc.codexCliRedetect  ?? window.ccc.codexCliDetect )()}
                />

                <span className="settings-label">{t.language}</span>
                <div className="settings-lang-row">
                  {((['en', 'zh', 'ko'] as const) as readonly LangCode[]).map(code => (
                    <button
                      key={code}
                      className={`settings-lang-btn${lang === code ? ' is-active' : ''}`}
                      onClick={() => setLang(code)}
                    >
                      {LANG_LABELS[code]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Snap-zone overlays — only painted during a drag. The drag is
          horizontal-only, so the targets are the two work-area edge bands:
          drag into the LEFT band → corner-shrunk (简约 circle), into the
          RIGHT band → top-hidden (auto-hide strip). The whole middle is
          plain default, so it needs no painted target. The `is-active`
          modifier brightens whichever band the cursor is over. */}
      {dragState && (
        <>
          <div
            className={`snap-zone snap-zone--corner${dragState.hoverZone === 'corner' ? ' is-active' : ''}`}
            aria-hidden="true"
          >
            <span className="snap-zone__label">{t.overlayDropCorner}</span>
          </div>
          <div
            className={`snap-zone snap-zone--hide${dragState.hoverZone === 'top' ? ' is-active' : ''}`}
            aria-hidden="true"
          >
            <span className="snap-zone__label">{t.overlayDropHide}</span>
          </div>
        </>
      )}

      {/* Per-mode popup suppression rules — see shouldSuppressNotifPopup.
          Informational popups (done, message) hide in non-default modes;
          actionable popups (permission) ALWAYS show so the user can
          respond from any mode. ADDITIONALLY: in corner-shrunk mode the
          user can "我知道了"-dismiss the permission popup by clicking the
          circle (cornerWaitingDismissed flips true) — popup + banner
          both collapse and stay collapsed until the next state
          transition re-arms them. The Yes/No/Always buttons remain
          actionable in the popup as long as it's visible; dismissing
          only hides the popup without answering, so Claude is still
          waiting (the user can still answer in the terminal). */}
      {notification
        && !shouldSuppressNotifPopup(overlayMode, notification.type)
        && !(overlayMode === 'corner-shrunk' && cornerWaitingDismissed)
        && (
        <NotificationPopup
          notification={notification}
          onDismiss={onDismissNotif}
          onAllow={key => { onHookDecision(key, 0); onDismissNotif() }}
          onAlwaysAllow={(key, tool) => onAllowAlways(key, tool)}
          onDeny={key  => { onHookDecision(key, 1); onDismissNotif() }}
          onReplyAndAllow={(key, text) => onReplyAndAllow(key, text)}
        />
      )}

      {remoteSession && (
        <RemoteControlPopup
          sessionName={remoteSession.name}
          busy={remoteBusy}
          available={remoteSession.mode !== 'codex' && remoteSession.mode !== 'api'}
          onActivate={() => onActivateRemote(remoteSession.id)}
          onClose={onCloseRemote}
        />
      )}

    </>
  )
}
