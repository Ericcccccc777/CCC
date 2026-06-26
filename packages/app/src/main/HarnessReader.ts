import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve, sep } from 'path'
import { homedir } from 'os'
import { isMagiInstalled } from './MagiManager'
import { extractUsageDelta } from './api/TokenUsageAccumulator'
import type {
  HarnessSummary, HarnessInstall, HarnessCheckpoint, Todolist,
  TranscriptMessage, SessionListItem, MagiMemory, MagiMemoryEntry, ProjectStats,
  WorkflowTemplateSelection, WorkflowTemplateFile, ActiveWorkflowTemplate, WorkflowStage,
} from '../shared/harness'

// ─────────────────────────────────────────────────────────────────────────────
// Read-only reader for the harness visualization dashboard.
//
// Every public function is guarded: missing files return null / [] rather than
// throwing, and `harnessRead` refuses any relPath that escapes the workspace
// (path-traversal guard). The dashboard renderer polls `harnessSummary` on an
// interval, so these reads must be cheap and never crash the main process.
// ─────────────────────────────────────────────────────────────────────────────

// Read a workspace-relative file as UTF-8 text. Returns null on any failure or
// if `relPath` would resolve outside the workspace root.
export function harnessRead(workspace: string, relPath: string): string | null {
  if (!workspace || !relPath) return null
  const root   = resolve(workspace)
  const target = resolve(root, relPath)
  // Containment check: target must equal root or live beneath it.
  if (target !== root && !target.startsWith(root + sep)) return null
  try {
    if (!existsSync(target) || !statSync(target).isFile()) return null
    return readFileSync(target, 'utf8')
  } catch {
    return null
  }
}

function readJson<T>(workspace: string, relPath: string): T | null {
  const raw = harnessRead(workspace, relPath)
  if (raw == null) return null
  try { return JSON.parse(raw) as T } catch { return null }
}

// Parse every *.json under .harness/state/workflow-checkpoints/ (active features).
function readCheckpoints(workspace: string): HarnessCheckpoint[] {
  const dir = resolve(workspace, '.harness', 'state', 'workflow-checkpoints')
  let names: string[]
  try {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return []
    names = readdirSync(dir).filter(n => n.endsWith('.json'))
  } catch {
    return []
  }
  const out: HarnessCheckpoint[] = []
  for (const n of names) {
    const cp = readJson<HarnessCheckpoint>(workspace, join('.harness', 'state', 'workflow-checkpoints', n))
    if (cp) out.push(cp)
  }
  return out
}

// ── Workflow template resolution (data-driven Workflow view) ──────────────────
//
// CCC-MAGI MAY write `.harness/state/workflow-template.json` (the active
// selection) and canonical templates under `.harness/workflows/templates/<id>.json`.
// We resolve the effective template via this fallback chain — never throwing:
//
//   1. selection present + customized=true   → use selection.stages inline
//   2. selection present + customized=false  → load templates/<template_id>.json
//   3. selection absent                      → default template_id 'full-stack'
//   4. template FILE missing / unknown id    → load templates/full-stack.json
//   5. full-stack.json also missing          → empty stages (renderer falls back)
//
// The returned object always has a usable shape; an empty `stages` array signals
// the renderer to keep its built-in hardcoded fallback (old behavior preserved).

const DEFAULT_TEMPLATE_ID = 'full-stack'

// Keep only stage entries that are objects; pass fields through defensively. We
// intentionally don't validate field types here — the shared types are all
// optional and the renderer tolerates partial stages.
function sanitizeStages(stages: unknown): WorkflowStage[] {
  if (!Array.isArray(stages)) return []
  return stages.filter((s): s is WorkflowStage => !!s && typeof s === 'object')
}

function loadTemplateFile(workspace: string, id: string): WorkflowTemplateFile | null {
  // `id` originates from the (committed) selection file; guard the path anyway —
  // a hand-edited id with slashes/.. must not escape the templates dir.
  if (!id || /[\\/]/.test(id) || id.includes('..')) return null
  return readJson<WorkflowTemplateFile>(
    workspace, join('.harness', 'workflows', 'templates', `${id}.json`))
}

