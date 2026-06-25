import { useEffect, useState } from 'react'
import type {
  HarnessSummary, MagiMemoryEntry, SessionListItem, TranscriptMessage,
} from '../../../shared/harness'
import type { DashStrings } from './strings'
import { fmt } from './strings'
import { shortDate } from './util'
import { Markdown } from './Markdown'

// Page 5 — Memory. Two sub-tabs:
//   • Memory:  CCC-MAGI's tiered, distilled memory from .harness/ (summaries).
//   • History: Claude Code sessions for the workspace (same as /resume) — open
//              one to read it, or "Resume this session" to reopen it in a new
//              CCC-managed terminal via `claude --resume <id>`.

type Sub = 'memory' | 'history'

// ── Memory sub-tab (CCC-MAGI tiers) ───────────────────────────────────────────

function MemEntry({ e }: { e: MagiMemoryEntry }): JSX.Element {
  const title = e.summary ?? e.focus ?? e.kind ?? '—'
  return (
    <div className="mem-entry">
      <div className="mem-entry-head">
        {e.kind    ? <span className="mem-kind">{e.kind}</span> : null}
        {e.feature ? <span className="mem-feature">{e.feature}</span> : null}
        {e.ts      ? <span className="mem-ts">{shortDate(e.ts)}</span> : null}
      </div>
      <div className="mem-entry-summary">{title}</div>
      {e.details ? <div className="mem-entry-details">{e.details}</div> : null}
      {Array.isArray(e.decisions) && e.decisions.length > 0 ? (
        <ul className="mem-bullets">{e.decisions.map((d, i) => <li key={i}>{String(d)}</li>)}</ul>
      ) : null}
      {Array.isArray(e.open_problems) && e.open_problems.length > 0 ? (
        <div className="mem-open">⚠ {e.open_problems.map(String).join('; ')}</div>
      ) : null}
    </div>
  )
}

function MemorySub({ summary, s }: { summary: HarnessSummary; s: DashStrings }): JSX.Element {
  const m = summary.memory
  const empty = !m.scratchpad && !m.conventions
    && m.observations.length === 0 && m.snapshots.length === 0 && m.archive.length === 0
  if (empty) {
    return <div className="dash-empty"><div className="dash-empty-title">{s.memEmpty}</div></div>
  }
  // newest-first for the list tiers
  const rev = (xs: MagiMemoryEntry[]): MagiMemoryEntry[] => xs.slice().reverse()
  return (
    <div className="mem-sub">
      <div className="mem-note">{s.memMemoryNote}</div>

      <section className="dash-section">
        <h3 className="dash-h3">{s.memWorking}</h3>
        {m.scratchpad
          ? <Markdown source={m.scratchpad} />
          : <div className="dash-muted">{s.memScratchpadEmpty}</div>}
      </section>

      {m.snapshots.length > 0 && (
        <section className="dash-section">
          <h3 className="dash-h3">{s.memSnapshots}</h3>
          {rev(m.snapshots).map((e, i) => <MemEntry key={i} e={e} />)}
        </section>
      )}

      {m.observations.length > 0 && (
        <section className="dash-section">
          <h3 className="dash-h3">{s.memRecall}</h3>
          {rev(m.observations).map((e, i) => <MemEntry key={i} e={e} />)}
        </section>
      )}

      {m.archive.length > 0 && (
        <section className="dash-section">
          <h3 className="dash-h3">{s.memArchive}</h3>
          {rev(m.archive).map((e, i) => <MemEntry key={i} e={e} />)}
        </section>
      )}

      {m.conventions && (
        <section className="dash-section">
          <h3 className="dash-h3">{s.memConventions}</h3>
          <Markdown source={m.conventions} />
        </section>
      )}
    </div>
  )
}

// ── History sub-tab (Claude Code sessions = /resume) ──────────────────────────

