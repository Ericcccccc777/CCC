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

// Header switch (DeepSeek | Kimi) over a sliding viewport — the same shape as
// the CLI panel's Claude Code | Codex switch, so the two Settings sections
// read as one system. Only the selected provider's card is on screen; both
// stay mounted in the track so their form state survives a tab switch.
export function ApiProvidersPanel({ list, save, remove, test }: ApiProvidersPanelProps): JSX.Element {
  const t = useLang()
  const [providers, setProviders] = useState<ApiProviderListEntry[]>([])
  const [activeId,  setActiveId]  = useState<ApiProviderId>(API_PROVIDER_IDS[0])

  const reload = async (): Promise<void> => {
    const r = await list()
    setProviders(r)
  }

  useEffect(() => { void reload() }, [])

  const ids = API_PROVIDER_IDS
  const activeIndex = Math.max(0, ids.indexOf(activeId))

  return (
    <div className="settings-api-section cli-panel">
      <div className="cli-panel__header">
        <span className="settings-label">{t.api}</span>
        <div
          className="cli-panel__switch"
          role="tablist"
          aria-label={t.api}
          style={{ gridTemplateColumns: `repeat(${ids.length}, 1fr)` }}
        >
          {ids.map(id => (
            <button
              key={id}
              className={`cli-panel__tab${activeId === id ? ' is-active' : ''}`}
              type="button"
              role="tab"
              aria-selected={activeId === id}
              onClick={() => setActiveId(id)}
            >
              {apiProviderDescriptor(id).label}
            </button>
          ))}
        </div>
      </div>

      <div className="cli-panel__viewport">
        <div
          className="cli-panel__track"
          style={{
            width:     `${ids.length * 100}%`,
            transform: `translateX(-${activeIndex * (100 / ids.length)}%)`,
          }}
        >
          {ids.map(id => (
            <section
              key={id}
              className="cli-panel__page"
              role="tabpanel"
              style={{ flex: `0 0 ${100 / ids.length}%` }}
            >
              <ProviderCard
                descriptor={apiProviderDescriptor(id)}
                entry={providers.find(p => p.id === id) ?? null}
                save={save}
                remove={remove}
                test={test}
                onChanged={reload}
              />
            </section>
          ))}
        </div>
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

// A single provider's key/test/remove card. No provider-name title — the
// header switch already identifies which provider this page belongs to.
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
        <div className="api-empty api-empty--solo">
          {/* The switch tab already names the provider — just offer the add
              action, centred, so the empty page isn't redundant. */}
          <button className="api-add-btn" onClick={openForm}>{addLabel}</button>
        </div>
      )}

      {entry && !formOpen && (
        <div className="api-card">
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
