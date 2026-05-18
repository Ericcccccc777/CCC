import { useEffect } from 'react'
import { useLang } from '../i18n'

export interface QuitConfirmPopupProps {
  sessionCount: number
  onConfirm:    () => void
  onCancel:     () => void
}

export function QuitConfirmPopup({
  sessionCount, onConfirm, onCancel,
}: QuitConfirmPopupProps): JSX.Element {
  const t = useLang()

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
      else if (e.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, onConfirm])

  const body = sessionCount > 0 ? t.quitConfirmBodyN(sessionCount) : t.quitConfirmBody

  return (
    <div className="quit-confirm-popup" role="alertdialog" aria-label={t.quitConfirmTitle}>
      <div className="quit-confirm-popup__title">{t.quitConfirmTitle}</div>
      <div className="quit-confirm-popup__body">{body}</div>
      <div className="quit-confirm-popup__actions">
        <button
          className="quit-confirm-popup__btn"
          onClick={onCancel}
        >
          {t.quitConfirmCancel}
        </button>
        <button
          className="quit-confirm-popup__btn quit-confirm-popup__btn--danger"
          onClick={onConfirm}
          autoFocus
        >
          {t.quitConfirmAction}
        </button>
      </div>
    </div>
  )
}
