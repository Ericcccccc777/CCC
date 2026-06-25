// Pure derivations over the HarnessSummary bundle. Kept side-effect-free so
// pages stay declarative. Everything tolerates missing/partial data.
import type {
  HarnessSummary, HarnessCheckpoint, HarnessDecision, Todolist, TodoItemStatus,
} from '../../../shared/harness'

export function slot(summary: HarnessSummary, key: string): string | null {
  const v = summary.install?.slots?.[key]
  return typeof v === 'string' && v.trim() ? v : null
}

// The active feature the CEO is most likely "on" = the checkpoint with the most
// recent activity. Null when there are no active checkpoints.
export function latestCheckpoint(summary: HarnessSummary): HarnessCheckpoint | null {
  const cps = summary.checkpoints ?? []
  if (cps.length === 0) return null
  return [...cps].sort((a, b) =>
    (b.last_activity_at ?? '').localeCompare(a.last_activity_at ?? ''))[0]
}

// Flatten all decisions across checkpoints, newest first.
export function allDecisions(summary: HarnessSummary): Array<HarnessDecision & { feature?: string }> {
  const out: Array<HarnessDecision & { feature?: string }> = []
  for (const cp of summary.checkpoints ?? []) {
    for (const d of cp.decisions ?? []) out.push({ ...d, feature: cp.feature ?? cp.feature_slug })
  }
  return out.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))
}

export interface TodoCounts { done: number; doing: number; todo: number; total: number }

export function countItems(todolist: Todolist | null): TodoCounts {
  const c: TodoCounts = { done: 0, doing: 0, todo: 0, total: 0 }
  for (const fn of todolist?.functions ?? []) {
    for (const it of fn.items ?? []) {
      const st = (it.status ?? 'todo') as TodoItemStatus
      if (st === 'done') c.done++
      else if (st === 'doing') c.doing++
      else c.todo++
      c.total++
    }
  }
  return c
}

// Short relative-ish label for an ISO timestamp (date only — no live clock).
export function shortDate(iso?: string): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : iso
}

export const TOTAL_STAGES = 9

// Compact human-friendly token / count formatter: 0 · 940 · 9.4k · 12k · 1.20M.
export function fmtTokens(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n < 1000)        return String(Math.round(n))
  if (n < 1_000_000)   return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(n < 10_000_000 ? 2 : 1)}M`
}

// ISO 8601 date (or a ms epoch) → YYYY-MM-DD; '' when absent.
export function shortDateMs(ms?: number): string {
  if (!ms || ms <= 0) return ''
  return shortDate(new Date(ms).toISOString())
}
