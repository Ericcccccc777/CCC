import { useState } from 'react'
import type { DashStrings } from './strings'

// "Update CCC-MAGI" control for the console Overview. The update is constrained
// by CCC-MAGI's installer: a safe (flag-less) re-run refreshes harness files but
// REFUSES when the workspace has uncommitted changes (the common case, since a
// successful update itself leaves the new harness files uncommitted). The only
// override is --force, which also resets edited load-bearing files (with
// backups). Rather than surface a cryptic "exit code 1", this walks the user
// through it: try safe → if refused, explain why + offer Force (consequence
// spelled out) + tip to commit first.
type UpdateStatus = 'idle' | 'busy' | 'uptodate' | 'updated' | 'dirty' | 'error'

export function MagiUpdatePanel({ workspace, s }: { workspace: string; s: DashStrings }): JSX.Element {
  const [status,   setStatus]   = useState<UpdateStatus>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const run = async (force: boolean): Promise<void> => {
    setStatus('busy')
    setErrorMsg('')
    try {
      const res = await window.ccc?.magiUpdate(workspace, force)
      if (!res?.ok) {
        if (res?.needsForce) { setStatus('dirty'); return }
        setErrorMsg(res?.error ?? 'update failed')
        setStatus('error')
        return
      }
      setStatus(res.noChanges ? 'uptodate' : 'updated')
    } catch (e) {
      setErrorMsg((e as Error).message)
      setStatus('error')
    }
  }

  const busy = status === 'busy'

  return (
    <section className="dash-update">
      <div className="dash-update-head">
        <span className="dash-update-title">{s.updateTitle}</span>
        <button
          className="dash-update-btn"
          disabled={busy}
          onClick={() => void run(false)}
        >
          {busy
            ? <><span className="magi-spinner" aria-hidden="true" />{s.updateChecking}</>
            : s.updateMagi}
        </button>
      </div>

      {status === 'uptodate' && <div className="dash-update-msg is-ok">✓ {s.updateUpToDate}</div>}
      {status === 'updated'  && <div className="dash-update-msg is-ok">✓ {s.updateDone}</div>}

      {status === 'error' && (
        <div className="dash-update-msg is-err">
          <strong>{s.updateError}:</strong> {errorMsg}{' '}
          <button className="dash-update-link" onClick={() => void run(false)}>{s.updateRetry}</button>
        </div>
      )}

      {status === 'dirty' && (
        <div className="dash-update-dirty">
          <div className="dash-update-dirty-title">⚠ {s.updateDirtyTitle}</div>
          <div className="dash-update-dirty-body">{s.updateDirtyBody}</div>
          <button
            className="dash-update-btn is-force"
            disabled={busy}
            onClick={() => void run(true)}
          >
            {s.updateForce}
          </button>
          <div className="dash-update-hint">{s.updateForceHint}</div>
          <div className="dash-update-hint">{s.updateCommitTip}</div>
        </div>
      )}
    </section>
  )
}
