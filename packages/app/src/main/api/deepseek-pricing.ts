// DeepSeek model pricing — see CCC_API_PROVIDER_SPEC.md §3.3, DECISION_LOG
// 2026-05-08-5. Source of record: https://api-docs.deepseek.com/quick_start/pricing,
// verified 2026-05-08 against the user's account.
//
// All rates are USD per 1M tokens. Cost math:
//   plain input         tokens × inputPerMillion
//   cache-creation      tokens × inputPerMillion   (DeepSeek lists no creation
//                                                   surcharge; Anthropic's 1.25×
//                                                   write multiplier does NOT apply)
//   cache-read          tokens × cacheHitPerMillion
//   output              tokens × outputPerMillion

export interface ModelPricing {
  readonly modelId:            string
  readonly inputPerMillion:    number
  readonly cacheHitPerMillion: number
  readonly outputPerMillion:   number
  readonly contextWindow:      number
}

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

export const PRICING_LAST_UPDATED = '2026-05-08'

export function lookupPricing(modelId: string): ModelPricing | null {
  return DEEPSEEK_PRICING.find(p => p.modelId === modelId) ?? null
}
