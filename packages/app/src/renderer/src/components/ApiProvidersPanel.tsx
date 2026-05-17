import { useEffect, useState } from 'react'
import { useLang } from '../i18n'
import {
  DEEPSEEK_MODELS,
  type ApiProviderConfig,
  type ApiProviderListEntry,
  type ApiTestResult,
} from '../../../shared/api-provider'

// Props are the bridge functions, not `window.ccc` directly — keeps the
// component testable without mocking the global preload bridge.
export interface ApiProvidersPanelProps {
  list:   () => Promise<ApiProviderListEntry[]>
  save:   (config: ApiProviderConfig, key: string) => Promise<{ ok: true } | { ok: false; error: string }>
  remove: (id: 'deepseek') => Promise<void>
  test:   (config: ApiProviderConfig, key: string) => Promise<ApiTestResult>
}

type Status =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok',    message: string }
  | { kind: 'error', message: string }

const DEFAULT_DEEPSEEK_MODEL = DEEPSEEK_MODELS[0]?.id ?? 'deepseek-chat'

export function ApiProvidersPanel({ list, save, remove, test }: ApiProvidersPanelProps): JSX.Element {
  const t = useLang()
  const [providers, setProviders] = useState<ApiProviderListEntry[]>([])
  const [formOpen,  setFormOpen]  = useState(false)
  const [formKey,   setFormKey]   = useState('')
  const [status,    setStatus]    = useState<Status>({ kind: 'idle' })

  const reload = async (): Promise<void> => {
    const r = await list()
    setProviders(r)
  }

  useEffect(() => { void reload() }, [])

  const deepseek = providers.find(p => p.id === 'deepseek') ?? null

  const openAddForm = (): void => {
    setFormKey('')
    setStatus({ kind: 'idle' })
    setFormOpen(true)
  }

  const openEditForm = (): void => {
    setFormKey('')
    setStatus({ kind: 'idle' })
    setFormOpen(true)
  }

  const closeForm = (): void => {
    setFormOpen(false)
    setStatus({ kind: 'idle' })
  }

  const handleSave = async (): Promise<void> => {
    if (!formKey.trim()) {
      setStatus({ kind: 'error', message: t.apiTestEmptyKey })
      return
    }
    setStatus({ kind: 'testing' })
    const testResult = await test({ id: 'deepseek', modelId: DEFAULT_DEEPSEEK_MODEL }, formKey)
    if (!testResult.ok) {
      setStatus({ kind: 'error', message: testResult.message })
      return
    }
    const result = await save({ id: 'deepseek', modelId: DEFAULT_DEEPSEEK_MODEL, verifiedAt: Date.now() }, formKey)
    if (!result.ok) {
      const msg = result.error === 'vault-unavailable' ? t.apiVaultUnavailable : result.error
      setStatus({ kind: 'error', message: msg })
      return
    }
    setFormKey('')
    setFormOpen(false)
    setStatus({ kind: 'ok', message: t.apiTestOk })
    await reload()
  }

  const handleRemove = async (): Promise<void> => {
    await remove('deepseek')
    setStatus({ kind: 'idle' })
    await reload()
  }

  const handleTest = async (): Promise<void> => {
    if (!deepseek) return
    setStatus({ kind: 'testing' })
    // Empty key tells main to substitute the vault-stored key — keeps the
    // plaintext out of the renderer.
    const r = await test({ id: 'deepseek', modelId: DEFAULT_DEEPSEEK_MODEL }, '')
    setStatus(r.ok ? { kind: 'ok', message: t.apiTestOk } : { kind: 'error', message: r.message })
    await reload()
  }

  const handleTestForm = async (): Promise<void> => {
    if (!formKey.trim()) {
      setStatus({ kind: 'error', message: t.apiTestEmptyKey })
      return
    }
    setStatus({ kind: 'testing' })
    const r = await test({ id: 'deepseek', modelId: DEFAULT_DEEPSEEK_MODEL }, formKey)
    setStatus(r.ok ? { kind: 'ok', message: t.apiTestOk } : { kind: 'error', message: r.message })
  }

  return (
    <div className="settings-api-section">
      <span className="settings-label">{t.api}</span>

      {!deepseek && !formOpen && (
        <div className="api-empty">
          <span className="api-empty__hint">{t.apiNone}</span>
          <button className="api-add-btn" onClick={openAddForm}>{t.apiAddDeepseek}</button>
        </div>
      )}

      {deepseek && !formOpen && (
        <div className="api-card">
          <div className="api-card__title">DeepSeek</div>

          <div className="api-card__row">
            <span className="api-card__label">{t.apiKey}</span>
            <span className="api-card__key">{deepseek.hasKey ? t.apiKeyMasked : '—'}</span>
            <button className="api-link-btn" onClick={openEditForm}>{t.apiEdit}</button>
          </div>

          <div className="api-card__actions">
            <button
              className="api-action-btn"
              onClick={() => void handleTest()}
              disabled={status.kind === 'testing'}
            >
              {status.kind === 'testing' ? t.apiTesting : t.apiTest}
            </button>
            <button className="api-action-btn api-action-btn--danger" onClick={() => void handleRemove()}>
              {t.apiRemove}
            </button>
          </div>
        </div>
      )}

      {formOpen && (
        <div className="api-form">
          <div className="api-form__title">DeepSeek</div>

          <div className="api-form__row">
            <span className="api-card__label">{t.apiKey}</span>
            <input
              type="password"
              className="api-key-input"
              placeholder={t.apiKeyPlaceholder}
              value={formKey}
              onChange={e => setFormKey(e.target.value)}
              autoFocus
            />
          </div>

          <div className="api-form__actions">
            <button className="api-action-btn" onClick={closeForm}>{t.apiCancel}</button>
            <button
              className="api-action-btn"
              onClick={() => void handleTestForm()}
              disabled={status.kind === 'testing'}
            >
              {status.kind === 'testing' ? t.apiTesting : t.apiTest}
            </button>
            <button
              className="api-action-btn api-action-btn--primary"
              onClick={() => void handleSave()}
            >
              {t.apiSave}
            </button>
          </div>
        </div>
      )}

      {status.kind === 'ok'    && <div className="api-status api-status--ok">{status.message}</div>}
      {status.kind === 'error' && <div className="api-status api-status--err">{status.message}</div>}
    </div>
  )
}
