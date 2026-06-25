// Shared types for the harness visualization dashboard.
//
// These mirror the on-disk shape of CCC-MAGI's state files under
// `<workspace>/.harness/state/` and `<workspace>/constitution.md`. Every field
// is optional / defensively typed: the dashboard renderer must degrade
// gracefully when a file is missing or a key absent (the harness schema grows
// over time and older installs won't have every field). Parsers in
// HarnessReader.ts never throw — they return null on any read/parse failure.

// `.harness/state/install.json` — written by /init when the project is deployed.
export interface HarnessInstall {
  schema_version?: number | string
  mode?:           string            // 'simple' | 'pro'
  timestamp?:      string
  slots?:          Record<string, string>
  [key: string]:   unknown
}

// One file under `.harness/state/workflow-checkpoints/*.json` — an in-progress
// feature's stage state.
export interface HarnessAuditItem {
  category?:    string                // 'universal-core' | 'strong' | 'advisory'
  rule_source?: string
  finding?:     string
  [key: string]: unknown
}

export interface HarnessAudit {
  stage?:          number
  verdict?:        string             // 'PASS' | 'CONCERNS' | 'FAIL' | 'WAIVED'
  risk?:           number             // 0–10
  at?:             string             // ISO-8601
  waiver_reason?:  string
  blocking_items?: HarnessAuditItem[]
  advisory_items?: HarnessAuditItem[]
  [key: string]:   unknown
}

export interface HarnessDecision {
  at?:       string                   // ISO-8601
  stage?:    number
  by?:       string                   // 'CEO'
  decision?: string
  [key: string]: unknown
}

export interface HarnessStageInProgress {
  stage_number?:        number
  files_total?:         number
  files_done_list?:     string[]
  files_remaining_list?: string[]
  last_action?:         string
  resume_hint?:         string | null
  [key: string]:        unknown
}

export interface HarnessCheckpoint {
  schema_version?:    number | string
  feature?:           string
  feature_slug?:      string
  branch?:            string
  started_at?:        string
  last_activity_at?:  string
  mode?:              string          // 'new-feature' | 'audit'
  lane?:              string          // 'full' | 'stability-fix' | 'trivial'
  current_stage?:     number
  stages_completed?:  number[]
  stages_skipped?:    number[]
  stages_skipped_reasons?: Record<string, string>
  stage_in_progress?: HarnessStageInProgress
  audits?:            HarnessAudit[]
  decisions?:         HarnessDecision[]
  [key: string]:      unknown
}

// `.harness/state/todolist.json`
export type TodoItemStatus    = 'todo' | 'doing' | 'done'
export type TodoFnStatus      = 'planned' | 'in-progress' | 'done' | 'abandoned'

export interface TodoItem {
  id?:     string
  text?:   string
  status?: TodoItemStatus
  source?: string
  note?:   string
  [key: string]: unknown
}

export interface TodoFunction {
  id?:            string
  title?:         string
  description?:   string
  status?:        TodoFnStatus
  linked_feature?: string
  items?:         TodoItem[]
  [key: string]: unknown
}

export interface Todolist {
  schema_version?: number | string
  project?:        string
  functions?:      TodoFunction[]
  [key: string]:   unknown
}

// One message in a Claude Code session transcript. Loaded on demand for a
// specific session (the Memory page's History sub-tab), not part of the polled
// summary.
export interface TranscriptMessage {
  role:      'user' | 'assistant'
  text:      string          // collapsed plain-text content
  tools:     string[]        // names of tool_use blocks in this message (collapsible)
  timestamp?: string
}

// One Claude Code session for the workspace (mirrors what `/resume` lists). Each
// is a `~/.claude/projects/<encoded-cwd>/<id>.jsonl` file. `id` is the filename
// uuid — pass it to `claude --resume <id>` to reopen the conversation.
export interface SessionListItem {
  id:           string
  title:        string        // first user message, truncated (— if none)
  messageCount: number
  mtimeMs:      number        // file modified time (for sorting / "last active")
}

// Aggregate, human-facing project stats for the console Overview. Computed by a
// single pass over the workspace's Claude Code session transcripts (tokens /
// messages / tool calls / activity window) plus counts from .harness memory.
// Heavier than the polled summary — fetched once, not on the 2s interval.
export interface ProjectStats {
  sessionCount: number
  messageCount: number          // user + assistant display messages
  toolCalls:    number
  tokens: {
    input:         number       // summed per-turn usage = cumulative billed input
    output:        number
    cacheRead:     number
    cacheCreation: number
    total:         number       // input + output + cacheRead + cacheCreation
  }
  firstActiveMs: number         // earliest session mtime (0 = none)
  lastActiveMs:  number         // latest session mtime
  decisions:     number         // memory observations of kind 'decision'
  observations:  number         // total recall observations
  snapshots:     number         // recall session snapshots
  archive:       number         // archived (Tier 3) entries
  topTools:      Array<{ name: string; count: number }>   // most-used tools, desc
  activity:      Array<{ date: string; count: number }>   // last 14 days (asc), message counts
}

// ── CCC-MAGI tiered memory (read from .harness/, NOT Claude Code transcripts) ──
// observations + snapshots share one permissive shape; fields present depend on
// `kind`. See CCC-MAGI context-architecture-v2 (working / recall / archival).
export interface MagiMemoryEntry {
  id?:            string
  ts?:            string
  kind?:          string      // decision | failure | observation | session-snapshot
  summary?:       string
  details?:       string
  feature?:       string
  files?:         string[]
  tags?:          string[]
  source?:        string      // manual | session | auto-precompaction
  // session-snapshot extras
  focus?:         string
  decisions?:     string[]
  open_problems?: string[]
  next_intent?:   string
  files_touched?: string[]
  [key: string]:  unknown
}

export interface MagiMemory {
  scratchpad:   string | null          // Tier 1 working memory (.harness/state/scratchpad.md)
  observations: MagiMemoryEntry[]      // Tier 2 recall
  snapshots:    MagiMemoryEntry[]      // Tier 2 recall (session snapshots)
  archive:      MagiMemoryEntry[]      // Tier 3 archival (>30d), capped
  conventions:  string | null          // shared long-form conventions
}

// The parsed bundle returned by `harnessSummary(workspace)`.
export interface HarnessSummary {
  installed:    boolean
  install:      HarnessInstall | null
  constitution: string | null
  workflowDoc:  string | null
  checkpoints:  HarnessCheckpoint[]
  todolist:     Todolist | null
  memory:       MagiMemory
}
