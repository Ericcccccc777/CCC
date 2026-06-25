import { useEffect, useState } from 'react'
import { useLangContext } from './i18n'
import type { HarnessSummary, ProjectStats } from '../../shared/harness'
import { getStrings } from './dashboard/strings'
import { slot } from './dashboard/util'
import { OverviewPage, type DashTab } from './dashboard/OverviewPage'
import { ProjectInfoPage } from './dashboard/ProjectInfoPage'
import { ConstitutionPage } from './dashboard/ConstitutionPage'
import { WorkflowPage } from './dashboard/WorkflowPage'
import { TodolistPage } from './dashboard/TodolistPage'
import { MemoryPage } from './dashboard/MemoryPage'
import './styles/dashboard.css'

// ─────────────────────────────────────────────────────────────────────────────
// Harness visualization dashboard (?view=dashboard&workspace=…).
//
// Read-only viewer over an installed CCC-MAGI project's state. Polls
// window.ccc.harnessSummary(workspace) every 2s (matching the repo's polling
// convention — no fs watchers) so the board reflects ongoing work live.
// ─────────────────────────────────────────────────────────────────────────────

const POLL_MS = 2000

export function Dashboard({ workspace }: { workspace: string }): JSX.Element {
  const { lang } = useLangContext()
  const s = getStrings(lang)

  const [summary, setSummary] = useState<HarnessSummary | null>(null)
  const [stats, setStats]     = useState<ProjectStats | null>(null)
  const [tab, setTab] = useState<DashTab>('overview')

  useEffect(() => {
    let alive = true
    const load = async (): Promise<void> => {
      const next = await window.ccc?.harnessSummary(workspace)
      if (alive && next) setSummary(next)
    }
    void load()
    const id = setInterval(() => void load(), POLL_MS)
    return () => { alive = false; clearInterval(id) }
  }, [workspace])

  // Project stats (token totals, activity) are heavier — a one-pass scan over
  // all session transcripts — so fetch once on open instead of on the 2s poll.
  useEffect(() => {
    let alive = true
    void (async () => {
      const next = await window.ccc?.harnessStats(workspace)
      if (alive && next) setStats(next)
    })()
    return () => { alive = false }
  }, [workspace])

  const close = (): void => window.close()

  const projectName = summary ? (slot(summary, 'project_name') ?? summary.todolist?.project ?? s.title) : s.title

  const tabs: Array<[DashTab, string]> = [
    ['overview',     s.tabOverview],
    ['info',         s.tabInfo],
    ['constitution', s.tabConstitution],
    ['workflow',     s.tabWorkflow],
    ['todo',         s.tabTodo],
    ['memory',       s.tabMemory],
  ]

  return (
    <div className="hw-window dash-window">
      <div className="hw-titlebar">
        <div className="hw-titlebar-drag">
          <span className="hw-titlebar-title">{projectName}</span>
          <span className="hw-titlebar-workspace" title={workspace}>{workspace}</span>
        </div>
        <button className="hw-titlebar-close" aria-label={s.close} onClick={close}>✕</button>
      </div>

      {!summary
        ? <div className="dash-loading"><span className="magi-spinner" aria-hidden="true" />{s.loading}</div>
        : !summary.installed
          ? (
            <div className="dash-empty dash-empty-full">
              <div className="dash-empty-title">{s.notInstalled}</div>
              <div className="dash-empty-hint">{s.notInstalledHint}</div>
            </div>
          )
          : (
            <>
              <nav className="dash-tabs">
                {tabs.map(([id, label]) => (
                  <button
                    key={id}
                    className={`dash-tab${tab === id ? ' is-active' : ''}`}
                    onClick={() => setTab(id)}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              <div className="dash-content">
                {tab === 'overview'     && <OverviewPage summary={summary} s={s} onNavigate={setTab} workspace={workspace} stats={stats} />}
                {tab === 'info'         && <ProjectInfoPage summary={summary} s={s} />}
                {tab === 'constitution' && <ConstitutionPage summary={summary} s={s} />}
                {tab === 'workflow'     && <WorkflowPage summary={summary} s={s} lang={lang} />}
                {tab === 'todo'         && <TodolistPage summary={summary} s={s} />}
                {tab === 'memory'       && <MemoryPage summary={summary} s={s} workspace={workspace} />}
              </div>
            </>
          )}
    </div>
  )
}
