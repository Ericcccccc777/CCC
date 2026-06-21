// CCC-MAGI — minimal shell.
//
// The full Harness Wizard UI (mode select, beginner/pro forms, coding-rule
// editor, CLAUDE.md conflict modal) was stripped back to this stub so the
// feature can be rebuilt step by step. The previous implementation lives in
// git history; the main-process generator (HarnessManager) and its IPC are
// left intact for the gradual restore.

interface HarnessWizardProps {
  workspace: string
}

export function HarnessWizard(_props: HarnessWizardProps): JSX.Element {
  return (
    <div className="hw-window">
      <div className="hw-titlebar">
        <div className="hw-titlebar-drag">
          <span className="hw-titlebar-title">CCC-MAGI</span>
        </div>
        <button
          className="hw-titlebar-close"
          aria-label="Close"
          onClick={() => window.ccc?.closeHarnessWindow()}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