// Resolve the active workflow template for the workspace. Returns null only when
// nothing is resolvable AND there's no default file — but always prefers an
// object with an (possibly empty) stages array so the renderer never crashes.
export function resolveWorkflowTemplate(workspace: string): ActiveWorkflowTemplate {
  const sel = readJson<WorkflowTemplateSelection>(
    workspace, join('.harness', 'state', 'workflow-template.json'))

  // Case 1: customized selection carries its own inline ordered stages.
  if (sel && sel.customized === true && Array.isArray(sel.stages)) {
    return {
      template_id:    typeof sel.template_id === 'string' ? sel.template_id : DEFAULT_TEMPLATE_ID,
      title:          typeof sel.template_id === 'string' ? sel.template_id : DEFAULT_TEMPLATE_ID,
      summary:        undefined,
      customized:     true,
      customizations: Array.isArray(sel.customizations) ? sel.customizations : [],
      stages:         sanitizeStages(sel.stages),
    }
  }

  // Cases 2-4: resolve a canonical template file by id, falling back to full-stack.
  const wantedId = sel && typeof sel.template_id === 'string' && sel.template_id
    ? sel.template_id
    : DEFAULT_TEMPLATE_ID
  const file = loadTemplateFile(workspace, wantedId)
    ?? (wantedId !== DEFAULT_TEMPLATE_ID ? loadTemplateFile(workspace, DEFAULT_TEMPLATE_ID) : null)

  return {
    template_id:    file?.id ?? wantedId,
    title:          file?.title ?? wantedId,
    summary:        typeof file?.summary === 'string' ? file.summary : undefined,
    customized:     sel?.customized === true,
    customizations: sel && Array.isArray(sel.customizations) ? sel.customizations : [],
    stages:         sanitizeStages(file?.stages),
  }
}

// ── Transcript (AI conversation history, Page 5) ──────────────────────────────
//
// Claude Code persists each session's JSONL transcript under
// `~/.claude/projects/<encoded-workspace>/<session-uuid>.jsonl`, where the
// workspace path has every non-alnum char replaced by '-' (e.g.
// /Users/me/Desktop/App → -Users-me-Desktop-App). We pick the most recently
// modified transcript for the workspace and surface it read-only.

function encodeWorkspace(workspace: string): string {
  return resolve(workspace).replace(/[^a-zA-Z0-9]/g, '-')
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
      .filter(c => c['type'] === 'text')
      .map(c => String(c['text'] ?? ''))
      .join('')
  }
  return ''
}

function extractTools(content: unknown): string[] {
  if (!Array.isArray(content)) return []
  return content
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .filter(c => c['type'] === 'tool_use')
    .map(c => String(c['name'] ?? 'tool'))
}

function sessionsDir(workspace: string): string {
  return join(homedir(), '.claude', 'projects', encodeWorkspace(workspace))
}

// Parse a single Claude Code transcript .jsonl into ordered messages. Returns []
// on any failure. `cap` keeps the last N messages so a long session can't bloat
// the IPC payload.
function parseTranscriptFile(path: string, cap: number): TranscriptMessage[] {
  let lines: string[]
  try { lines = readFileSync(path, 'utf8').split('\n') } catch { return [] }
  const msgs: TranscriptMessage[] = []
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    let obj: Record<string, unknown>
    try { obj = JSON.parse(t) as Record<string, unknown> } catch { continue }
    const inner = (obj['message'] && typeof obj['message'] === 'object'
      ? obj['message'] as Record<string, unknown>
      : obj)
    const role        = inner['role']
    const isUser      = role === 'user'      || obj['type'] === 'human' || obj['type'] === 'user'
    const isAssistant = role === 'assistant' || obj['type'] === 'assistant'
    if (!isUser && !isAssistant) continue
    const content = inner['content'] ?? obj['content']
    const text    = extractText(content).trim()
    const tools   = extractTools(content)
    // tool_result rows arrive as user-role messages with no text — skip them.
    if (!text && tools.length === 0) continue
    msgs.push({
      role:      isUser ? 'user' : 'assistant',
      text,
      tools,
      timestamp: typeof obj['timestamp'] === 'string' ? obj['timestamp'] : undefined,
    })
  }
  return cap > 0 && msgs.length > cap ? msgs.slice(-cap) : msgs
}

