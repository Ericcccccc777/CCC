import { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs'
import { join } from 'path'
import {
  defaultHarnessConfig, migrateConfig,
  type HarnessConfig, type CodingRule, type ProjectType,
} from '../renderer/src/harness-types'

export type { HarnessConfig }

const CONFIG_FILE = '.claude/ccc-config.json'

// ── Workspace probing ────────────────────────────────────────────────────────

export interface WorkspaceProbe {
  hasConfig:   boolean
  hasClaudeMd: boolean
}

export function checkWorkspace(workspace: string): WorkspaceProbe {
  return {
    hasConfig:   existsSync(join(workspace, CONFIG_FILE)),
    hasClaudeMd: existsSync(join(workspace, 'CLAUDE.md')),
  }
}

// ── Load / save config (with V1 → V2 silent migration) ───────────────────────

export function loadConfig(workspace: string): HarnessConfig | null {
  try {
    const raw = readFileSync(join(workspace, CONFIG_FILE), 'utf8')
    return migrateConfig(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveConfig(workspace: string, config: HarnessConfig): void {
  const dir = join(workspace, '.claude')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(join(workspace, CONFIG_FILE), JSON.stringify(config, null, 2), 'utf8')
}

// ── Output path resolution ───────────────────────────────────────────────────

export interface GenerateResult {
  path:           string         // where CLAUDE-style file was written
  backedUpFrom?:  string         // if existing CLAUDE.md was moved aside
  appendedTo?:    string         // if @CCC-CLAUDE.md import was added to existing CLAUDE.md
}

function resolveOutputPath(workspace: string, config: HarnessConfig): string {
  const choice = config.meta.outputPath ?? 'claude-md'
  return choice === 'ccc-claude-md'
    ? join(workspace, 'CCC-CLAUDE.md')
    : join(workspace, 'CLAUDE.md')
}

// ── Generation: synchronous render + write ───────────────────────────────────

export function generate(workspace: string, config: HarnessConfig): GenerateResult {
  const md = renderClaudeMd(config)
  const target = resolveOutputPath(workspace, config)

  let backedUpFrom: string | undefined
  let appendedTo:   string | undefined

  // First-time write to CLAUDE.md when one already exists: respect outputPath choice.
  // For 'ccc-claude-md' we also stamp an `@CCC-CLAUDE.md` import into the existing CLAUDE.md.
  if (config.meta.outputPath === 'ccc-claude-md') {
    const mainClaudeMd = join(workspace, 'CLAUDE.md')
    if (existsSync(mainClaudeMd)) {
      const existing = readFileSync(mainClaudeMd, 'utf8')
      if (!existing.includes('@CCC-CLAUDE.md')) {
        const sep = existing.endsWith('\n') ? '' : '\n'
        writeFileSync(mainClaudeMd, `${existing}${sep}\n@CCC-CLAUDE.md\n`, 'utf8')
        appendedTo = mainClaudeMd
      }
    }
  } else if (config.meta.outputPath === 'claude-md' && !existsSync(join(workspace, '.claude/ccc-config.json'))) {
    // First-time overwrite path — back up existing CLAUDE.md if present
    if (existsSync(target)) {
      const stamp  = String(Math.floor(Date.now() / 1000))
      const backup = `${target}.bak.${stamp}`
      renameSync(target, backup)
      backedUpFrom = backup
    }
  }

  writeFileSync(target, md, 'utf8')

  // Stamp generatedAt
  const stamped: HarnessConfig = { ...config, meta: { ...config.meta, generatedAt: new Date().toISOString() } }
  saveConfig(workspace, stamped)

  return { path: target, backedUpFrom, appendedTo }
}

// ── CLAUDE.md template renderer (pure function, unit-testable) ───────────────

function renderRulesSection(rules: ReadonlyArray<CodingRule>, heading: string): string {
  if (rules.length === 0) return ''
  const body = rules.map(r => `### ${r.title}\n\n${r.text}\n`).join('\n')
  return `## ${heading}\n\n${body}`
}

function projectTypeLabel(t: ProjectType): string {
  switch (t) {
    case 'web-app':  return 'Web app'
    case 'mobile':   return 'Mobile app'
    case 'cli':      return 'CLI tool'
    case 'library':  return 'Library / SDK'
    case 'data':     return 'Data / ETL pipeline'
    case 'desktop':  return 'Desktop app'
    case 'service':  return 'Backend service / API'
    case 'other':    return 'Other'
  }
}

export function renderClaudeMd(config: HarnessConfig): string {
  const { basics, architecture } = config

  const enabled = architecture.codingRules.filter(r => r.enabled)
  const defaults = enabled.filter(r => r.source === 'builtin-default')
  const optional = enabled.filter(r => r.source === 'builtin-optional')
  const custom   = enabled.filter(r => r.source === 'user-defined')

  const cmdRows = Object.entries(basics.commands)
    .filter(([, v]) => v.trim())
    .map(([k, v]) => `| \`${v}\` | ${k} |`)
    .join('\n')

  const dodRows = architecture.definitionOfDone
    .filter(s => s.trim())
    .map(s => `- [ ] ${s}`)
    .join('\n')

  const lines: string[] = []
  lines.push(`# ${basics.name || 'Project'} — Claude Code 工作约束`)
  lines.push('')
  lines.push('本文件由 CCC 生成。改 wizard、点 Update 即可重新生成。Claude Code 启动时会读这个文件作为约束输入。')
  lines.push('')

  // Project section
  lines.push('## 项目')
  lines.push('')
  if (basics.description.trim()) {
    lines.push(basics.description.trim())
    lines.push('')
  }
  lines.push(`- **类型**: ${projectTypeLabel(basics.projectType)}`)
  if (basics.stack.trim())   lines.push(`- **技术栈**: ${basics.stack.trim()}`)
  if (basics.runtime.trim()) lines.push(`- **运行时**: ${basics.runtime.trim()}`)
  lines.push(`- **包管理**: ${basics.packageManager}`)
  lines.push('')

  // Commands
  if (cmdRows) {
    lines.push('## 常用命令')
    lines.push('')
    lines.push('| 命令 | 用途 |')
    lines.push('|---|---|')
    lines.push(cmdRows)
    lines.push('')
  }

  // Default rules
  const defaultsBlock = renderRulesSection(defaults, '硬性原则（universal）')
  if (defaultsBlock) { lines.push(defaultsBlock); lines.push('') }

  // Optional rules grouped by category
  if (optional.length) {
    lines.push('## 项目纪律')
    lines.push('')
    const byCategory = new Map<string, CodingRule[]>()
    for (const r of optional) {
      const k = r.category ?? 'other'
      const arr = byCategory.get(k) ?? []
      arr.push(r)
      byCategory.set(k, arr)
    }
    for (const [cat, rs] of byCategory) {
      lines.push(`### · ${cat}`)
      lines.push('')
      for (const r of rs) {
        lines.push(`**${r.title}** — ${r.text}`)
        lines.push('')
      }
    }
  }

  // Custom rules
  const customBlock = renderRulesSection(custom, '本项目特定规则')
  if (customBlock) { lines.push(customBlock); lines.push('') }

  // Definition of Done
  if (dodRows) {
    lines.push('## Definition of Done')
    lines.push('')
    lines.push('每次改动报告完成前，确认以下项：')
    lines.push('')
    lines.push(dodRows)
    lines.push('')
  }

  // Commit convention
  if (architecture.commitConvention === 'conventional') {
    lines.push('## 提交规范')
    lines.push('')
    lines.push('Conventional Commits — `type(scope): subject`。')
    lines.push('')
    lines.push('- types: `feat | fix | refactor | test | ci | docs | chore`')
    lines.push('- subject 用祈使句、≤ 72 字符')
    lines.push('- body 解释 *why*；diff 已经显示 *what*')
    lines.push('- 一个 commit 一件事')
    lines.push('')
  }

  return lines.join('\n')
}
