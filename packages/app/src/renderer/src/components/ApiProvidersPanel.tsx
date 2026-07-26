import { useEffect, useState } from 'react'
import { useLang } from '../i18n'
import {
  API_PROVIDER_IDS,
  apiProviderDescriptor,
  type ApiProviderConfig,
  type ApiProviderDescriptor,
  type ApiProviderId,
  type ApiProviderListEntry,
  type ApiTestResult,
} from '../../../shared/api-provider'

// Props are the bridge functions, not `window.ccc` directly — keeps the
// component testable without mocking the global preload bridge.
export interface ApiProvidersPanelProps {
  list:   () => Promise<ApiProviderListEntry[]>
  save:   (config: ApiProviderConfig, key: string) => Promise<{ ok: true } | { ok: false; error: string }>
  remove: (id: ApiProviderId) => Promise<void>
  test:   (config: ApiProviderConfig, key: string) => Promise<ApiTestResult>
}

type Status =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok',    message: string }
  | { kind: 'error', message: string }

// One card per registered provider (DeepSeek, Kimi, …). Each owns its own
// add/edit form + status so operating on one provider never disturbs another.
export function ApiProvidersPanel({ list, save, remove, test }: ApiProvidersPanelProps): JSX.Element {
  const t = useLang()
  const [providers, setProviders] = useState<ApiProviderListEntry[]>([])

  const reload = async (): Promise<void> => {
    const r = await list()
    setProviders(r)
  }

  useEffect(() => { void reload() }, [])

  return (
    <div className="settings-api-section">
      <span className="settings-label">{t.api}</span>
      {/* Providers sit side by side (not stacked) so the Settings panel stays
          short — the expanded island can otherwise run off the bottom of the
          screen with settings + model picker both open. */}
      <div className="api-provider-cards">
        {API_PROVIDER_IDS.map(id => (
          <ProviderCard
            key={id}
            descriptor={apiProviderDescriptor(id)}
            entry={providers.find(p => p.id === id) ?? null}
            save={save}
            remove={remove}
            test={test}
            onChanged={reload}
          />
        ))}
      </div>
    </div>
  )
}

interface ProviderCardProps {
  descriptor: ApiProviderDescriptor
  entry:      ApiProviderListEntry | null
  save:       (config: ApiProviderConfig, key: string) => Promise<{ ok: true } | { ok: false; error: string }>
  remove:     (id: ApiProviderId) => Promise<void>
  test:       (config: ApiProviderConfig, key: string) => Promise<ApiTestResult>
  onChanged:  () => Promise<void>
}

function ProviderCard({ descriptor, entry, save, remove, test, onChanged }: ProviderCardProps): JSX.Element {
  const t = useLang()
  const [formOpen, setFormOpen] = useState(false)
  const [formKey,  setFormKey]  = useState('')
  const [status,   setStatus]   = useState<Status>({ kind: 'idle' })

  // The Settings panel only stores a default model (first in the provider's
  // catalog); the user picks the actual model later in the pill's API picker.
  const defaultModel = descriptor.models[0]?.id ?? ''
  const addLabel = t.apiAddProvider.replace('{name}', descriptor.label)

  const openForm = (): void => {
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
    const testResult = await test({ id: descriptor.id, modelId: defaultModel }, formKey)
    if (!testResult.ok) {
      setStatus({ kind: 'error', message: testResult.message })
      return
    }
    const result = await save({ id: descriptor.id, modelId: defaultModel, verifiedAt: Date.now() }, formKey)
    if (!result.ok) {
      const msg = result.error === 'vault-unavailable' ? t.apiVaultUnavailable : result.error
      setStatus({ kind: 'error', message: msg })
      return
    }
    setFormKey('')
    setFormOpen(false)
    setStatus({ kind: 'ok', message: t.apiTestOk })
    await onChanged()
  }

  const handleRemove = async (): Promise<void> => {
    await remove(descriptor.id)
    setStatus({ kind: 'idle' })
    await onChanged()
  }

  const handleTest = async (): Promise<void> => {
    if (!entry) return
    setStatus({ kind: 'testing' })
    // Empty key tells main to substitute the vault-stored key — keeps the
    // plaintext out of the renderer.
    const r = await test({ id: descriptor.id, modelId: defaultModel }, '')
    setStatus(r.ok ? { kind: 'ok', message: t.apiTestOk } : { kind: 'error', message: r.message })
    await onChanged()
  }

  const handleTestForm = async (): Promise<void> => {
    if (!formKey.trim()) {
      setStatus({ kind: 'error', message: t.apiTestEmptyKey })
      return
    }
    setStatus({ kind: 'testing' })
    const r = await test({ id: descriptor.id, modelId: defaultModel }, formKey)
    setStatus(r.ok ? { kind: 'ok', message: t.apiTestOk } : { kind: 'error', message: r.message })
  }

  return (
    <div className="api-provider-block" data-provider={descriptor.id}>
      {!entry && !formOpen && (
        <div className="api-empty">
          <span className="api-empty__hint">{descriptor.label}</span>
          <button className="api-add-btn" onClick={openForm}>{addLabel}</button>
        </div>
      )}

      {entry && !formOpen && (
        <div className="api-card">
          <div className="api-card__title">{descriptor.label}</div>

          <div className="api-card__row">
            <span className="api-card__label">{t.apiKey}</span>
            <span className="api-card__key">{entry.hasKey ? t.apiKeyMasked : '—'}</span>
            <button className="api-link-btn" onClick={openForm}>{t.apiEdit}</button>
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
          <div className="api-form__title">{descriptor.label}</div>

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