function Message({ msg, s }: { msg: TranscriptMessage; s: DashStrings }): JSX.Element {
  const [showTools, setShowTools] = useState(false)
  const isUser = msg.role === 'user'
  return (
    <div className={`dash-msg ${isUser ? 'is-user' : 'is-ai'}`}>
      <div className="dash-msg-role">{isUser ? s.you : s.ai}</div>
      {msg.text ? <div className="dash-msg-text">{msg.text}</div> : null}
      {msg.tools.length > 0 && (
        <div className="dash-msg-tools">
          <button className="dash-msg-tools-toggle" onClick={() => setShowTools(v => !v)}>
            {showTools ? '▾' : '▸'} {fmt(s.toolsUsed, { n: msg.tools.length })}
          </button>
          {showTools && (
            <div className="dash-msg-tool-chips">
              {msg.tools.map((t, i) => <span key={i} className="dash-tool-chip">{t}</span>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function HistorySub({ workspace, s }: { workspace: string; s: DashStrings }): JSX.Element {
  const [sessions, setSessions] = useState<SessionListItem[] | null>(null)
  const [open, setOpen] = useState<{ id: string; msgs: TranscriptMessage[] | null } | null>(null)

  useEffect(() => {
    let alive = true
    void (async () => {
      const list = await window.ccc?.harnessListSessions(workspace)
      if (alive) setSessions(list ?? [])
    })()
    return () => { alive = false }
  }, [workspace])

  const openSession = async (id: string): Promise<void> => {
    setOpen({ id, msgs: null })
    const msgs = await window.ccc?.harnessReadSession(workspace, id)
    setOpen({ id, msgs: msgs ?? [] })
  }

  const resume = (id: string): void => window.ccc?.resumeSession(workspace, id)

  if (open) {
    return (
      <div className="sess-detail">
        <div className="sess-detail-bar">
          <button className="dash-msg-tools-toggle" onClick={() => setOpen(null)}>{s.sessBack}</button>
          <button className="sess-resume-btn" onClick={() => resume(open.id)}>{s.sessResume}</button>
        </div>
        {open.msgs === null
          ? <div className="dash-loading"><span className="magi-spinner" aria-hidden="true" />{s.sessLoading}</div>
          : open.msgs.length === 0
            ? <div className="dash-empty"><div className="dash-empty-title">{s.noHistory}</div></div>
            : <div className="dash-history">{open.msgs.map((mm, i) => <Message key={i} msg={mm} s={s} />)}</div>}
      </div>
    )
  }

  if (sessions === null) {
    return <div className="dash-loading"><span className="magi-spinner" aria-hidden="true" />{s.sessLoading}</div>
  }
  if (sessions.length === 0) {
    return <div className="dash-empty"><div className="dash-empty-title">{s.sessEmpty}</div></div>
  }

  return (
    <div className="sess-list">
      <div className="mem-note">{s.memHistoryNote}</div>
      {sessions.map(item => (
        <div key={item.id} className="sess-row">
          <button className="sess-row-main" onClick={() => void openSession(item.id)}>
            <span className="sess-row-title">{item.title}</span>
            <span className="sess-row-meta">
              {shortDate(new Date(item.mtimeMs).toISOString())} · {fmt(s.sessMessages, { n: item.messageCount })}
            </span>
          </button>
          <button className="sess-resume-btn" onClick={() => resume(item.id)}>{s.sessResume}</button>
        </div>
      ))}
    </div>
  )
}

export function MemoryPage(
  { summary, s, workspace }: { summary: HarnessSummary; s: DashStrings; workspace: string },
): JSX.Element {
  const [sub, setSub] = useState<Sub>('memory')
  return (
    <div className="dash-page mem-page">
      <div className="mem-subtabs">
        <button className={`mem-subtab${sub === 'memory' ? ' is-active' : ''}`} onClick={() => setSub('memory')}>
          {s.memSubMemory}
        </button>
        <button className={`mem-subtab${sub === 'history' ? ' is-active' : ''}`} onClick={() => setSub('history')}>
          {s.memSubHistory}
        </button>
      </div>
      {sub === 'memory'
        ? <MemorySub summary={summary} s={s} />
        : <HistorySub workspace={workspace} s={s} />}
    </div>
  )
}
