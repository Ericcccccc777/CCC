import { useEffect } from 'react'
import { useLang } from '../i18n'
import type { CodexReasoningEffort } from '../types'

export interface CodexSwitchPopupProps {
  modelLabel:      string
  busy:            boolean
  onSelectEffort:  (effort: CodexReasoningEffort) => void
  onCancel:        () => void
}

const CODEX_EFFORTS: ReadonlyArray<{ id: CodexReasoningEffort; labelKey: 'codexEffortLow' | 'codexEffortMedium' | 'codexEffortHigh' | 'codexEffortXhigh' }> = [
  { id: 'low',    labelKey: 'codexEffortLow' },
  { id: 'medium', labelKey: 'codexEffortMedium' },
  { id: 'high',   labelKey: 'codexEffortHigh' },
  { id: 'xhigh',  labelKey: 'codexEffortXhigh' },
]

export function CodexSwitchPopup({
  modelLabel, busy, onSelectEffort, onCancel,
}: CodexSwitchPopupProps): JSX.Element {
  const t = useLang()

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="api-switch-popup api-switch-popup--codex-model" role="dialog" aria-label={t.codexSwitchTitle}>
      <button
        className="notif-close-btn"
        aria-label="Dismiss notification"
        onClick={onCancel}
      >
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
          <line x1="1.5" y1="1.5" x2="7.5" y2="7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="7.5" y1="1.5" x2="1.5" y2="7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      <div className="api-switch-popup__title">{t.codexSwitchTitle}</div>
      <div className="api-switch-popup__provider">{modelLabel}</div>
      <div className="api-switch-popup__hint">{t.codexSwitchHint}</div>

      <div className="codex-effort-label">{t.codexReasoningEffort}</div>
      <div className="codex-effort-grid" role="radiogroup" aria-label={t.codexReasoningEffort}>
        {CODEX_EFFORTS.map(effort => (
          <button
            key={effort.id}
            className="codex-effort-btn"
            role="radio"
            aria-checked={false}
            onClick={() => onSelectEffort(effort.id)}
            disabled={busy}
          >
            {t[effort.labelKey]}
          </button>
        ))}
      </div>

      <div className="api-switch-popup__esc">{t.esc}: {t.apiCancel}</div>
    </div>
  )
}
