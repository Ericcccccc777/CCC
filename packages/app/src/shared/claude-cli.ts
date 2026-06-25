export interface ClaudeCliStatus {
  readonly installed: boolean
  readonly loggedIn: boolean
  readonly account: string | null
  readonly version: string | null
}

// Reasoning-effort levels Claude Code's `/effort` command accepts as an inline
// argument (e.g. `/effort xhigh`), highest-capability last. Source: Anthropic
// effort docs — the API accepts exactly low/medium/high/xhigh/max.
export const CLAUDE_REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

export type ClaudeReasoningEffort = typeof CLAUDE_REASONING_EFFORTS[number]

// Which effort levels a given model supports, per Anthropic's effort docs:
//   - Haiku: no effort support at all → no effort UI.
//   - Sonnet 4.6: low/medium/high/max, but NOT xhigh.
//   - Opus 4.x, Fable/Mythos 5, and other effort-capable models: the full set.
// Matching is substring-based on the canonical model id (e.g. 'claude-sonnet-4-6').
// Unknown ids fall through to the full set — a safe default since an
// unsupported level is a no-op in the CLI rather than an error.
export function claudeEffortsForModel(modelId: string): readonly ClaudeReasoningEffort[] {
  const id = modelId.toLowerCase()
  if (id.includes('haiku')) return []
  if (id.includes('sonnet')) return ['low', 'medium', 'high', 'max']
  return ['low', 'medium', 'high', 'xhigh', 'max']
}