// List the workspace's Claude Code sessions (what `/resume` would show), newest
// first. Parses only the 40 most-recent files (by mtime) for a title + count.
export function listSessions(workspace: string): SessionListItem[] {
  const dir = sessionsDir(workspace)
  let files: { path: string; id: string; mtimeMs: number }[]
  try {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return []
    files = readdirSync(dir)
      .filter(n => n.endsWith('.jsonl'))
      .map(n => {
        const path = join(dir, n)
        let mtimeMs = 0
        try { mtimeMs = statSync(path).mtimeMs } catch { /* unreadable → 0 */ }
        return { path, id: n.replace(/\.jsonl$/, ''), mtimeMs }
      })
  } catch {
    return []
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return files.slice(0, 40).map(f => {
    const msgs      = parseTranscriptFile(f.path, 0)
    const firstUser = msgs.find(m => m.role === 'user' && m.text)
    const title     = firstUser ? firstUser.text.replace(/\s+/g, ' ').slice(0, 80) : '—'
    return { id: f.id, title, messageCount: msgs.length, mtimeMs: f.mtimeMs }
  })
}

// Read one session's transcript by id (the .jsonl filename uuid). Guards against
// path traversal — id must be a bare filename. Cap higher than the list view
// since this is the focused single-session view.
export function readTranscriptById(workspace: string, sessionId: string): TranscriptMessage[] {
  if (!sessionId || /[\\/]/.test(sessionId) || sessionId.includes('..')) return []
  return parseTranscriptFile(join(sessionsDir(workspace), `${sessionId}.jsonl`), 1000)
}

// ── CCC-MAGI tiered memory (.harness/, NOT Claude Code transcripts) ───────────

function readJsonlEntries(workspace: string, relPath: string, cap = 200): MagiMemoryEntry[] {
  const raw = harnessRead(workspace, relPath)
  if (raw == null) return []
  const out: MagiMemoryEntry[] = []
  for (const line of raw.split('\n')) {
    const t = line.trim()
    if (!t) continue
    try { out.push(JSON.parse(t) as MagiMemoryEntry) } catch { /* skip bad line */ }
  }
  return out.length > cap ? out.slice(-cap) : out
}

function readArchiveEntries(workspace: string, cap = 200): MagiMemoryEntry[] {
  const dir = resolve(workspace, '.harness', 'memory', 'sessions', 'archive')
  let names: string[]
  try {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) return []
    names = readdirSync(dir).filter(n => n.endsWith('.jsonl')).sort()   // YYYY-MM order
  } catch {
    return []
  }
  const out: MagiMemoryEntry[] = []
  for (const n of names) {
    out.push(...readJsonlEntries(workspace, join('.harness', 'memory', 'sessions', 'archive', n), cap))
  }
  return out.length > cap ? out.slice(-cap) : out
}

export function readMagiMemory(workspace: string): MagiMemory {
  // observations: new location first, then legacy fallbacks (older installs).
  const observations = [
    ...readJsonlEntries(workspace, join('.harness', 'memory', 'sessions', 'recall', 'observations.jsonl')),
    ...readJsonlEntries(workspace, join('.harness', 'memory', 'observations.jsonl')),
    ...readJsonlEntries(workspace, join('.harness', 'memory', 'decisions.jsonl')),
  ]
  return {
    scratchpad:   harnessRead(workspace, join('.harness', 'state', 'scratchpad.md')),
    observations,
    snapshots:    readJsonlEntries(workspace, join('.harness', 'memory', 'sessions', 'recall', 'snapshots.jsonl')),
    archive:      readArchiveEntries(workspace),
    conventions:  harnessRead(workspace, join('.harness', 'memory', 'conventions.md')),
  }
}

const EMPTY_MEMORY: MagiMemory = {
  scratchpad: null, observations: [], snapshots: [], archive: [], conventions: null,
}

// ── Project stats (token usage + activity) for the Overview ───────────────────

interface SessionScan {
  messages:  number
  toolCalls: number
  input:     number
  output:    number
  cacheRead: number
  cacheCreation: number
  toolCounts: Record<string, number>   // tool name → calls
  dayCounts:  Record<string, number>   // YYYY-MM-DD → display messages
}

// One raw pass over a session .jsonl: sum token usage + count display messages,
// tool_use blocks (by name), and per-day message activity.
function scanSessionFile(path: string): SessionScan {
  const acc: SessionScan = {
    messages: 0, toolCalls: 0, input: 0, output: 0, cacheRead: 0, cacheCreation: 0,
    toolCounts: {}, dayCounts: {},
  }
  let lines: string[]
  try { lines = readFileSync(path, 'utf8').split('\n') } catch { return acc }
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    let obj: Record<string, unknown>
    try { obj = JSON.parse(t) as Record<string, unknown> } catch { continue }

    // Tokens — assistant lines carry message.usage (summed per turn = billed).
    const usage = extractUsageDelta(obj)
    if (usage) {
      if (usage.inputTokens         && usage.inputTokens         > 0) acc.input         += usage.inputTokens
      if (usage.outputTokens        && usage.outputTokens        > 0) acc.output        += usage.outputTokens
      if (usage.cacheReadTokens     && usage.cacheReadTokens     > 0) acc.cacheRead     += usage.cacheReadTokens
      if (usage.cacheCreationTokens && usage.cacheCreationTokens > 0) acc.cacheCreation += usage.cacheCreationTokens
    }

    // Display messages + tool calls (same filter as parseTranscriptFile).
    const inner = (obj['message'] && typeof obj['message'] === 'object'
      ? obj['message'] as Record<string, unknown>
      : obj)
    const role        = inner['role']
    const isUser      = role === 'user'      || obj['type'] === 'human' || obj['type'] === 'user'
    const isAssistant = role === 'assistant' || obj['type'] === 'assistant'
    if (!isUser && !isAssistant) continue
    const content = inner['content'] ?? obj['content']
    const text    = extractText(content).trim()
    const tools   = extractTools(content)
    if (!text && tools.length === 0) continue
    acc.messages  += 1
    acc.toolCalls += tools.length
    for (const name of tools) acc.toolCounts[name] = (acc.toolCounts[name] ?? 0) + 1
    const ts = typeof obj['timestamp'] === 'string' ? obj['timestamp'] : undefined
    if (ts && /^\d{4}-\d{2}-\d{2}/.test(ts)) {
      const day = ts.slice(0, 10)
      acc.dayCounts[day] = (acc.dayCounts[day] ?? 0) + 1
    }
  }
  return acc
}

