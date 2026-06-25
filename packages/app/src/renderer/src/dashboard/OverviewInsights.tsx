import type { HarnessSummary, ProjectStats } from '../../../shared/harness'
import type { DashStrings } from './strings'
import { fmt } from './strings'

// Compact at-a-glance panels for the Overview, below the stats strip. Each panel
// self-hides when it has no data, so an empty project shows nothing extra.

function FeatureCompletion({ summary, s }: { summary: HarnessSummary; s: DashStrings }): JSX.Element | null {
  const fns = summary.todolist?.functions ?? []
  if (fns.length === 0) return null
  const done  = fns.filter(f => f.status === 'done').length
  const total = fns.filter(f => f.status !== 'abandoned').length
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0
  return (
    <div className="dash-insight">
      <div className="dash-insight-head">{s.insightFeatures}</div>
      <div className="dash-bar-wrap"><div className="dash-bar-fill" style={{ width: `${pct}%` }} /></div>
      <div className="dash-insight-sub">{fmt(s.featDone, { done, total })} · {pct}%</div>
    </div>
  )
}

function WorkflowHealth({ summary, s }: { summary: HarnessSummary; s: DashStrings }): JSX.Element | null {
  const audits = summary.checkpoints.flatMap(cp => cp.audits ?? [])
  if (audits.length === 0) return null
  const n = (v: string): number => audits.filter(a => String(a.verdict ?? '').toUpperCase() === v).length
  const pass = n('PASS'), concerns = n('CONCERNS'), fail = n('FAIL'), waived = n('WAIVED')
  return (
    <div className="dash-insight">
      <div className="dash-insight-head">{s.insightAudits}</div>
      <div className="dash-verdicts">
        <span className="dash-verdict is-pass"     title={s.auditPass}>✓ {pass}</span>
        <span className="dash-verdict is-concerns" title={s.auditConcerns}>⚠ {concerns}</span>
        <span className="dash-verdict is-fail"     title={s.auditFail}>✕ {fail}</span>
        {waived > 0 ? <span className="dash-verdict is-waived" title={s.auditWaived}>⊘ {waived}</span> : null}
      </div>
    </div>
  )
}

function TopTools({ stats, s }: { stats: ProjectStats; s: DashStrings }): JSX.Element | null {
  if (stats.topTools.length === 0) return null
  const max = stats.topTools[0].count || 1
  return (
    <div className="dash-insight">
      <div className="dash-insight-head">{s.insightTools}</div>
      <div className="dash-tools">
        {stats.topTools.map(t => (
          <div key={t.name} className="dash-tool-row">
            <span className="dash-tool-name" title={t.name}>{t.name}</span>
            <span className="dash-tool-bar">
              <span className="dash-tool-bar-fill" style={{ width: `${Math.round((t.count / max) * 100)}%` }} />
            </span>
            <span className="dash-tool-count">{t.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Activity({ stats, s }: { stats: ProjectStats; s: DashStrings }): JSX.Element | null {
  const total = stats.activity.reduce((a, d) => a + d.count, 0)
  if (total === 0) return null
  const max = Math.max(...stats.activity.map(d => d.count), 1)
  return (
    <div className="dash-insight">
      <div className="dash-insight-head">{s.insightActivity}</div>
      <div className="dash-spark">
        {stats.activity.map(d => (
          <span
            key={d.date}
            className="dash-spark-bar"
            title={`${d.date}: ${d.count}`}
            style={{ height: `${d.count === 0 ? 4 : Math.max(10, Math.round((d.count / max) * 100))}%` }}
          />
        ))}
      </div>
    </div>
  )
}

function MemoryFootprint({ stats, s }: { stats: ProjectStats; s: DashStrings }): JSX.Element | null {
  if (stats.observations === 0 && stats.snapshots === 0 && stats.archive === 0) return null
  return (
    <div className="dash-insight">
      <div className="dash-insight-head">{s.insightMemory}</div>
      <div className="dash-foot">
        <span><b>{stats.observations}</b> {s.memRecall}</span>
        <span><b>{stats.snapshots}</b> {s.memSnapshots}</span>
        <span><b>{stats.archive}</b> {s.memArchive}</span>
      </div>
    </div>
  )
}

export function OverviewInsights(
  { summary, stats, s }: { summary: HarnessSummary; stats?: ProjectStats | null; s: DashStrings },
): JSX.Element {
  return (
    <div className="dash-insights">
      <FeatureCompletion summary={summary} s={s} />
      <WorkflowHealth summary={summary} s={s} />
      {stats ? <TopTools stats={stats} s={s} /> : null}
      {stats ? <Activity stats={stats} s={s} /> : null}
      {stats ? <MemoryFootprint stats={stats} s={s} /> : null}
    </div>
  )
}
