import type { HarnessSummary, ProjectStats } from '../../../shared/harness'
import type { DashStrings } from './strings'
import { fmt } from './strings'
import { slot, latestCheckpoint, allDecisions, countItems, shortDate, fmtTokens, shortDateMs } from './util'
import { MagiUpdatePanel } from './MagiUpdatePanel'
import { OverviewInsights } from './OverviewInsights'

// Page 0 — Overview. One screen to grasp where the project is right now.
export type DashTab = 'overview' | 'info' | 'constitution' | 'workflow' | 'todo' | 'memory'

// A human-friendly at-a-glance strip: token consumption + activity, summed over
// the workspace's Claude Code sessions plus .harness memory counts.
function StatsStrip({ stats, s }: { stats: ProjectStats; s: DashStrings }): JSX.Element | null {
  if (stats.sessionCount === 0 && stats.tokens.total === 0) return null
  const range = stats.firstActiveMs
    ? fmt(s.statActiveRange, { from: shortDateMs(stats.firstActiveMs), to: shortDateMs(stats.lastActiveMs) })
    : ''
  return (
    <div className="dash-stats">
      <div className="dash-stat dash-stat--wide">
        <div className="dash-stat-value">{fmtTokens(stats.tokens.total)}</div>
        <div className="dash-stat-label">{s.statTokens}</div>
        <div className="dash-stat-sub">{fmt(s.statTokensBreakdown, {
          in:    fmtTokens(stats.tokens.input),
          out:   fmtTokens(stats.tokens.output),
          cache: fmtTokens(stats.tokens.cacheRead + stats.tokens.cacheCreation),
        })}</div>
      </div>
      <div className="dash-stat">
        <div className="dash-stat-value">{stats.sessionCount}</div>
        <div className="dash-stat-label">{s.statSessions}</div>
        {range ? <div className="dash-stat-sub">{range}</div> : null}
      </div>
      <div className="dash-stat">
        <div className="dash-stat-value">{stats.messageCount}</div>
        <div className="dash-stat-label">{s.statMessages}</div>
      </div>
      <div className="dash-stat">
        <div className="dash-stat-value">{stats.toolCalls}</div>
        <div className="dash-stat-label">{s.statToolCalls}</div>
      </div>
      <div className="dash-stat">
        <div className="dash-stat-value">{stats.decisions}</div>
        <div className="dash-stat-label">{s.statDecisions}</div>
      </div>
    </div>
  )
}

export function OverviewPage(
  { summary, s, onNavigate, workspace, stats }: { summary: HarnessSummary; s: DashStrings; onNavigate: (t: DashTab) => void; workspace: string; stats?: ProjectStats | null },
): JSX.Element {
  const name    = slot(summary, 'project_name') ?? summary.todolist?.project ?? '—'
  const desc    = slot(summary, 'project_description') ?? slot(summary, 'description')
  const active  = latestCheckpoint(summary)
  const counts  = countItems(summary.todolist)
  const recent  = allDecisions(summary).slice(0, 5)

  const cards: Array<{ tab: DashTab; label: string }> = [
    { tab: 'constitution', label: s.tabConstitution },
    { tab: 'workflow',     label: s.tabWorkflow },
    { tab: 'todo',         label: s.tabTodo },
    { tab: 'memory',       label: s.tabMemory },
  ]

  return (
    <div className="dash-page">
      <div className="dash-hero">
        <div className="dash-hero-name">{name}</div>
        {desc ? <div className="dash-hero-desc">{desc}</div> : null}
      </div>

      <MagiUpdatePanel workspace={workspace} s={s} />

      {stats ? <StatsStrip stats={stats} s={s} /> : null}

      <OverviewInsights summary={summary} stats={stats} s={s} />

      <div className="dash-focus">
        <div className="dash-focus-label">{s.currentFocus}</div>
        {active
          ? (
            <div className="dash-focus-body">
              <span className="dash-focus-feature">{active.feature ?? active.feature_slug}</span>
              <span className="dash-chip is-stage">{fmt(s.stageOf, { n: active.current_stage ?? 1 })}</span>
              {active.lane ? <span className="dash-chip">{active.lane}</span> : null}
            </div>
          )
          : <div className="dash-muted">{s.noActiveFeature}</div>}
      </div>

      <div className="dash-overview-row">
        <div className="dash-progress-box">
          <div className="dash-progress-label">{s.progressSummary}</div>
          <div className="dash-progress-pills">
            <span className="dash-pill is-done">✅ {counts.done}</span>
            <span className="dash-pill is-doing">🔵 {counts.doing}</span>
            <span className="dash-pill is-todo">⚪ {counts.todo}</span>
          </div>
        </div>
      </div>

      <div className="dash-cards">
        {cards.map(c => (
          <button key={c.tab} className="dash-card" onClick={() => onNavigate(c.tab)}>{c.label}</button>
        ))}
      </div>

      <section className="dash-section">
        <h3 className="dash-h3">{s.recentActivity}</h3>
        {recent.length === 0
          ? <div className="dash-muted">{s.noActivity}</div>
          : (
            <ul className="dash-activity">
              {recent.map((d, i) => (
                <li key={i}>
                  <span className="dash-activity-date">{shortDate(d.at)}</span>
                  {d.feature ? <span className="dash-activity-feature">{d.feature}</span> : null}
                  <span className="dash-activity-text">{d.decision}</span>
                </li>
              ))}
            </ul>
          )}
      </section>
    </div>
  )
}
