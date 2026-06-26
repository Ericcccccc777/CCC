import { exec } from 'child_process'
import { readFileSync } from 'fs'
import { homedir } from 'os'
import { delimiter } from 'path'
import type { CodexCliStatus, CodexModel } from '../shared/codex-cli'
import { FALLBACK_CODEX_MODELS } from '../shared/codex-cli'
import { cliPathEntries, whichCommand } from './platform'

const DETECT_TIMEOUT_MS = 10_000

function detectPath(): string {
  return [...cliPathEntries(), process.env.PATH ?? ''].filter(Boolean).join(delimiter)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function priorityOf(model: Record<string, unknown>, fallback: number): number {
  const raw = model.priority
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback
}

function execAsync(command: string, timeoutMs: number = DETECT_TIMEOUT_MS): Promise<{ stdout: string; stderr: string } | null> {
  return new Promise(resolve => {
    const proc = exec(command, {
      timeout: timeoutMs,
      env: {
        ...process.env,
        PATH: detectPath(),
      },
    }, (err, stdout, stderr) => {
      if (err) { resolve(null); return }
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() })
    })
    proc.on('error', () => resolve(null))
  })
}

export function parseCodexModels(raw: string): readonly CodexModel[] {
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      const models = parsed
        .map(asRecord)
        .filter((m): m is Record<string, unknown> => m !== null)
        .map((m, index) => ({ m, index }))
        .filter(({ m }) => String(m.visibility ?? 'list') !== 'hide')
        .sort((a, b) => priorityOf(a.m, a.index) - priorityOf(b.m, b.index) || a.index - b.index)
        .map(({ m }) => ({
          id: String(m.id ?? m.model ?? m.name ?? ''),
          label: String(m.label ?? m.name ?? m.id ?? m.model ?? ''),
        }))
        .filter(m => m.id)
      if (models.length > 0) return models
    }
    const wrapper = asRecord(parsed)
    if (wrapper && Array.isArray(wrapper.models)) {
      const models = wrapper.models
        .map(asRecord)
        .filter((m): m is Record<string, unknown> => m !== null)
        .map((m, index) => ({ m, index }))
        .filter(({ m }) => String(m.visibility ?? 'list') !== 'hide')
        .sort((a, b) => priorityOf(a.m, a.index) - priorityOf(b.m, b.index) || a.index - b.index)
        .map(({ m }) => ({
          id: String(m.slug ?? m.id ?? m.model ?? m.name ?? ''),
          label: String(m.display_name ?? m.label ?? m.name ?? m.slug ?? m.id ?? m.model ?? ''),
        }))
        .filter(m => m.id)
      if (models.length > 0) return models
    }
  } catch { /* not JSON */ }

  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
  if (lines.length > 0) return lines.map(l => ({ id: l, label: l }))

  return FALLBACK_CODEX_MODELS
}

export class CodexManager {
  private cachedStatus: CodexCliStatus | null = null
  private detectPromise: Promise<CodexCliStatus> | null = null

  async detect(): Promise<CodexCliStatus> {
    if (this.cachedStatus) return { ...this.cachedStatus }
    if (this.detectPromise) return this.detectPromise

    this.detectPromise = this._detect()
    const status = await this.detectPromise
    this.cachedStatus = status
    this.detectPromise = null
    return { ...status }
  }

  async redetect(): Promise<CodexCliStatus> {
    this.cachedStatus = null
    this.detectPromise = null
    return this.detect()
  }

  getModels(): readonly CodexModel[] {
    return this.cachedStatus?.models ?? FALLBACK_CODEX_MODELS
  }

  // ── internals ──

  private async _detect(): Promise<CodexCliStatus> {
    const installed = await this.detectInstalled()
    if (!installed) {
      return { installed: false, loggedIn: false, email: null, models: FALLBACK_CODEX_MODELS }
    }

    const [models, config] = await Promise.all([
      this.detectModels(),
      Promise.resolve(this.detectConfig()),
    ])
    return {
      installed: true,
      loggedIn: false,
      email: null,
      models,
      defaultModelId: config.defaultModelId,
      reasoningEffort: config.reasoningEffort,
    }
  }

  private async detectInstalled(): Promise<boolean> {
    const result = await execAsync(whichCommand('codex'))
    return result !== null && result.stdout.length > 0
  }

  private async detectModels(): Promise<readonly CodexModel[]> {
    const result = await execAsync('codex debug models') ?? await execAsync('codex models list')
    if (!result || !result.stdout) return FALLBACK_CODEX_MODELS
    return parseCodexModels(result.stdout)
  }

  private detectConfig(): { defaultModelId?: string; reasoningEffort?: string } {
    let raw = ''
    try { raw = readFileSync(`${homedir()}/.codex/config.toml`, 'utf8') } catch { return {} }
    const model = raw.match(/^model\s*=\s*"([^"]+)"/m)?.[1]
    const reasoning = raw.match(/^model_reasoning_effort\s*=\s*"([^"]+)"/m)?.[1]
    return {
      ...(model && { defaultModelId: model }),
      ...(reasoning && { reasoningEffort: reasoning }),
    }
  }
}
