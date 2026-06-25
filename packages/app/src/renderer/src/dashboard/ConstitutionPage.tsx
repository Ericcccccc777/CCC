import type { HarnessSummary } from '../../../shared/harness'
import type { DashStrings } from './strings'
import { Markdown } from './Markdown'

// Page 2 — Constitution. Render constitution.md as formatted markdown.
export function ConstitutionPage({ summary, s }: { summary: HarnessSummary; s: DashStrings }): JSX.Element {
  if (!summary.constitution) {
    return <div className="dash-empty"><div className="dash-empty-title">{s.noConstitution}</div></div>
  }
  return (
    <div className="dash-page dash-page-doc">
      <Markdown source={summary.constitution} />
    </div>
  )
}
