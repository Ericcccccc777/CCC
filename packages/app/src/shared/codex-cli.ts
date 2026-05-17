export interface CodexModel {
  readonly id: string
  readonly label: string
}

export interface CodexCliStatus {
  readonly installed: boolean
  readonly loggedIn: boolean
  readonly email: string | null
  readonly models: readonly CodexModel[]
  readonly defaultModelId?: string
  readonly reasoningEffort?: string
}

export const CODEX_REASONING_EFFORTS = ['low', 'medium', 'high', 'xhigh'] as const

export type CodexReasoningEffort = typeof CODEX_REASONING_EFFORTS[number]

export function codexReasoningEffortMenuIndex(effort: CodexReasoningEffort): number {
  return CODEX_REASONING_EFFORTS.indexOf(effort) + 1
}

export const FALLBACK_CODEX_MODELS: readonly CodexModel[] = [
  { id: 'gpt-5.4', label: 'gpt-5.4' },
  { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
] as const
