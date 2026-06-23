import { useEffect, useState } from 'react'
import { useLang } from '../i18n'

export interface NewSessionEnginePopupProps {
  busy:            boolean
  claudeAvailable: boolean
  codexAvailable:  boolean
  onSelectClaude:  (skipPermissions: boolean) => void
  onSelectCodex:   (skipPermissions: boolean) => void
  onCancel:        () => void
}

export function NewSessionEnginePopup({
  busy, claudeAvailable, codexAvailable, onSelectClaude, onSelectCodex, onCancel,
}: NewSessionEnginePopupProps): JSX.Element {
  const t = useLang()

  // Full-access launches `claude --dangerously-skip-permissions` /
  // `codex --dangerously-bypass-approvals-and-sandbox`. Off by default so the
  // safe path is the one a user gets without thinking about it.
  const [fullAccess, setFullAccess] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="engine-picker-popup" role="dialog" aria-label={t.newSessionEngineTitle}>
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

      <div className="engine-picker-popup__title">{t.newSessionEngineTitle}</div>
      <div className="engine-picker-popup__hint">{t.newSessionEngineHint}</div>

      <div className="engine-picker-popup__perm" role="radiogroup" aria-label={t.newSessionPermLabel}>
        <span className="engine-picker-popup__perm-label">{t.newSessionPermLabel}</span>
        <div className="engine-picker-popup__seg">
          <button
            className={`engine-picker-popup__seg-btn${!fullAccess ? ' is-active' : ''}`}
            role="radio"
            aria-checked={!fullAccess}
            disabled={busy}
            onClick={() => setFullAccess(false)}
          >
            {t.newSessionPermNormal}
          </button>
          <button
            className={`engine-picker-popup__seg-btn engine-picker-popup__seg-btn--full${fullAccess ? ' is-active' : ''}`}
            role="radio"
            aria-checked={fullAccess}
            disabled={busy}
            onClick={() => setFullAccess(true)}
          >
            {t.newSessionPermFull}
          </button>
        </div>
      </div>
      {fullAccess && (
        <div className="engine-picker-popup__perm-warn">{t.newSessionPermFullHint}</div>
      )}

      <div className="engine-picker-popup__actions">
        {claudeAvailable && (
          <button
            className="engine-picker-popup__btn"
            disabled={busy}
            onClick={() => onSelectClaude(fullAccess)}
          >
            <span className="engine-picker-popup__name">{t.claudeCodeCli}</span>
            <span className="engine-picker-popup__desc">{t.newSessionClaudeHint}</span>
          </button>
        )}
        {codexAvailable && (
          <button
            className="engine-picker-popup__btn engine-picker-popup__btn--codex"
            disabled={busy}
            onClick={() => onSelectCodex(fullAccess)}
          >
            <span className="engine-picker-popup__name">{t.codexCli}</span>
            <span className="engine-picker-popup__desc">{t.newSessionCodexHint}</span>
          </button>
        )}
      </div>

      <div className="api-switch-popup__esc">{t.esc}: {t.apiCancel}</div>
    </div>
  )
}
