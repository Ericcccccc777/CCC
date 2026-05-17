import { useEffect } from 'react'
import { useLang } from '../i18n'

export interface ApiSwitchPopupProps {
  providerLabel: string  // 'DeepSeek' / 'deepseek-v4-flash' etc.
  busy:          boolean
  onRestart:     () => void
  onOpenNew:     () => void
  onCancel:      () => void
}

// Two paths:
// - Restart: kill the active session and respawn in the same SessionRow
//   slot using API env vars; conversation history is not preserved.
// - Open New: leave the active session alone, spawn a new SessionRow
//   in the same workspace using API env vars.
// ESC and the X close the popup without doing either.
export function ApiSwitchPopup({ providerLabel, busy, onRestart, onOpenNew, onCancel }: ApiSwitchPopupProps): JSX.Element {
  const t = useLang()

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="api-switch-popup" role="dialog" aria-label={t.apiSwitchTitle}>
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

      <div className="api-switch-popup__title">{t.apiSwitchTitle}</div>
      <div className="api-switch-popup__provider">{providerLabel}</div>
      <div className="api-switch-popup__hint">{t.apiSwitchHistoryWarning}</div>

      <div className="api-switch-popup__actions">
        <button
          className="api-switch-popup__btn api-switch-popup__btn--primary"
          onClick={onRestart}
          disabled={busy}
        >
          {busy ? t.apiSwitchRestarting : t.apiSwitchRestart}
        </button>
        <button
          className="api-switch-popup__btn"
          onClick={onOpenNew}
          disabled={busy}
        >
          {t.apiSwitchOpenNew}
        </button>
      </div>

      <div className="api-switch-popup__esc">{t.esc}: {t.apiCancel}</div>
    </div>
  )
}
