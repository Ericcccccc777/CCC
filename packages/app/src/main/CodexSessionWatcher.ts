import { existsSync, readdirSync, openSync, readSync, closeSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type { SessionStateUpdate } from '../shared/session-state'

// Per-session state: first we *find* the rollout JSONL that Codex CLI writes
// for this session (matched by cwd + spawn time), then we tail-watch it for
// task_started / task_complete / token_count events. Both phases use timer
// polling with cadence consistent with STABILITY_RULES.md §2.3 (≥1s find,
// ≥2s tail).
interface WatchEntry {
  cwd:         string
  spawnedAtMs: number              // wall-clock when start() was called
  findTimer:   ReturnType<typeof setInterval> | null
  rolloutPath: string | null
  offset:      number              // tail offset in the rollout file
  tailTimer:   ReturnType<typeof setInterval> | null
}

const FIND_POLL_MS    = 1000
// Give up only after a generous window. Codex on macOS spawns through a
// Terminal window that can take 10s+ before the inner `codex` writes its
// first event, especially on first-launch when shells warm caches. 5min
// is enough to cover that without leaking timers forever if Codex never
// produces a file (e.g. user closed Terminal before typing anything).
const FIND_GIVEUP_MS  = 5 * 60 * 1000
const TAIL_POLL_MS    = 2000
// Tolerate broad clock skew between when CCC records spawnedAtMs and when
// Codex's session_meta lands on disk. macOS file mtime can also lag
// page-cache flushes by several seconds.
const SPAWN_BUFFER_MS = 60 * 1000

// Watches Codex CLI session rollout files (~/.codex/sessions/YYYY/MM/DD/
// rollout-*.jsonl) and emits SESSION_STATE_CHANGED events so the renderer's
// existing icon/state machinery picks up Codex progress without any
// renderer-side changes.
//
// Codex events used:
//   task_started  → state = 'streaming'
//   task_complete → state = 'done'
//
// 'waiting' state is intentionally NOT emitted: Codex has no PreToolUse-
// equivalent signal, and inferring it from idle time would be unreliable.
// Rate-limit / token-count events are intentionally NOT mapped — the user
// explicitly opted out of surfacing those for Codex sessions.
export class CodexSessionWatcher {
  private win:     BrowserWindow | null = null
  private watches = new Map<number, WatchEntry>()

  attachWindow(win: BrowserWindow): void {
    this.win = win
  }

  start(sessionId: number, cwd: string): void {
    // Defensive: if a watcher already exists (e.g. session re-registered after
    // recovery), tear it down first so we don't leak intervals.
    if (this.watches.has(sessionId)) this.stop(sessionId)

    const entry: WatchEntry = {
      cwd,
      spawnedAtMs: Date.now(),
      findTimer:   null,
      rolloutPath: null,
      offset:      0,
      tailTimer:   null,
    }
    const startedAt = Date.now()
    entry.findTimer = setInterval(() => {
      const path = this.findRolloutFile(cwd, entry.spawnedAtMs)
      if (path) {
        if (entry.findTimer) clearInterval(entry.findTimer)
        entry.findTimer = null
        entry.rolloutPath = path
        this.startTailing(sessionId, entry)
        return
      }
      if (Date.now() - startedAt >= FIND_GIVEUP_MS) {
        // Codex didn't write a recognizable rollout in 30s. Stop polling —
        // session monitoring is unavailable for this session, but the
        // process is still usable.
        if (entry.findTimer) clearInterval(entry.findTimer)
        entry.findTimer = null
      }
    }, FIND_POLL_MS)
    this.watches.set(sessionId, entry)
  }

  stop(sessionId: number): void {
    const e = this.watches.get(sessionId)
    if (!e) return
    if (e.findTimer) clearInterval(e.findTimer)
    if (e.tailTimer) clearInterval(e.tailTimer)
    this.watches.delete(sessionId)
  }

  stopAll(): void {
    for (const id of [...this.watches.keys()]) this.stop(id)
  }

  // Scan today's + yesterday's Codex sessions directory for the most-recently-
  // created rollout whose session_meta header lists this cwd and a timestamp
  // close to our spawn. Yesterday is checked so a session that started right
  // before midnight UTC doesn't get missed.
  private findRolloutFile(cwd: string, spawnedAtMs: number): string | null {
    try {
      const sessionsDir = join(homedir(), '.codex', 'sessions')
      if (!existsSync(sessionsDir)) return null

      const candidates: { path: string; ts: number }[] = []
      for (const dir of dateDirCandidates(sessionsDir, new Date())) {
        if (!existsSync(dir)) continue
        let entries: string[]
        try { entries = readdirSync(dir) } catch { continue }
        for (const name of entries) {
          if (!name.endsWith('.jsonl')) continue
          const path = join(dir, name)
          let stat
          try { stat = statSync(path) } catch { continue }
          if (stat.mtimeMs < spawnedAtMs - SPAWN_BUFFER_MS) continue

          const meta = readSessionMeta(path)
          if (!meta || meta.cwd !== cwd) continue
          candidates.push({ path, ts: meta.timestamp ?? stat.mtimeMs })
        }
      }
      if (candidates.length === 0) return null
      // Pick the rollout whose own session_meta.timestamp is closest to our
      // spawn — covers the rare case of two sessions in the same cwd
      // started within seconds of each other.
      candidates.sort((a, b) => Math.abs(a.ts - spawnedAtMs) - Math.abs(b.ts - spawnedAtMs))
      return candidates[0].path
    } catch {
      return null
    }
  }

  private startTailing(sessionId: number, entry: WatchEntry): void {
    if (!entry.rolloutPath) return
    // Start from offset 0 — Codex writes session_meta + the first
    // task_started before we typically find the file, so we want to replay
    // those events into the state machinery.
    entry.offset = 0
    this.pollOnce(sessionId, entry)
    entry.tailTimer = setInterval(() => this.pollOnce(sessionId, entry), TAIL_POLL_MS)
  }

  private pollOnce(sessionId: number, entry: WatchEntry): void {
    if (!entry.rolloutPath) return
    let stat
    try { stat = statSync(entry.rolloutPath) } catch { return }
    if (stat.size <= entry.offset) return
    let buf: Buffer
    try {
      const fd = openSync(entry.rolloutPath, 'r')
      buf = Buffer.alloc(stat.size - entry.offset)
      readSync(fd, buf, 0, buf.length, entry.offset)
      closeSync(fd)
    } catch { return }
    entry.offset = stat.size
    for (const line of buf.toString('utf8').split('\n')) {
      const t = line.trim()
      if (!t) continue
      this.processLine(sessionId, t)
    }
  }

  // Exposed for unit tests so processLine logic can be exercised without
  // spinning up real file polling.
  processLine(sessionId: number, line: string): void {
    let parsed: unknown
    try { parsed = JSON.parse(line) } catch { return }
    const evt = mapCodexEvent(sessionId, parsed)
    if (evt?.state) this.sendState(evt.state)
  }

  private sendState(update: SessionStateUpdate): void {
    this.win?.webContents.send(IPC.SESSION_STATE_CHANGED, update)
  }
}

// ── Pure helpers (exported for tests) ─────────────────────────────────────

// Codex appears to write its rollout into a directory derived from LOCAL
// date (sample on a user machine: rollout-2026-05-16T21-45 in dir
// 2026/05/16, with payload.timestamp 11:45Z — that's UTC+10 wall-clock
// time used for both the filename and the path). We don't want to assume
// either local OR UTC though, so check both — duplicates are deduped by
// the caller via path-set membership.
export function dateDirCandidates(root: string, now: Date): readonly string[] {
  const fmtLocal = (d: Date): string =>
    join(
      root,
      String(d.getFullYear()),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0'),
    )
  const fmtUtc = (d: Date): string =>
    join(
      root,
      String(d.getUTCFullYear()),
      String(d.getUTCMonth() + 1).padStart(2, '0'),
      String(d.getUTCDate()).padStart(2, '0'),
    )
  const yesterday = new Date(now.getTime() - 86_400_000)
  const all = [fmtLocal(now), fmtUtc(now), fmtLocal(yesterday), fmtUtc(yesterday)]
  // Dedup while preserving order so today (local) is checked first.
  return Array.from(new Set(all))
}

interface SessionMetaSnap {
  cwd:       string
  timestamp: number | null
}

// Reads the first line of a rollout JSONL and pulls out the session_meta
// header. Returns null if the file doesn't open, the first line isn't JSON,
// or the line isn't a session_meta event.
//
// IMPORTANT: Codex's session_meta line carries the full system-prompt /
// base_instructions blob and can be ≥20KB. A previous 4KB read cap meant
// JSON.parse always failed on real rollouts → no rollout was ever matched
// → the watcher silently never fired. We now read the file incrementally
// (32KB chunks) until we hit a newline, capped at 256KB so a corrupt /
// unterminated first line can't make us slurp the whole transcript.
function readSessionMeta(path: string): SessionMetaSnap | null {
  const CHUNK_SIZE = 32 * 1024
  const MAX_LINE   = 256 * 1024
  try {
    const stat = statSync(path)
    if (stat.size <= 0) return null
    const fd = openSync(path, 'r')
    let firstLine: string | null = null
    let collected = ''
    let pos = 0
    try {
      while (pos < stat.size && collected.length < MAX_LINE) {
        const want = Math.min(CHUNK_SIZE, stat.size - pos)
        const buf  = Buffer.alloc(want)
        const got  = readSync(fd, buf, 0, want, pos)
        if (got <= 0) break
        const chunk = buf.subarray(0, got).toString('utf8')
        const nl = chunk.indexOf('\n')
        if (nl >= 0) {
          firstLine = collected + chunk.slice(0, nl)
          break
        }
        collected += chunk
        pos += got
      }
      // EOF without a newline AND we have any data → treat that as the
      // first (only) line. Useful when Codex has written session_meta but
      // hasn't flushed the trailing newline yet.
      if (firstLine === null && collected.length > 0) firstLine = collected
    } finally {
      closeSync(fd)
    }
    if (!firstLine) return null
    const data = JSON.parse(firstLine) as Record<string, unknown>
    if (data['type'] !== 'session_meta') return null
    const payload = data['payload'] as Record<string, unknown> | undefined
    const cwd     = typeof payload?.['cwd'] === 'string' ? payload['cwd'] as string : null
    if (!cwd) return null
    const tsRaw = payload?.['timestamp']
    const timestamp = typeof tsRaw === 'string' ? new Date(tsRaw).getTime() : null
    return { cwd, timestamp: Number.isFinite(timestamp) ? timestamp : null }
  } catch {
    return null
  }
}

interface MappedEvent {
  state?: SessionStateUpdate
}

// Pure mapping from a parsed Codex event to a state update. Exposed for
// unit tests so we don't need real fs access to validate the mapping.
// Only task_started → streaming and task_complete → done are mapped;
// every other event type returns null.
export function mapCodexEvent(sessionId: number, parsed: unknown): MappedEvent | null {
  if (!parsed || typeof parsed !== 'object') return null
  const obj = parsed as Record<string, unknown>
  if (obj['type'] !== 'event_msg') return null
  const payload = obj['payload'] as Record<string, unknown> | undefined
  if (!payload) return null
  const eventType = payload['type']

  if (eventType === 'task_started') {
    return { state: { sessionId, state: 'streaming' } }
  }
  if (eventType === 'task_complete') {
    return { state: { sessionId, state: 'done' } }
  }
  return null
}
