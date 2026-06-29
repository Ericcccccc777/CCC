import { useEffect } from 'react'
import { useLang } from '../i18n'

export interface ContextAlertPopupProps {
  pct:       number       // 0–1 real context-window usage (from statusLine)
  onCompact: () => void   // types /compact into the session
  onHandoff: () => void   // types /handoff into the session
  onDismiss: () => void
}

// Surfaced when a session's REAL context usage (statusLine context_window.
// used_percentage) crosses a high threshold. Two paths:
// - Compact: /compact summarizes the conversation in place (Claude Code builtin).
// - Hand off: /handoff snapshots state and continues in a fresh session
//   (CCC-MAGI skill).
// ESC and the X dismiss without doing either. Reuses the .api-switch-popup
// styles so there's no new CSS to maintain.
export function ContextAlertPopup({ pct, onCompact, onHandoff, onDismiss }: ContextAlertPopupProps): JSX.Element {
  const t = useLang()

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onDismiss() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDismiss])

  return (
    <div className="api-switch-popup" role="dialog" aria-label={t.contextThresholdTitle}>
      <button
        className="notif-close-btn"
        aria-label="Dismiss notification"
        onClick={onDismiss}
      >
        <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
          <line x1="1.5" y1="1.5" x2="7.5" y2="7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="7.5" y1="1.5" x2="1.5" y2="7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      <div className="api-switch-popup__title">{t.contextThresholdTitle}</div>
      <div className="api-switch-popup__provider">{Math.round(pct * 100)}%</div>
      <div className="api-switch-popup__hint">{t.contextThresholdHint}</div>

      <div className="api-switch-popup__actions">
        <button
          className="api-switch-popup__btn api-switch-popup__btn--primary"
          onClick={onCompact}
        >
          {t.contextCompact}
        </button>
        <button
          className="api-switch-popup__btn"
          onClick={onHandoff}
        >
          {t.contextHandoff}
        </button>
      </div>

      <div className="api-switch-popup__esc">{t.esc}: {t.contextDismiss}</div>
    </div>
  )
}
