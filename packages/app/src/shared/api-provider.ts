// Shared API-provider types + registry.
//
// A "provider" is a third-party Anthropic-compatible endpoint that CCC can
// point a Claude Code session at (by injecting ANTHROPIC_BASE_URL +
// ANTHROPIC_AUTH_TOKEN). Everything provider-specific — base URL, model
// catalog, balance endpoint + response shape, display label, billing
// currency — lives in the API_PROVIDERS registry below so the rest of the
// codebase (IPC, persistence, trackers, renderer) stays provider-generic and
// a new provider slots in by adding one descriptor.

export type ApiProviderId = 'deepseek' | 'kimi'

export interface ApiProviderConfig {
  id:         ApiProviderId
  modelId:    string
  verifiedAt?: number
}

// Provider-list response from main → renderer. `hasKey` reports whether a
// safeStorage entry exists for this provider; the actual key is never sent
// across the IPC boundary.
export interface ApiProviderListEntry {
  id:         ApiProviderId
  modelId:    string
  hasKey:     boolean
  verified:   boolean
  verifiedAt?: number
}

export interface ApiTestResult {
  ok:      boolean
  // Human-readable status — surfaced in the Settings panel.
  message: string
}

export interface ApiProviderModelChoice {
  id:    string
  label: string
}

// How a provider's balance endpoint responds, so the shared balance client
// knows which parser to use:
//   - 'deepseek'  : { balance_infos: [{ currency, total_balance }, …] }
//   - 'moonshot'  : { data: { available_balance, voucher_balance, cash_balance } }
export type BalanceShape = 'deepseek' | 'moonshot'

export interface ApiProviderDescriptor {
  id:      ApiProviderId
  // Display name shown in Settings, the pill picker, and close notifications.
  label:   string
  // Injected as ANTHROPIC_BASE_URL so Claude Code talks to this endpoint.
  baseUrl: string
  // Model catalog offered in the pill's API picker. The first entry is the
  // default used when the user only pastes a key (no explicit model choice).
  models:  readonly ApiProviderModelChoice[]
  // GET endpoint (Bearer auth) for the account balance.
  balanceUrl:      string
  balanceShape:    BalanceShape
  // Currency to tag the balance snapshot with when the response carries no
  // currency field of its own (Moonshot returns a bare number; DeepSeek
  // includes the currency and overrides this).
  defaultCurrency: string
}

export const API_PROVIDERS: Record<ApiProviderId, ApiProviderDescriptor> = {
  deepseek: {
    id:      'deepseek',
    label:   'DeepSeek',
    baseUrl: 'https://api.deepseek.com/anthropic',
    models: [
      { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' },
      { id: 'deepseek-v4-pro',   label: 'deepseek-v4-pro' },
    ],
    balanceUrl:      'https://api.deepseek.com/user/balance',
    balanceShape:    'deepseek',
    defaultCurrency: 'CNY',
  },
  kimi: {
    id:      'kimi',
    label:   'Kimi',
    // Moonshot's China platform (platform.moonshot.cn) — CNY billing, keys are
    // NOT interchangeable with the international api.moonshot.ai platform. The
    // Anthropic-compatible endpoint lives under /anthropic (Claude Code reads
    // ANTHROPIC_AUTH_TOKEN as the Bearer key).
    baseUrl: 'https://api.moonshot.cn/anthropic',
    models: [
      { id: 'kimi-k3',                label: 'kimi-k3' },
      { id: 'kimi-k2-0905-preview',   label: 'kimi-k2-0905-preview' },
      { id: 'kimi-k2-turbo-preview',  label: 'kimi-k2-turbo-preview' },
      { id: 'kimi-latest',            label: 'kimi-latest' },
    ],
    // GET https://api.moonshot.cn/v1/users/me/balance →
    //   { code, data: { available_balance, voucher_balance, cash_balance }, status }
    balanceUrl:      'https://api.moonshot.cn/v1/users/me/balance',
    balanceShape:    'moonshot',
    defaultCurrency: 'CNY',
  },
}

export const API_PROVIDER_IDS = Object.keys(API_PROVIDERS) as readonly ApiProviderId[]

export function apiProviderDescriptor(id: ApiProviderId): ApiProviderDescriptor {
  return API_PROVIDERS[id]
}
