import type { HarnessSummary } from '../../../shared/harness'
import type { DashStrings } from './strings'
import { slot } from './util'
import { Markdown } from './Markdown'

// Page 1 — Project info. The install.json slots, plus (if locatable) the
// "Project Identity" section of the constitution rendered as markdown.

// Grab a markdown section whose heading matches any keyword, up to the next
// same-or-higher-level heading. Returns null if not found.
function extractSection(md: string | null, keywords: string[]): string | null {
  if (!md) return null
  const lines = md.split('\n')
  let start = -1
  let level = 0
  for (let i = 0; i < lines.length; i++) {
    const h = /^(#{1,6})\s+(.*)$/.exec(lines[i])
    if (!h) continue
    const text = h[2].toLowerCase()
    if (keywords.some(k => text.includes(k))) { start = i; level = h[1].length; break }
  }
  if (start === -1) return null
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    const h = /^(#{1,6})\s+/.exec(lines[i])
    if (h && h[1].length <= level) { end = i; break }
  }
  return lines.slice(start, end).join('\n').trim()
}

export function ProjectInfoPage({ summary, s }: { summary: HarnessSummary; s: DashStrings }): JSX.Element {
  const rows: Array<[string, string | null]> = [
    [s.description,    slot(summary, 'project_description') ?? slot(summary, 'description')],
    [s.techStack,      slot(summary, 'tech_stack')],
    [s.primaryConcern, slot(summary, 'primary_concern')],
    [s.teamSize,       slot(summary, 'team_size')],
    [s.projectStage,   slot(summary, 'project_stage')],
  ].filter(([, v]) => v) as Array<[string, string]>

  const identity = extractSection(summary.constitution, ['project identity', '项目身份', 'identity'])

  if (rows.length === 0 && !identity) {
    return <div className="dash-empty"><div className="dash-empty-title">{s.noInfo}</div></div>
  }

  return (
    <div className="dash-page">
      {rows.length > 0 && (
        <div className="dash-info-card">
          {rows.map(([k, v]) => (
            <div key={k} className="dash-info-row">
              <div className="dash-info-key">{k}</div>
              <div className="dash-info-val">{v}</div>
            </div>
          ))}
        </div>
      )}
      {identity && (
        <section className="dash-section">
          <h3 className="dash-h3">{s.identity}</h3>
          <Markdown source={identity} />
        </section>
      )}
    </div>
  )
}
