// Per-provider model pricing for the session cost estimate.
//
// All rates are USD per 1M tokens. The session cost badge shows an approximate
// USD figure (ApiUsageSnapshot.estimatedCostUsd) regardless of the provider's
// billing currency — the same convention DeepSeek already uses (its balance is
// polled in CNY while the per-session cost is shown in USD). Cost math:
//   plain input         tokens × inputPerMillion
//   cache-creation      tokens × inputPerMillion   (no creation surcharge;
//                                                   Anthropic's 1.25× write
//                                                   multiplier does NOT apply)
//   cache-read          tokens × cacheHitPerMillion
//   output              tokens × outputPerMillion

export interface ModelPricing {
  readonly modelId:            string
  readonly inputPerMillion:    number
  readonly cacheHitPerMillion: number
  readonly outputPerMillion:   number
  readonly contextWindow:      number
}

// DeepSeek — source: https://api-docs.deepseek.com/quick_start/pricing,
// verified 2026-05-08 against the user's account.
export const DEEPSEEK_PRICING: readonly ModelPricing[] = [
  {
    modelId:            'deepseek-v4-flash',
    inputPerMillion:    0.14,
    cacheHitPerMillion: 0.0028,
    outputPerMillion:   0.28,
    // Not on the pricing page; informational only — cost math does not use it
    // and CCC's context% bar is fed by Claude Code's statusLine, not this table.
    contextWindow:      0,
  },
  {
    // V4-Pro is advertised at "75% off" on the pricing page (2026-05-08). The
    // numbers below are the *effective* discounted rates — bump them and
    // PRICING_LAST_UPDATED when the promo ends.
    modelId:            'deepseek-v4-pro',
    inputPerMillion:    0.435,
    cacheHitPerMillion: 0.003625,
    outputPerMillion:   0.87,
    contextWindow:      0,
  },
] as const

// Kimi / Moonshot — approximate USD-per-1M rates (Moonshot bills CNY on
// platform.moonshot.cn; these track the published api.moonshot.cn rates so the
// cost badge is a rough indicator, same as DeepSeek). An unlisted model just
// resolves to cost 0 — harmless. Rates verified 2026-07-26.
export const KIMI_PRICING: readonly ModelPricing[] = [
  {
    modelId:            'kimi-k2.6',
    inputPerMillion:    0.95,
    cacheHitPerMillion: 0.19,
    outputPerMillion:   4.0,
    contextWindow:      0,
  },
  {
    modelId:            'kimi-k2.7-code',
    inputPerMillion:    0.95,
    cacheHitPerMillion: 0.19,
    outputPerMillion:   4.0,
    contextWindow:      0,
  },
  {
    modelId:            'kimi-k2.5',
    inputPerMillion:    0.60,
    cacheHitPerMillion: 0.15,
    outputPerMillion:   3.0,
    contextWindow:      0,
  },
  {
    modelId:            'kimi-k2-0905-preview',
    inputPerMillion:    0.60,
    cacheHitPerMillion: 0.15,
    outputPerMillion:   3.0,
    contextWindow:      0,
  },
  {
    modelId:            'kimi-k2-turbo-preview',
    inputPerMillion:    2.0,
    cacheHitPerMillion: 0.50,
    outputPerMillion:   10.0,
    contextWindow:      0,
  },
  {
    // Frontier model (1M context); may be capacity-gated on many accounts.
    modelId:            'kimi-k3',
    inputPerMillion:    3.0,
    cacheHitPerMillion: 0.30,
    outputPerMillion:   15.0,
    contextWindow:      0,
  },
] as const

export const PRICING_LAST_UPDATED = '2026-07-25'

const ALL_PRICING: readonly ModelPricing[] = [...DEEPSEEK_PRICING, ...KIMI_PRICING]

// Look up pricing by model id across every provider's table. Model ids are
// unique across providers (deepseek-* vs kimi-*/moonshot-*), so a flat search
// is unambiguous. Returns null for an unknown id (cost resolves to 0).
export function lookupPricing(modelId: string): ModelPricing | null {
  return ALL_PRICING.find(p => p.modelId === modelId) ?? null
}