// Last 14 days (ascending, UTC) of message activity, filling gaps with 0.
function buildActivity(dayCounts: Record<string, number>): Array<{ date: string; count: number }> {
  const today = new Date()
  const out: Array<{ date: string; count: number }> = []
  for (let i = 13; i >= 0; i--) {
    const key = new Date(today.getTime() - i * 86_400_000).toISOString().slice(0, 10)
    out.push({ date: key, count: dayCounts[key] ?? 0 })
  }
  return out
}

export function readProjectStats(workspace: string): ProjectStats {
  const mem = readMagiMemory(workspace)
  const stats: ProjectStats = {
    sessionCount: 0,
    messageCount: 0,
    toolCalls:    0,
    tokens:       { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, total: 0 },
    firstActiveMs: 0,
    lastActiveMs:  0,
    decisions:    mem.observations.filter(e => e.kind === 'decision').length,
    observations: mem.observations.length,
    snapshots:    mem.snapshots.length,
    archive:      mem.archive.length,
    topTools:     [],
    activity:     [],
  }

  const dir = sessionsDir(workspace)
  let files: { path: string; mtimeMs: number }[] = []
  try {
    if (existsSync(dir) && statSync(dir).isDirectory()) {
      files = readdirSync(dir).filter(n => n.endsWith('.jsonl')).map(n => {
        const path = join(dir, n)
        let mtimeMs = 0
        try { mtimeMs = statSync(path).mtimeMs } catch { /* unreadable → 0 */ }
        return { path, mtimeMs }
      })
    }
  } catch { /* no sessions dir */ }

  stats.sessionCount = files.length
  if (files.length === 0) return stats

  // Activity window over ALL sessions; token/message scan over the 200 most
  // recent (bounds work — 30-day retention keeps real counts well under this).
  let first = Infinity
  let last  = 0
  for (const f of files) {
    if (f.mtimeMs > 0) { first = Math.min(first, f.mtimeMs); last = Math.max(last, f.mtimeMs) }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs)
  const toolCounts: Record<string, number> = {}
  const dayCounts:  Record<string, number> = {}
  for (const f of files.slice(0, 200)) {
    const r = scanSessionFile(f.path)
    stats.messageCount        += r.messages
    stats.toolCalls           += r.toolCalls
    stats.tokens.input        += r.input
    stats.tokens.output       += r.output
    stats.tokens.cacheRead    += r.cacheRead
    stats.tokens.cacheCreation += r.cacheCreation
    for (const [name, c] of Object.entries(r.toolCounts)) toolCounts[name] = (toolCounts[name] ?? 0) + c
    for (const [day, c]  of Object.entries(r.dayCounts))  dayCounts[day]   = (dayCounts[day]  ?? 0) + c
  }
  stats.firstActiveMs = first === Infinity ? 0 : first
  stats.lastActiveMs  = last
  stats.tokens.total  = stats.tokens.input + stats.tokens.output + stats.tokens.cacheRead + stats.tokens.cacheCreation
  stats.topTools = Object.entries(toolCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
  stats.activity = buildActivity(dayCounts)
  return stats
}

// ── Summary bundle ────────────────────────────────────────────────────────────

export function harnessSummary(workspace: string): HarnessSummary {
  const installed = isMagiInstalled(workspace)
  if (!installed) {
    return {
      installed:    false,
      install:      null,
      constitution: null,
      workflowDoc:  null,
      checkpoints:  [],
      todolist:     null,
      memory:       EMPTY_MEMORY,
      workflow:     null,
    }
  }
  return {
    installed:    true,
    install:      readJson<HarnessInstall>(workspace, join('.harness', 'state', 'install.json')),
    constitution: harnessRead(workspace, 'constitution.md'),
    workflowDoc:  harnessRead(workspace, join('.harness', 'docs', 'workflow.md')),
    checkpoints:  readCheckpoints(workspace),
    todolist:     readJson<Todolist>(workspace, join('.harness', 'state', 'todolist.json')),
    memory:       readMagiMemory(workspace),
    workflow:     resolveWorkflowTemplate(workspace),
  }
}
