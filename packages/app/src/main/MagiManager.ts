import { exec, spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type {
  MagiEnvId, MagiEnvItem, MagiEnvReport, MagiOpResult,
} from '../shared/magi'

// GUI apps on macOS don't inherit the login-shell PATH, so brew/node/jq/npx
// living in Homebrew or npm-global dirs are invisible unless we extend PATH —
// same fix ClaudeCliManager uses for `claude`.
const PATH_EXTRA = [
  '/usr/local/bin',
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  `${homedir()}/.npm-global/bin`,
  `${homedir()}/.local/bin`,
].join(':')

function patchedEnv(): NodeJS.ProcessEnv {
  return { ...process.env, PATH: `${PATH_EXTRA}:${process.env.PATH ?? ''}` }
}

const DETECT_TIMEOUT_MS = 12_000

interface ExecOutcome { ok: boolean; stdout: string; stderr: string }

function execAsync(command: string, timeoutMs = DETECT_TIMEOUT_MS): Promise<ExecOutcome> {
  return new Promise(resolve => {
    const proc = exec(command, { timeout: timeoutMs, env: patchedEnv() }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: (stdout ?? '').trim(), stderr: (stderr ?? '').trim() })
    })
    proc.on('error', () => resolve({ ok: false, stdout: '', stderr: 'spawn error' }))
  })
}

// Stream a long-running command's output line-by-line to `onLine`, resolving
// when it exits. Used for `brew install` and the `npx` install.
function runStreaming(
  cmd: string,
  args: string[],
  onLine: (line: string) => void,
  cwd?: string,
): Promise<MagiOpResult> {
  return new Promise(resolve => {
    let proc: ReturnType<typeof spawn>
    try {
      proc = spawn(cmd, args, { cwd, env: patchedEnv() })
    } catch (e) {
      resolve({ ok: false, error: (e as Error).message })
      return
    }
    const emit = (buf: Buffer): void => {
      for (const line of buf.toString().split(/\r?\n/)) {
        if (line.trim()) onLine(line)
      }
    }
    proc.stdout?.on('data', emit)
    proc.stderr?.on('data', emit)
    proc.on('error', e => resolve({ ok: false, error: e.message }))
    proc.on('close', code =>
      resolve(code === 0 ? { ok: true } : { ok: false, error: `${cmd} exited with code ${code ?? '?'}` }))
  })
}

// ── Installed-state probe ────────────────────────────────────────────────────

// CCC-MAGI's installer drops `.harness/`, `CCC_MAGI_README.md`, and (after the
// bootstrap) `.harness/state/install.json`. Any of these means "already here".
export function isMagiInstalled(workspace: string): boolean {
  return existsSync(join(workspace, '.harness'))
      || existsSync(join(workspace, 'CCC_MAGI_README.md'))
      || existsSync(join(workspace, '.harness', 'state', 'install.json'))
}

// ── Environment detection ────────────────────────────────────────────────────

async function checkGit(): Promise<MagiEnvItem> {
  const r = await execAsync('git --version')
  const ok = r.ok && /git version/i.test(r.stdout)
  return { id: 'git', label: 'Git', ok, detail: ok ? r.stdout : 'not found', installable: true }
}

async function checkNode(): Promise<MagiEnvItem> {
  const r = await execAsync('node --version')
  const major = Number(r.stdout.match(/v(\d+)\./)?.[1] ?? 0)
  const ok = r.ok && major >= 18
  const detail = !r.ok ? 'not found' : major >= 18 ? r.stdout : `${r.stdout} (需要 ≥ 18)`
  return { id: 'node', label: 'Node.js ≥ 18', ok, detail, installable: true }
}

async function checkJq(): Promise<MagiEnvItem> {
  const r = await execAsync('jq --version')
  return { id: 'jq', label: 'jq', ok: r.ok, detail: r.ok ? r.stdout : 'not found', installable: true }
}

export async function checkEnvironment(): Promise<MagiEnvReport> {
  const items = await Promise.all([checkGit(), checkNode(), checkJq()])
  return { items, allOk: items.every(i => i.ok) }
}

// ── Backend installs ─────────────────────────────────────────────────────────

const BREW_PKG: Record<MagiEnvId, string> = { git: 'git', node: 'node', jq: 'jq' }

async function hasBrew(): Promise<boolean> {
  const r = await execAsync('command -v brew')
  return r.ok && r.stdout.length > 0
}

export async function installEnv(id: MagiEnvId, onLine: (line: string) => void): Promise<MagiOpResult> {
  const pkg = BREW_PKG[id]
  if (!pkg) return { ok: false, error: `unknown environment: ${id}` }
  if (!(await hasBrew())) {
    return {
      ok: false,
      error: 'Homebrew 未安装，无法自动安装。请先安装 Homebrew (https://brew.sh)，或手动安装该依赖后重新检测。',
    }
  }
  onLine(`$ brew install ${pkg}`)
  return runStreaming('brew', ['install', pkg], onLine)
}

// `--force` so the one-click install doesn't trip on the installer's git-clean /
// not-a-git-repo refusal; `--yes` so npx never blocks waiting to fetch the pkg.
export async function installMagi(workspace: string, onLine: (line: string) => void): Promise<MagiOpResult> {
  onLine('$ npx --yes create-ccc-magi@latest --force')
  return runStreaming('npx', ['--yes', 'create-ccc-magi@latest', '--force'], onLine, workspace)
}
