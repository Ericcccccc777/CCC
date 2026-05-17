// Shared API-provider types — see CCC_API_PROVIDER_SPEC.md.
// V1 ships DeepSeek only; the discriminated union and DEEPSEEK_MODELS
// constant are designed so future providers slot in without touching
// the renderer or preload bridge.

export type ApiProviderId = 'deepseek'

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

export interface DeepSeekModelChoice {
  id:    string
  label: string
}

// Pricing / context-window numbers live in `main/api/deepseek-pricing.ts`,
// filled by the Phase 0 spike. The renderer only needs the id+label pair
// to render the dropdown.
export const DEEPSEEK_MODELS: readonly DeepSeekModelChoice[] = [
  { id: 'deepseek-v4-flash', label: 'deepseek-v4-flash' },
  { id: 'deepseek-v4-pro',   label: 'deepseek-v4-pro' },
] as const

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com/anthropic'
