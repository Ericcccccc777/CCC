import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { useLang } from '../i18n'

// Placeholder deep-link — swap for the real Claude mobile URL once finalised
export const REMOTE_CONTROL_QR_URL = 'https://claude.ai/'

interface RemoteControlPopupProps {
  sessionName: string
  sessionId:   number
  busy:        boolean
  onActivate:  () => void
  onClose:     () => void
}

type View = 'menu' | 'app-qr' | 'mirror-qr' | 'busy'

export function RemoteControlPopup({
  sessionName, sessionId, busy, onActivate, onClose,
}: RemoteControlPopupProps): JSX.Element {
  const t = useLang()
  const [view,      setView]      = useState<View>('menu')
  const [mirrorUrl, setMirrorUrl] = useState<string>('')
  const [fetching,  setFetching]  = useState(false)

  const pickApp = (): void => {
    if (busy) { setView('busy'); return }
    onActivate()
    setView('app-qr')
  }

  const pickMirror = async (): Promise<void> => {
    setFetching(true)
    try {
      const url = await window.ccc?.getLocalMirrorUrl(sessionId) ?? ''
      setMirrorUrl(url)
      setView('mirror-qr')
    } finally {
      setFetching(false)
    }
  }

  return (
    <div className="remote-popup" onClick={e => e.stopPropagation()}>
      <div className="remote-popup-header">
        <span className="remote-popup-session">{sessionName}</span>
        <button
          className="remote-popup-close-btn"
          onClick={onClose}
          aria-label={t.remoteClose}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
            <line x1="1" y1="1" x2="7" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="7" y1="1" x2="1" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {view === 'menu' && (
        <div className="remote-popup-grid">
          {/* Left: Claude App */}
          <button
            className="remote-popup-card"
            onClick={pickApp}
            aria-label="Phone remote control via QR code"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="6" y="2" width="12" height="20" rx="2.5"
                stroke="currentColor" strokeWidth="1.5" fill="none" />
              <line x1="11" y1="18.5" x2="13" y2="18.5"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              {/* Claude "C" on screen */}
              <path d="M10.5 9.5 A2.5 2.5 0 1 1 10.5 14.5"
                stroke="currentColor" strokeWidth="1.2" fill="none" strokeLinecap="round" />
            </svg>
            <span className="remote-popup-card-label">{t.remoteClaudeApp}</span>
            <span className="remote-popup-card-hint">{t.remoteClaudeAppHint}</span>
          </button>

          {/* Right: Local Mirror */}
          <button
            className="remote-popup-card"
            onClick={() => void pickMirror()}
            disabled={fetching}
            aria-label="Local phone mirror"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="6" y="2" width="12" height="20" rx="2.5"
                stroke="currentColor" strokeWidth="1.5" fill="none" />
              <line x1="11" y1="18.5" x2="13" y2="18.5"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              {/* screen with chat bubbles */}
              <rect x="8.5" y="6.5" width="4.5" height="2" rx="1"
                fill="currentColor" opacity="0.7" />
              <rect x="11" y="10" width="4.5" height="2" rx="1"
                fill="currentColor" opacity="0.5" />
            </svg>
            <span className="remote-popup-card-label">
              {fetching ? t.remoteFetching : t.remoteMirror}
            </span>
            <span className="remote-popup-card-hint">{t.remoteMirrorHint}</span>
          </button>
        </div>
      )}

      {view === 'app-qr' && (
        <div className="remote-popup-qr">
          <div className="remote-popup-qr-frame">
            <QRCodeSVG
              value={REMOTE_CONTROL_QR_URL}
              size={168}
              bgColor="#ffffff"
              fgColor="#0a0a0a"
              level="M"
              includeMargin={false}
            />
          </div>
          <div className="remote-popup-qr-caption">
            {t.remoteScanCaption}
            <br />
            <code>/remote-control</code> {t.remoteCodeSent}
          </div>
          <div className="remote-popup-actions">
            <button className="remote-popup-btn ghost" onClick={() => setView('menu')}>
              {t.remoteBack}
            </button>
            <button className="remote-popup-btn primary" onClick={onClose}>
              {t.remoteDone}
            </button>
          </div>
        </div>
      )}

      {view === 'mirror-qr' && mirrorUrl && (
        <div className="remote-popup-qr">
          <div className="remote-popup-qr-frame">
            <QRCodeSVG
              value={mirrorUrl}
              size={168}
              bgColor="#ffffff"
              fgColor="#0a0a0a"
              level="M"
              includeMargin={false}
            />
          </div>
          <div className="remote-popup-qr-caption">
            {t.remoteMirrorCaption}
            <br />
            <span className="remote-popup-mirror-note">{t.remoteMirrorNote}</span>
            <br />
            <code>{mirrorUrl}</code>
          </div>
          <div className="remote-popup-actions">
            <button className="remote-popup-btn ghost" onClick={() => setView('menu')}>
              {t.remoteBack}
            </button>
            <button className="remote-popup-btn primary" onClick={onClose}>
              {t.remoteDone}
            </button>
          </div>
        </div>
      )}

      {view === 'busy' && (
        <div className="remote-popup-busy">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle cx="10" cy="10" r="8.5"
              stroke="oklch(0.78 0.18 75)" strokeWidth="1.4" fill="none" />
            <line x1="10" y1="6" x2="10" y2="11"
              stroke="oklch(0.78 0.18 75)" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="10" cy="13.5" r="0.85" fill="oklch(0.78 0.18 75)" />
          </svg>
          <div className="remote-popup-busy-text">
            {t.remoteBusyText}
          </div>
          <div className="remote-popup-actions">
            <button className="remote-popup-btn ghost" onClick={() => setView('menu')}>
              {t.remoteBack}
            </button>
            <button className="remote-popup-btn primary" onClick={onClose}>
              {t.remoteClose}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
