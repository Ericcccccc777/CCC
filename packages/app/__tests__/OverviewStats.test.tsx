import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { OverviewPage } from '@renderer/dashboard/OverviewPage'
import { getStrings } from '@renderer/dashboard/strings'
import { fmtTokens } from '@renderer/dashboard/util'
import type { HarnessSummary, ProjectStats } from '../src/shared/harness'

const s = getStrings('en')

const summary: HarnessSummary = {
  installed: true, install: null, constitution: null, workflowDoc: null,
  checkpoints: [], todolist: null,
  memory: { scratchpad: null, observations: [], snapshots: [], archive: [], conventions: null },
}

const stats: ProjectStats = {
  sessionCount: 14,
  messageCount: 320,
  toolCalls:    540,
  tokens: { input: 2_100_000, output: 380_000, cacheRead: 9_900_000, cacheCreation: 20_000, total: 12_400_000 },
  firstActiveMs: Date.parse('2026-06-01T00:00:00Z'),
  lastActiveMs:  Date.parse('2026-06-20T00:00:00Z'),
  decisions: 8, observations: 12, snapshots: 5, archive: 30,
  topTools: [{ name: 'Bash', count: 40 }, { name: 'Edit', count: 25 }],
  activity: [{ date: '2026-06-19', count: 3 }, { date: '2026-06-20', count: 7 }],
}

describe('fmtTokens', () => {
  it('formats compactly across magnitudes', () => {
    expect(fmtTokens(0)).toBe('0')
    expect(fmtTokens(940)).toBe('940')
    expect(fmtTokens(9_400)).toBe('9.4k')
    expect(fmtTokens(12_000)).toBe('12k')
    expect(fmtTokens(2_100_000)).toBe('2.10M')
    expect(fmtTokens(12_400_000)).toBe('12.4M')
  })
})

describe('OverviewPage stats strip', () => {
  it('renders token total + breakdown and activity counts', () => {
    render(<OverviewPage summary={summary} s={s} onNavigate={() => {}} workspace="/ws" stats={stats} />)
    expect(screen.getByText('12.4M')).toBeDefined()          // total tokens headline
    expect(screen.getByText(s.statTokens)).toBeDefined()
    expect(screen.getByText(/in 2\.10M/)).toBeDefined()      // breakdown sub-line
    expect(screen.getByText('14')).toBeDefined()             // sessions
    expect(screen.getByText('320')).toBeDefined()            // messages
    expect(screen.getByText('540')).toBeDefined()            // tool calls
    expect(screen.getByText('8')).toBeDefined()              // decisions
    expect(screen.getByText('2026-06-01 → 2026-06-20')).toBeDefined()
  })

  it('renders insight panels: top tools, activity, memory footprint', () => {
    render(<OverviewPage summary={summary} s={s} onNavigate={() => {}} workspace="/ws" stats={stats} />)
    expect(screen.getByText(s.insightTools)).toBeDefined()
    expect(screen.getByText('Bash')).toBeDefined()
    expect(screen.getByText(s.insightActivity)).toBeDefined()
    expect(screen.getByText(s.insightMemory)).toBeDefined()
  })

  it('renders feature completion + workflow health from .harness state', () => {
    const rich: HarnessSummary = {
      ...summary,
      todolist:    { functions: [{ status: 'done' }, { status: 'done' }, { status: 'in-progress' }, { status: 'abandoned' }] },
      checkpoints: [{ audits: [{ verdict: 'PASS' }, { verdict: 'PASS' }, { verdict: 'CONCERNS' }] }],
    }
    render(<OverviewPage summary={rich} s={s} onNavigate={() => {}} workspace="/ws" stats={stats} />)
    expect(screen.getByText(s.insightFeatures)).toBeDefined()
    expect(screen.getByText(/2\/3 done/)).toBeDefined()      // done / non-abandoned
    expect(screen.getByText(s.insightAudits)).toBeDefined()
    expect(screen.getByText('✓ 2')).toBeDefined()
    expect(screen.getByText('⚠ 1')).toBeDefined()
  })

  it('omits the strip when there is no activity', () => {
    const empty: ProjectStats = {
      sessionCount: 0, messageCount: 0, toolCalls: 0,
      tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0, total: 0 },
      firstActiveMs: 0, lastActiveMs: 0, decisions: 0, observations: 0, snapshots: 0, archive: 0,
      topTools: [], activity: [],
    }
    render(<OverviewPage summary={summary} s={s} onNavigate={() => {}} workspace="/ws" stats={empty} />)
    expect(screen.queryByText(s.statTokens)).toBeNull()
  })
})
