import { useState } from 'react'
import { useLang } from '../i18n'

// Drives Claude Code's NATIVE Remote Control for a session: enabling injects
// `/remote-control` (+ brings the terminal forward + marks the session remote so
// CCC defers permissions to Claude's native prompt). The real session URL/QR is
// printed by Claude Code in the session's own terminal, so we guide the user
// there rather than fabricate a QR. Native RC needs a claude.ai session.
interface RemoteControlPopupProps {
  sessionName: string
  busy:        boolean
  available:   boolean
  onActivate:  () => void
  onClose:     () => void
}

type View = 'intro' | 'guide' | 'busy'

export function RemoteControlPopup({
  sessionName, busy, available, onActivate, onClose,
}: RemoteControlPopupProps): JSX.Element {
  const t = useLang()
  const [view, setView] = useState<View>('intro')

  const enable = (): void => {
    if (busy) { setView('busy'); return }
    onActivate()
    setView('guide')
  }

  return (
    <div className="remote-popup" onClick={e => e.stopPropagation()}>
      <div className="remote-popup-header">
        <span className="remote-popup-session">{t.remoteControl} · {sessionName}</span>
        <button className="remote-popup-close-btn" onClick={onClose} aria-label={t.remoteClose}>
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
            <line x1="1" y1="1" x2="7" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="7" y1="1" x2="1" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {!available ? (
        <div className="remote-popup-body">
          <p className="remote-popup-note">{t.remoteUnavailable}</p>
          <div className="remote-popup-actions">
            <button className="remote-popup-btn primary" onClick={onClose}>{t.remoteClose}</button>
          </div>
        </div>
      ) : view === 'intro' ? (
        <div className="remote-popup-body">
          <p className="remote-popup-intro">{t.remoteIntro}</p>
          <button className="remote-popup-btn primary remote-popup-enable" onClick={enable}>
            {t.remoteEnable}
          </button>
        </div>
      ) : view === 'guide' ? (
        <div className="remote-popup-body">
          <div className="remote-popup-guide-title">{t.remoteEnabledTitle}</div>
          <ol className="remote-popup-steps">
            <li>{t.remoteStep1}</li>
            <li>{t.remoteStep2}</li>
            <li>{t.remoteStep3}</li>
          </ol>
          <div className="remote-popup-actions">
            <button className="remote-popup-btn ghost" onClick={() => setView('intro')}>{t.remoteBack}</button>
            <button className="remote-popup-btn primary" onClick={onClose}>{t.remoteDone}</button>
          </div>
        </div>
      ) : (
        <div className="remote-popup-busy">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="10" cy="10" r="8.5" stroke="oklch(0.78 0.18 75)" strokeWidth="1.4" fill="none" />
            <line x1="10" y1="6" x2="10" y2="11" stroke="oklch(0.78 0.18 75)" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="10" cy="13.5" r="0.85" fill="oklch(0.78 0.18 75)" />
          </svg>
          <div className="remote-popup-busy-text">{t.remoteBusyText}</div>
          <div className="remote-popup-actions">
            <button className="remote-popup-btn ghost" onClick={() => setView('intro')}>{t.remoteBack}</button>
            <button className="remote-popup-btn primary" onClick={onClose}>{t.remoteClose}</button>
          </div>
        </div>
      )}
    </div>
  )
}
