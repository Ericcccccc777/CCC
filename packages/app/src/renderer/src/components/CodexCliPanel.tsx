import { useEffect, useState } from 'react'
import { useLang } from '../i18n'
import type { ClaudeCliStatus } from '../../../shared/claude-cli'
import type { CodexCliStatus } from '../../../shared/codex-cli'

export interface CodexCliPanelProps {
  detectClaude: () => Promise<ClaudeCliStatus>
  detect:  () => Promise<CodexCliStatus>
}

type Status =
  | { kind: 'idle' }
  | { kind: 'detecting' }
  | { kind: 'ok';    message: string }
  | { kind: 'error'; message: string }

type CliPage = 'claude' | 'codex'

export function CodexCliPanel({ detectClaude, detect }: CodexCliPanelProps): JSX.Element {
  const t = useLang()
  const [claude,  setClaude]  = useState<ClaudeCliStatus | null>(null)
  const [codex,   setCodex]   = useState<CodexCliStatus | null>(null)
  const [status,  setStatus]  = useState<Status>({ kind: 'idle' })
  const [page,    setPage]    = useState<CliPage>('claude')

  const reloadClaude = async (): Promise<ClaudeCliStatus> => {
    const s = await detectClaude()
    setClaude(s)
    return s
  }

  const reload = async (): Promise<CodexCliStatus> => {
    const s = await detect()
    setCodex(s)
    return s
  }

  useEffect(() => {
    void reloadClaude()
    void reload()
  }, [])

  const handleDetect = async (): Promise<void> => {
    setStatus({ kind: 'detecting' })
    try {
      const fresh = await reload()
      setStatus(fresh.installed
        ? { kind: 'ok', message: t.codexCliDetected }
        : { kind: 'error', message: t.codexCliStillNotDetected })
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : t.codexCliDetectFailed })
    }
  }

  const handleClaudeDetect = async (): Promise<void> => {
    setStatus({ kind: 'detecting' })
    try {
      const fresh = await reloadClaude()
      setStatus(fresh.installed
        ? { kind: 'ok', message: t.claudeCliDetected }
        : { kind: 'error', message: t.claudeCliStillNotDetected })
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : t.claudeCliDetectFailed })
    }
  }

  return (
    <div className="settings-api-section cli-panel">
      <div className="cli-panel__header">
        <span className="settings-label">{t.cli}</span>
        <div className="cli-panel__switch" role="tablist" aria-label={t.cli}>
          <button
            className={`cli-panel__tab${page === 'claude' ? ' is-active' : ''}`}
            type="button"
            role="tab"
            aria-selected={page === 'claude'}
            onClick={() => setPage('claude')}
          >
            Claude Code
          </button>
          <button
            className={`cli-panel__tab${page === 'codex' ? ' is-active' : ''}`}
            type="button"
            role="tab"
            aria-selected={page === 'codex'}
            onClick={() => setPage('codex')}
          >
            Codex
          </button>
        </div>
      </div>

      <div className="cli-panel__viewport">
        <div className={`cli-panel__track${page === 'codex' ? ' is-codex' : ''}`}>
          <section className="cli-panel__page" role="tabpanel" aria-label={t.claudeCodeCli}>
            <div className="api-card">
              {!claude?.installed && (
                <>
                  <div className="api-card__row">
                    <span className="api-card__label">{t.cliStatus}</span>
                    <span className="api-card__key">{t.claudeCliNotInstalled}</span>
                  </div>
                  <code className="api-empty__command">npm install -g @anthropic-ai/claude-code</code>
                </>
              )}
              {claude?.installed && (
                <>
                  <div className="api-card__row">
                    <span className="api-card__label">{t.claudeCliAccount}</span>
                    <span className="api-card__key">{claude.loggedIn ? (claude.account ?? t.claudeCliAnthropicAccount) : '—'}</span>
                  </div>
                  {claude.version && (
                    <div className="api-card__row">
                      <span className="api-card__label">{t.claudeCliVersion}</span>
                      <span className="api-card__key">{claude.version}</span>
                    </div>
                  )}
                </>
              )}
              <div className="api-card__actions">
                <button
                  className="api-action-btn"
                  onClick={() => void handleClaudeDetect()}
                  disabled={status.kind === 'detecting'}
                >
                  {status.kind === 'detecting' ? t.codexCliDetecting : t.codexCliDetectAgain}
                </button>
              </div>
              {status.kind === 'ok'    && <div className="api-status api-status--ok">{status.message}</div>}
              {status.kind === 'error' && <div className="api-status api-status--err">{status.message}</div>}
            </div>
          </section>

          <section className="cli-panel__page" role="tabpanel" aria-label={t.codexCli}>
            {!codex?.installed && (
              <div className="api-empty">
                <span className="api-empty__hint">{t.codexCliNotInstalled}</span>
                <span className="api-empty__hint">{t.codexCliInstallHint}</span>
                <code className="api-empty__command">npm install -g @openai/codex</code>
                <button
                  className="api-add-btn"
                  onClick={() => void handleDetect()}
                  disabled={status.kind === 'detecting'}
                >
                  {status.kind === 'detecting' ? t.codexCliDetecting : t.codexCliDetectAgain}
                </button>
              </div>
            )}

            {codex?.installed && (
              <div className="api-card">
                <div className="api-card__row">
                  <span className="api-card__label">{t.cliStatus}</span>
                  <span className="api-card__key">{t.codexCliDetected}</span>
                </div>
                <div className="api-card__actions">
                  <button
                    className="api-action-btn"
                    onClick={() => void handleDetect()}
                    disabled={status.kind === 'detecting'}
                  >
                    {status.kind === 'detecting' ? t.codexCliDetecting : t.codexCliDetectAgain}
                  </button>
                </div>
              </div>
            )}

            {status.kind === 'ok'    && <div className="api-status api-status--ok">{status.message}</div>}
            {status.kind === 'error' && <div className="api-status api-status--err">{status.message}</div>}
          </section>
          </div>
        </div>
    </div>
  )
}
