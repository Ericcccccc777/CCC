// Per-session token + cost accumulator for API-mode sessions. Reads
// `usage.*` fields off assistant-message lines from Claude Code's
// transcript JSONL. See CCC_API_PROVIDER_SPEC.md §5.2 + §5.4.
//
// Cost math (DECISION_LOG 2026-05-08-5):
//   plain input          tokens × inputPerMillion
//   cache-creation       tokens × inputPerMillion   (DeepSeek lists no
//                                                    creation surcharge)
//   cache-read           tokens × cacheHitPerMillion
//   output               tokens × outputPerMillion
//
// Inputs are clamped to >= 0 — the JSONL writer occasionally records
// negative values for cache fields when the SDK's first-message bookkeeping
// is mid-flight (observed once during spike). Negatives would underflow
// the running totals, so we drop them silently.

import { lookupPricing } from './deepseek-pricing'
import type { ApiProviderId } from '../../shared/api-provider'
import type { ApiUsageSnapshot } from '../../shared/api-usage'

export interface UsageDelta {
  inputTokens?:         number
  outputTokens?:        number
  cacheReadTokens?:     number
  cacheCreationTokens?: number
}

export interface AccumulatorContext {
  sessionId:  number
  providerId: ApiProviderId
  modelId:    string
}

export class TokenUsageAccumulator {
  private readonly ctx:   AccumulatorContext
  private readonly clock: () => number
  private input:    number = 0
  private output:   number = 0
  private cacheR:   number = 0
  private cacheC:   number = 0

  constructor(ctx: AccumulatorContext, initial?: ApiUsageSnapshot, clock: () => number = Date.now) {
    this.ctx   = ctx
    this.clock = clock
    if (initial) {
      this.input  = Math.max(0, initial.inputTokens)
      this.output = Math.max(0, initial.outputTokens)
      this.cacheR = Math.max(0, initial.cacheReadTokens)
      this.cacheC = Math.max(0, initial.cacheCreationTokens)
    }
  }

  // Apply a parsed `usage.*` block from a transcript assistant line.
  // Returns the post-application snapshot ready for IPC broadcast.
  apply(delta: UsageDelta): ApiUsageSnapshot {
    if (delta.inputTokens         && delta.inputTokens         > 0) this.input  += delta.inputTokens
    if (delta.outputTokens        && delta.outputTokens        > 0) this.output += delta.outputTokens
    if (delta.cacheReadTokens     && delta.cacheReadTokens     > 0) this.cacheR += delta.cacheReadTokens
    if (delta.cacheCreationTokens && delta.cacheCreationTokens > 0) this.cacheC += delta.cacheCreationTokens
    return this.snapshot()
  }

  snapshot(): ApiUsageSnapshot {
    return {
      sessionId:           this.ctx.sessionId,
      providerId:          this.ctx.providerId,
      modelId:             this.ctx.modelId,
      inputTokens:         this.input,
      outputTokens:        this.output,
      cacheReadTokens:     this.cacheR,
      cacheCreationTokens: this.cacheC,
      estimatedCostUsd:    this.computeCost(),
      updatedAt:           this.clock(),
    }
  }

  private computeCost(): number {
    const pricing = lookupPricing(this.ctx.modelId)
    if (!pricing) return 0
    const M = 1_000_000
    return (
      (this.input  * pricing.inputPerMillion)    / M +
      (this.cacheC * pricing.inputPerMillion)    / M +
      (this.cacheR * pricing.cacheHitPerMillion) / M +
      (this.output * pricing.outputPerMillion)   / M
    )
  }
}

// Extract the `usage.*` block from a parsed transcript JSONL line. The
// transcript format wraps the message under `message: { role, content,
// usage }` — assistant lines have a usage object; user lines and tool_use
// blocks do not. Returns null when the line carries no usable usage info.
export function extractUsageDelta(transcriptLine: Record<string, unknown>): UsageDelta | null {
  const msg = transcriptLine['message'] as Record<string, unknown> | undefined
  if (!msg) return null
  const role = msg['role']
  if (role !== 'assistant') return null
  const usage = msg['usage'] as Record<string, unknown> | undefined
  if (!usage) return null
  const num = (k: string): number | undefined => {
    const v = usage[k]
    return typeof v === 'number' && Number.isFinite(v) ? v : undefined
  }
  return {
    inputTokens:         num('input_tokens'),
    outputTokens:        num('output_tokens'),
    cacheReadTokens:     num('cache_read_input_tokens'),
    cacheCreationTokens: num('cache_creation_input_tokens'),
  }
}
