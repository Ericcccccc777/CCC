import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve, sep } from 'path'
import { homedir } from 'os'
import { isMagiInstalled } from './MagiManager'
import { extractUsageDelta } from './api/TokenUsageAccumulator'
import type {
  HarnessSummary, HarnessInstall, HarnessCheckpoint, Todolist,
  TranscriptMessage, SessionListItem, MagiMemory, MagiMemoryEntry, ProjectStats,
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

// Iterate a .jsonl file's rows without materialising every line at once.
// `readFileSync().split('\n')` holds the whole file as ONE string AND as N
// line strings simultaneously; these transcripts reach tens of MB and this runs
// on the Electron main thread, where the extra copy is a visible stall.
function forEachJsonlRow(path: string, fn: (obj: Record<string, unknown>) => void): boolean {
  let raw: string
  try { raw = readFileSync(path, 'utf8') } catch { return false }
  let start = 0
  while (start < raw.length) {
    let end = raw.indexOf('\n', start)
    if (end === -1) end = raw.length
    const line = raw.slice(start, end).trim()
    start = end + 1
    if (!line) continue
    let obj: Record<string, unknown>
    try { obj = JSON.parse(line) as Record<string, unknown> } catch { continue }
    fn(obj)
  }
  return true
}

// The user-visible shape of one transcript row, or null for rows the UI never
// shows (tool_result echoes, meta rows). Shared by every reader below so they
// cannot drift apart on what counts as a "message".
function displayRow(obj: Record<string, unknown>): { role: 'user' | 'assistant'; text: string; tools: string[] } | null {
  const inner = (obj['message'] && typeof obj['message'] === 'object'
    ? obj['message'] as Record<string, unknown>
    : obj)
  const role        = inner['role']
  const isUser      = role === 'user'      || obj['type'] === 'human' || obj['type'] === 'user'
  const isAssistant = role === 'assistant' || obj['type'] === 'assistant'
  if (!isUser && !isAssistant) return null
  const content = inner['content'] ?? obj['content']
  const text    = extractText(content).trim()
  const tools   = extractTools(content)
  if (!text && tools.length === 0) return null
  return { role: isUser ? 'user' : 'assistant', text, tools }
}

// Parse a single Claude Code transcript .jsonl into ordered messages. Returns []
// on any failure. `cap` keeps the last N messages so a long session can't bloat
// the IPC payload.
function parseTranscriptFile(path: string, cap: number): TranscriptMessage[] {
  const msgs: TranscriptMessage[] = []
  forEachJsonlRow(path, obj => {
    const row = displayRow(obj)
    if (!row) return
    msgs.push({
      ...row,
      timestamp: typeof obj['timestamp'] === 'string' ? obj['timestamp'] : undefined,
    })
  })
  return cap > 0 && msgs.length > cap ? msgs.slice(-cap) : msgs
}

// Title + message count for the session list, WITHOUT building the messages.
// listSessions used to call parseTranscriptFile with cap = 0 — which the cap
// check reads as "unlimited" — so listing 40 sessions materialised every
// message of every transcript, complete with full text, to produce one title
// and one number per file.
function summarizeTranscriptFile(path: string): { title: string; messageCount: number } {
  let messageCount = 0
  let title: string | null = null
  forEachJsonlRow(path, obj => {
    const row = displayRow(obj)
    if (!row) return
    messageCount += 1
    if (title === null && row.role === 'user' && row.text) {
      title = row.text.replace(/\s+/g, ' ').slice(0, 80)
    }
  })
  return { title: title ?? '—', messageCount }
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
    const { title, messageCount } = summarizeTranscriptFile(f.path)
    return { id: f.id, title, messageCount, mtimeMs: f.mtimeMs }
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
// Transcripts are append-mostly and the stats pass re-reads up to 200 of them
// on every dashboard open. Key the cache on identity + mtime + size so an
// appended file re-scans and an unchanged one does not. Bounded so a user with
// many workspaces cannot grow it without limit.
const SCAN_CACHE_MAX = 400
const scanCache = new Map<string, { readonly key: string; readonly scan: SessionScan }>()

function scanSessionFile(path: string): SessionScan {
  let cacheKey: string | null = null
  try {
    const st = statSync(path)
    cacheKey = `${st.mtimeMs}:${st.size}`
    const hit = scanCache.get(path)
    if (hit && hit.key === cacheKey) return hit.scan
  } catch { /* unstattable — just scan it */ }

  const acc: SessionScan = {
    messages: 0, toolCalls: 0, input: 0, output: 0, cacheRead: 0, cacheCreation: 0,
    toolCounts: {}, dayCounts: {},
  }
  const read = scanSessionRows(path, acc)
  if (read && cacheKey !== null) {
    if (scanCache.size >= SCAN_CACHE_MAX) {
      const oldest = scanCache.keys().next().value
      if (oldest !== undefined) scanCache.delete(oldest)
    }
    scanCache.set(path, { key: cacheKey, scan: acc })
  }
  return acc
}

function scanSessionRows(path: string, acc: SessionScan): boolean {
  return forEachJsonlRow(path, obj => {

    // Tokens — assistant lines carry message.usage (summed per turn = billed).
    const usage = extractUsageDelta(obj)
    if (usage) {
      if (usage.inputTokens         && usage.inputTokens         > 0) acc.input         += usage.inputTokens
      if (usage.outputTokens        && usage.outputTokens        > 0) acc.output        += usage.outputTokens
      if (usage.cacheReadTokens     && usage.cacheReadTokens     > 0) acc.cacheRead     += usage.cacheReadTokens
      if (usage.cacheCreationTokens && usage.cacheCreationTokens > 0) acc.cacheCreation += usage.cacheCreationTokens
    }

    // Display messages + tool calls — same filter as the transcript readers.
    const row = displayRow(obj)
    if (!row) return
    acc.messages  += 1
    acc.toolCalls += row.tools.length
    for (const name of row.tools) acc.toolCounts[name] = (acc.toolCounts[name] ?? 0) + 1
    const ts = typeof obj['timestamp'] === 'string' ? obj['timestamp'] : undefined
    if (ts && /^\d{4}-\d{2}-\d{2}/.test(ts)) {
      const day = ts.slice(0, 10)
      acc.dayCounts[day] = (acc.dayCounts[day] ?? 0) + 1
    }
  })
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
  }
}
