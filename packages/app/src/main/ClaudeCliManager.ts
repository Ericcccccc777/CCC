import { exec } from 'child_process'
import { delimiter } from 'path'
import type { ClaudeCliStatus } from '../shared/claude-cli'
import { cliPathEntries, whichCommand } from './platform'

const DETECT_TIMEOUT_MS = 10_000

// Prepend the platform's extra CLI dirs, joined with the OS path separator
// (':' on POSIX, ';' on Windows). Using path.delimiter is the fix for Windows,
// where the old hardcoded ':' join mangled the real PATH.
function detectPath(): string {
  return [...cliPathEntries(), process.env.PATH ?? ''].filter(Boolean).join(delimiter)
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
      if (err && !stdout.trim()) { resolve(null); return }
      resolve({ stdout: stdout.trim(), stderr: stderr.trim() })
    })
    proc.on('error', () => resolve(null))
  })
}

// Cache TTL in milliseconds. `detect()` re-runs the underlying CLI subcommands
// at most once per CACHE_TTL_MS window; subsequent calls within the window
// return the cached snapshot. Settings → "Check Again" uses `redetect()` to
// bypass the cache. STABILITY_RULES.md §2.1 mandates this for any CLI probe
// reachable from a user-visible click path (here: pill expand → reloadClaudeStatus).
const CACHE_TTL_MS = 60_000

export class ClaudeCliManager {
  private cachedStatus: ClaudeCliStatus | null = null
  private cachedAt:     number = 0
  private detectPromise: Promise<ClaudeCliStatus> | null = null
  // Test seam: counts how many times the underlying CLI probes ran. Tests
  // assert this stays at 1 across rapid detect() calls (cache hit) and rises
  // to 2 after redetect() (cache bypass). Not exposed via IPC.
  detectCallCount = 0

  async detect(): Promise<ClaudeCliStatus> {
    const now = Date.now()
    if (this.cachedStatus && (now - this.cachedAt) < CACHE_TTL_MS) {
      return { ...this.cachedStatus }
    }
    if (this.detectPromise) return this.detectPromise

    this.detectPromise = this._detect()
    try {
      const status = await this.detectPromise
      this.cachedStatus = status
      this.cachedAt     = Date.now()
      return { ...status }
    } finally {
      this.detectPromise = null
    }
  }

  async redetect(): Promise<ClaudeCliStatus> {
    this.cachedStatus = null
    this.cachedAt     = 0
    this.detectPromise = null
    return this.detect()
  }

  private async _detect(): Promise<ClaudeCliStatus> {
    this.detectCallCount++
    const installed = await this.detectInstalled()
    if (!installed) {
      return { installed: false, loggedIn: false, account: null, version: null }
    }

    const [version, auth] = await Promise.all([
      this.detectVersion(),
      this.detectAuth(),
    ])

    return {
      installed: true,
      loggedIn: auth.loggedIn,
      account: auth.account,
      version,
    }
  }

  private async detectInstalled(): Promise<boolean> {
    const result = await execAsync(whichCommand('claude'))
    return result !== null && result.stdout.length > 0
  }

  private async detectVersion(): Promise<string | null> {
    const result = await execAsync('claude --version')
    return result?.stdout.split('\n')[0]?.trim() || null
  }

  private async detectAuth(): Promise<{ loggedIn: boolean; account: string | null }> {
    const result = await execAsync('claude auth status --json')
    if (!result || !result.stdout) return { loggedIn: false, account: null }

    try {
      const parsed = JSON.parse(result.stdout) as Record<string, unknown>
      const loggedIn = parsed.loggedIn === true
      const account = this.pickAccount(parsed)
      return { loggedIn, account }
    } catch {
      const email = result.stdout.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/)?.[1] ?? null
      return {
        loggedIn: result.stdout.toLowerCase().includes('logged') && !result.stdout.toLowerCase().includes('false'),
        account: email,
      }
    }
  }

  private pickAccount(parsed: Record<string, unknown>): string | null {
    const candidates = [
      parsed.email,
      parsed.account,
      parsed.accountEmail,
      parsed.userEmail,
      parsed.username,
    ]
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
    }
    return null
  }
}
