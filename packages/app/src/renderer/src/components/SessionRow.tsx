import { useState, useEffect, useRef } from 'react'
import type { Session } from '../types'
import type { ApiBalanceSnapshot, ApiUsageSnapshot } from '../../../shared/api-usage'
import { useLang } from '../i18n'

const STATE_DOT_COLOR: Record<string, string> = {
  streaming: 'oklch(0.65 0.18 145)',
  done:      '#5CC878',
  waiting:   '#D4A847',
  idle:      'rgba(255,255,255,0.15)',
}

// Symbol lookup for the most common DeepSeek-billing currencies. Falls back
// to suffixing the ISO code when the currency isn't recognised — never throws,
// since the currency comes verbatim from /user/balance and we don't want a
// surprise string to crash the row.
const CURRENCY_SYMBOL: Record<string, string> = {
  CNY: '¥',
  USD: '$',
  EUR: '€',
  JPY: '¥',
  HKD: 'HK$',
}

function formatMoney(amount: number, currency: string): string {
  const sym  = CURRENCY_SYMBOL[currency]
  // 4 decimals for tiny amounts (sub-cent costs); 2 for normal balances.
  const dec  = amount > 0 && amount < 0.01 ? 4 : 2
  const body = amount.toFixed(dec)
  return sym ? `${sym}${body}` : `${body} ${currency}`
}

function formatTokens(n: number): string {
  if (n < 1000)       return String(n)
  if (n < 1_000_000)  return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

interface SessionRowProps {
  session:        Session
  active:         boolean
  apiBalance?:    ApiBalanceSnapshot | null
  apiUsage?:      ApiUsageSnapshot   | null
  onSelect:       () => void
  onRemove:       () => void
  onRename:       (name: string) => void
  onOpenRemote?:  () => void
  // Optional: when provided, button hovers report into the pill's
  // model-name hint area so the user can read what each icon does
  // without relying on native title tooltips (those clip under the
  // top-of-screen pill window).
  onHoverHint?:   (text: string | null) => void
}

export function SessionRow({
  session, active, apiBalance, apiUsage,
  onSelect, onRemove, onRename, onOpenRemote, onHoverHint,
}: SessionRowProps) {
  const t = useLang()
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(session.name)
  const inputRef              = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const commit = (): void => {
    setEditing(false)
    if (val.trim()) onRename(val.trim())
    else setVal(session.name)
  }

  const shortPath = session.workspace.length > 32
    ? '…' + session.workspace.slice(-31).replace(/\\/g, '/')
    : session.workspace.replace(/\\/g, '/')

  const dotColor = active
    ? '#CC9B7A'
    : (STATE_DOT_COLOR[session.state] ?? 'rgba(255,255,255,0.15)')

  // API-mode rows show two extra metric lines below the workspace path.
  // Each is rendered only if the corresponding data has arrived; the
  // balance row also greys out when the latest /user/balance probe failed
  // (apiBalance.stale === true).
  const showApiStats = session.mode === 'api' && (apiBalance || apiUsage)
  const recoveryLabel =
    session.recoveryCapability === 'full' ? t.recoverCapabilityFull :
    session.recoveryCapability === 'best-effort' ? t.recoverCapabilityBestEffort :
    session.recoveryCapability === 'basic' ? t.recoverCapabilityBasic :
    null

  return (
    <div className={`session-row${active ? ' active' : ''}`} onClick={onSelect}>
      <div className="session-dot" style={{ background: dotColor }} />

      {editing ? (
        <input
          ref={inputRef}
          className="session-name-input"
          value={val}
          onChange={e => setVal(e.target.value)}
          onBlur={commit}
          onClick={e => e.stopPropagation()}
          onKeyDown={e => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') { setEditing(false); setVal(session.name) }
          }}
        />
      ) : (
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            className="session-name"
            onDoubleClick={e => { e.stopPropagation(); setEditing(true) }}
            title="Double-click to rename"
          >
            {session.name}
          </div>
          {session.workspace && (
            <div
              style={{ fontSize: '9px', color: 'rgba(255,255,255,0.25)', marginTop: '1px' }}
              title={session.workspace}
            >
              {shortPath}
            </div>
          )}
          {session.origin === 'external' && recoveryLabel && (
            <div className="session-row-recovery">
              {t.recoverExternal} · {recoveryLabel}
            </div>
          )}
          {showApiStats && (
            <div className="session-row-api-stats">
              {apiBalance && (
                <div className={`session-row-api-balance${apiBalance.stale ? ' is-stale' : ''}`}>
                  <span>{t.balance} {formatMoney(apiBalance.balance, apiBalance.currency)}</span>
                  {typeof apiBalance.weeklySpending === 'number' && (
                    <>
                      <span className="session-row-api-sep">·</span>
                      <span>{t.thisWeek} {formatMoney(apiBalance.weeklySpending, apiBalance.currency)}</span>
                    </>
                  )}
                </div>
              )}
              {apiUsage && (apiUsage.inputTokens > 0 || apiUsage.outputTokens > 0) && (
                <div className="session-row-api-tokens">
                  <span>{formatTokens(apiUsage.inputTokens)} → {formatTokens(apiUsage.outputTokens)}</span>
                  <span className="session-row-api-sep">·</span>
                  <span>{formatMoney(apiUsage.estimatedCostUsd, 'USD')}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {onOpenRemote && (
        <button
          className="session-remote"
          onClick={e => { e.stopPropagation(); onOpenRemote() }}
          aria-label={`Open remote control for ${session.name}`}
          onMouseEnter={() => onHoverHint?.(t.remoteControl)}
          onMouseLeave={() => onHoverHint?.(null)}
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
            <rect x="1.5" y="1.5"  width="5" height="5" rx="1"
              stroke="currentColor" strokeWidth="1.1" fill="none" />
            <rect x="9.5" y="1.5"  width="5" height="5" rx="1"
              stroke="currentColor" strokeWidth="1.1" fill="none" />
            <rect x="1.5" y="9.5"  width="5" height="5" rx="1"
              stroke="currentColor" strokeWidth="1.1" fill="none" />
            <rect x="10.5" y="9.5" width="3" height="3" rx="0.5"
              fill="currentColor" />
            <rect x="13.5" y="12.5" width="1" height="1" fill="currentColor" />
            <rect x="9.5" y="13.5"  width="1" height="1" fill="currentColor" />
          </svg>
        </button>
      )}


      <button
        className="session-close"
        onClick={e => { e.stopPropagation(); onRemove() }}
        aria-label={`Close session ${session.name}`}
      >
        ✕
      </button>
    </div>
  )
}
