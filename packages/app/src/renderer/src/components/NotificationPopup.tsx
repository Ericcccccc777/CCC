import { useEffect, useState } from 'react'
import type { SessionNotification } from '../types'
import { useLang } from '../i18n'

interface NotificationPopupProps {
  notification:   SessionNotification
  onDismiss:      () => void
  onAllow:        (hookKey: string) => void
  onAlwaysAllow:  (hookKey: string, tool: string) => void
  onDeny:         (hookKey: string) => void
  onReplyAndAllow:(hookKey: string, text: string) => void
}

interface QuestionOption {
  label:       string
  description: string | null
}

interface QuestionSpec {
  question:    string
  options:     QuestionOption[]
  multiSelect: boolean
}

function XIcon(): JSX.Element {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
      <line x1="1" y1="1" x2="7" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="7" y1="1" x2="1" y2="7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

// Parse AskUserQuestion's tool_input shape. Strict: only the AskUserQuestion
// `questions[]` schema triggers the "Claude is asking" UI. We do NOT fall
// back to single-field `question`/`prompt`/`query`/etc., because unrelated
// tools (ToolSearch's `query`, Agent's `prompt`, WebSearch/WebFetch) would
// otherwise be misread as questions — most visibly, ToolSearch's
// `{ query: "select:AskUserQuestion" }` preamble was rendering as a
// textarea question that the user had to ESC past before the real
// AskUserQuestion popup arrived.
function parseQuestionSpec(toolInput: unknown): QuestionSpec | null {
  if (!toolInput || typeof toolInput !== 'object') return null
  const inp = toolInput as Record<string, unknown>

  const qs = inp['questions']
  if (!Array.isArray(qs) || qs.length === 0 || !qs[0] || typeof qs[0] !== 'object') return null
  const q0       = qs[0] as Record<string, unknown>
  const question = typeof q0['question'] === 'string' ? q0['question'] as string : ''
  if (!question) return null
  const rawOpts  = Array.isArray(q0['options']) ? q0['options'] as unknown[] : []
  const options: QuestionOption[] = rawOpts
    .filter((o): o is Record<string, unknown> => !!o && typeof o === 'object')
    .map(o => ({
      label:       typeof o['label']       === 'string' ? o['label']       as string : '',
      description: typeof o['description'] === 'string' ? o['description'] as string : null,
    }))
    .filter(o => o.label !== '')
  return { question, options, multiSelect: q0['multiSelect'] === true }
}

export function NotificationPopup({
  notification, onDismiss, onAllow, onAlwaysAllow, onDeny, onReplyAndAllow,
}: NotificationPopupProps): JSX.Element | null {
  const t = useLang()
  const [replyText, setReplyText] = useState('')

  // Auto-dismiss "done" popup after 8 s (state icon stays).
  useEffect(() => {
    if (notification.type !== 'done') return
    const t = setTimeout(onDismiss, 8000)
    return () => clearTimeout(t)
  }, [notification.type, onDismiss])

  // Clear typed text whenever a new notification arrives.
  useEffect(() => { setReplyText('') }, [notification])

  if (notification.type === 'done') {
    return (
      <div className="notif-popup notif-done-wrap" onClick={onDismiss}>
        <span className="notif-done-icon">✓</span>
        <span className="notif-done-text">{t.responseComplete}</span>
        <button
          className="notif-close-btn"
          onClick={e => { e.stopPropagation(); onDismiss() }}
          aria-label="Dismiss notification"
        ><XIcon /></button>
      </div>
    )
  }

  if (notification.type === 'permission' && notification.hookKey) {
    const hookKey = notification.hookKey
    const tool    = notification.tool ?? 'unknown'
    const spec    = parseQuestionSpec(notification.toolInput)

    // ── "Claude is asking" UI: real question with optional options ──
    if (spec) {
      const hasOptions = spec.options.length > 0
      const canSubmit  = replyText.trim().length > 0

      const submitReply = (): void => {
        if (!canSubmit) return
        onReplyAndAllow(hookKey, replyText.trim())
        setReplyText('')
      }
      const pickOption = (opt: QuestionOption): void => {
        onReplyAndAllow(hookKey, opt.label)
      }
      // ESC = "I won't answer here" — let the tool run so Claude Code's native
      // prompt takes over in the terminal. Dismiss the popup either way.
      const skip = (): void => { onAllow(hookKey) }

      return (
        <div
          className="notif-popup notif-perm-wrap"
          tabIndex={-1}
          onClick={e => e.stopPropagation()}
          onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); skip() } }}
        >
          <div className="notif-perm-header">
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="6" r="5" stroke="oklch(0.78 0.18 75)" strokeWidth="1.2" fill="none" />
              <path d="M4.6 5 Q6 3.2 7.4 5 Q6 6 6 7.2"
                stroke="oklch(0.78 0.18 75)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
              <circle cx="6" cy="9" r="0.6" fill="oklch(0.78 0.18 75)" />
            </svg>
            {t.claudeIsAsking}
            <button
              className="notif-close-btn"
              onClick={e => { e.stopPropagation(); skip() }}
              aria-label="Dismiss notification"
            ><XIcon /></button>
          </div>

          <div className="notif-perm-question">{spec.question}</div>

          {hasOptions && (
            <div className="notif-options">
              {spec.options.map((o, i) => (
                <button
                  key={`${i}-${o.label}`}
                  className="notif-option-btn"
                  onClick={() => pickOption(o)}
                >
                  <span className="notif-option-label">{o.label}</span>
                  {o.description && <span className="notif-option-desc">{o.description}</span>}
                </button>
              ))}
            </div>
          )}

          {!hasOptions && (
            <div className="notif-reply">
              <textarea
                className="notif-reply-input"
                placeholder={t.replyPlaceholder}
                rows={2}
                autoFocus
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    submitReply()
                  } else if (e.key === 'Escape') {
                    e.preventDefault()
                    skip()
                  }
                }}
              />
            </div>
          )}

          <div className="notif-perm-actions">
            {!hasOptions && (
              <button className="perm-btn reply" disabled={!canSubmit} onClick={submitReply}>
                {t.enterKey}
              </button>
            )}
            <button className="perm-btn deny" onClick={skip}>
              {t.esc}
            </button>
          </div>
        </div>
      )
    }

    // ── Regular tool permission (Bash / Read / Edit / unknown tool) ──
    const rawPreview = (notification.toolInput && tool !== 'unknown')
      ? JSON.stringify(notification.toolInput, null, 0).slice(0, 100)
      : null

    return (
      <div className="notif-popup notif-perm-wrap" onClick={e => e.stopPropagation()}>
        <div className="notif-perm-header">
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path d="M6 1L11 10H1L6 1Z" stroke="oklch(0.78 0.18 75)" strokeWidth="1.3"
              fill="none" strokeLinejoin="round" />
            <line x1="6" y1="5" x2="6" y2="7.5" stroke="oklch(0.78 0.18 75)"
              strokeWidth="1.2" strokeLinecap="round" />
            <circle cx="6" cy="9" r="0.6" fill="oklch(0.78 0.18 75)" />
          </svg>
          {t.permissionRequired}
          <button
            className="notif-close-btn"
            onClick={e => { e.stopPropagation(); onAllow(hookKey) }}
            aria-label="Dismiss notification"
          ><XIcon /></button>
        </div>

        {tool !== 'unknown' && <div className="notif-perm-tool">{tool}</div>}
        {rawPreview && <div className="notif-perm-input">{rawPreview}</div>}

        <div className="notif-perm-actions">
          <button className="perm-btn allow" onClick={() => onAllow(hookKey)}>
            {t.yes}
          </button>
          <button className="perm-btn always"
            onClick={() => onAlwaysAllow(hookKey, tool)}
            title={`Always allow ${tool}`}>
            {t.always}
          </button>
          <button className="perm-btn deny" onClick={() => onDeny(hookKey)}>
            {t.no}
          </button>
        </div>
      </div>
    )
  }

  if (notification.type === 'message' && notification.message) {
    return (
      <div className="notif-popup notif-msg-wrap" onClick={onDismiss}>
        <div className="notif-msg-text">{notification.message}</div>
        <button
          className="notif-close-btn"
          onClick={e => { e.stopPropagation(); onDismiss() }}
          aria-label="Dismiss notification"
        ><XIcon /></button>
      </div>
    )
  }

  return null
}
