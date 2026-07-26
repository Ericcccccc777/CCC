import { describe, it, expect } from 'vitest'
import {
  TokenUsageAccumulator,
  extractUsageDelta,
} from '../src/main/api/TokenUsageAccumulator'

class TokenUsageAccumulatorTests {
  static run(): void {
    describe('TokenUsageAccumulator', () => {
      describe('apply / snapshot', () => {
        it('first apply seeds totals; snapshot returns them', () => {
          const acc = new TokenUsageAccumulator(
            { sessionId: 1, providerId: 'deepseek', modelId: 'deepseek-v4-flash' },
            undefined,
            () => 1000,
          )
          const s = acc.apply({ inputTokens: 12, outputTokens: 2 })
          expect(s.inputTokens).toBe(12)
          expect(s.outputTokens).toBe(2)
          expect(s.cacheReadTokens).toBe(0)
          expect(s.cacheCreationTokens).toBe(0)
          expect(s.updatedAt).toBe(1000)
        })

        it('multiple applies accumulate', () => {
          const acc = new TokenUsageAccumulator(
            { sessionId: 1, providerId: 'deepseek', modelId: 'deepseek-v4-flash' },
          )
          acc.apply({ inputTokens: 100, outputTokens: 20 })
          const s = acc.apply({ inputTokens: 50, outputTokens: 10, cacheReadTokens: 256 })
          expect(s.inputTokens).toBe(150)
          expect(s.outputTokens).toBe(30)
          expect(s.cacheReadTokens).toBe(256)
        })

        it('zero or missing fields do not change running totals', () => {
          const acc = new TokenUsageAccumulator(
            { sessionId: 1, providerId: 'deepseek', modelId: 'deepseek-v4-flash' },
          )
          acc.apply({ inputTokens: 10, outputTokens: 5 })
          const s = acc.apply({ inputTokens: 0 })
          expect(s.inputTokens).toBe(10)
          expect(s.outputTokens).toBe(5)
        })

        it('negative values from the SDK are dropped silently', () => {
          const acc = new TokenUsageAccumulator(
            { sessionId: 1, providerId: 'deepseek', modelId: 'deepseek-v4-flash' },
          )
          acc.apply({ inputTokens: 100 })
          const s = acc.apply({ inputTokens: -5, cacheReadTokens: -10 })
          expect(s.inputTokens).toBe(100)   // unchanged
          expect(s.cacheReadTokens).toBe(0) // unchanged
        })
      })

      describe('cost math', () => {
        it('computes USD cost using DEEPSEEK_PRICING for v4-flash', () => {
          const acc = new TokenUsageAccumulator(
            { sessionId: 1, providerId: 'deepseek', modelId: 'deepseek-v4-flash' },
          )
          // 1M input + 1M output → 0.14 + 0.28 = 0.42
          const s = acc.apply({ inputTokens: 1_000_000, outputTokens: 1_000_000 })
          expect(s.estimatedCostUsd).toBeCloseTo(0.42, 6)
        })

        it('cache-creation tokens billed at the input miss rate (no surcharge)', () => {
          const acc = new TokenUsageAccumulator(
            { sessionId: 1, providerId: 'deepseek', modelId: 'deepseek-v4-flash' },
          )
          // 1M cache-creation alone → 0.14 (same as plain input)
          const s = acc.apply({ cacheCreationTokens: 1_000_000 })
          expect(s.estimatedCostUsd).toBeCloseTo(0.14, 6)
        })

        it('cache-read tokens billed at the hit rate', () => {
          const acc = new TokenUsageAccumulator(
            { sessionId: 1, providerId: 'deepseek', modelId: 'deepseek-v4-flash' },
          )
          // 1M cache-read → 0.0028
          const s = acc.apply({ cacheReadTokens: 1_000_000 })
          expect(s.estimatedCostUsd).toBeCloseTo(0.0028, 6)
        })

        it('computes cost for a Kimi model from the kimi pricing table', () => {
          const acc = new TokenUsageAccumulator(
            { sessionId: 2, providerId: 'kimi', modelId: 'kimi-k3' },
          )
          // 1M input + 1M output → 3.0 + 15.0 = 18.0
          const s = acc.apply({ inputTokens: 1_000_000, outputTokens: 1_000_000 })
          expect(s.estimatedCostUsd).toBeCloseTo(18.0, 6)
        })

        it('unknown model returns zero cost (graceful degrade)', () => {
          const acc = new TokenUsageAccumulator(
            { sessionId: 1, providerId: 'deepseek', modelId: 'unknown-model-xyz' },
          )
          const s = acc.apply({ inputTokens: 9999 })
          expect(s.estimatedCostUsd).toBe(0)
        })
      })

      describe('cold-start from snapshot', () => {
        it('seeds totals from the persisted snapshot', () => {
          const acc = new TokenUsageAccumulator(
            { sessionId: 1, providerId: 'deepseek', modelId: 'deepseek-v4-flash' },
            {
              sessionId:           1,
              providerId:          'deepseek',
              modelId:             'deepseek-v4-flash',
              inputTokens:         500,
              outputTokens:        100,
              cacheReadTokens:     0,
              cacheCreationTokens: 0,
              estimatedCostUsd:    0,
              updatedAt:           0,
            },
          )
          const s = acc.snapshot()
          expect(s.inputTokens).toBe(500)
          expect(s.outputTokens).toBe(100)
        })
      })
    })

    describe('extractUsageDelta (transcript JSONL parser)', () => {
      it('returns null for user messages', () => {
        expect(extractUsageDelta({ type: 'user', message: { role: 'user', content: 'hi' } })).toBeNull()
      })

      it('returns null when message field is missing', () => {
        expect(extractUsageDelta({ type: 'assistant' })).toBeNull()
      })

      it('returns null when usage block is missing', () => {
        expect(extractUsageDelta({ message: { role: 'assistant', content: [] } })).toBeNull()
      })

      it('extracts all four usage fields when present', () => {
        const d = extractUsageDelta({
          message: {
            role: 'assistant',
            content: [],
            usage: {
              input_tokens:                12,
              output_tokens:               2,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens:     256,
            },
          },
        })
        expect(d).toEqual({
          inputTokens:         12,
          outputTokens:        2,
          cacheReadTokens:     256,
          cacheCreationTokens: 0,
        })
      })

      it('skips non-numeric usage fields rather than crashing', () => {
        const d = extractUsageDelta({
          message: {
            role: 'assistant',
            usage: { input_tokens: '12', output_tokens: 2 },
          },
        })
        expect(d).toEqual({
          inputTokens:         undefined,
          outputTokens:        2,
          cacheReadTokens:     undefined,
          cacheCreationTokens: undefined,
        })
      })
    })
  }
}

TokenUsageAccumulatorTests.run()
