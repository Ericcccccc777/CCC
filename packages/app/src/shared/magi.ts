// Shared types for the CCC-MAGI install flow surfaced in the CCC-MAGI panel.
// CCC-MAGI (https://github.com/Ericcccccc777/CCC-MAGI) installs into a project
// via `npx create-ccc-magi@latest` and needs git / node>=18 / jq present first.

export type MagiEnvId = 'git' | 'node' | 'jq'

export interface MagiEnvItem {
  id:          MagiEnvId
  label:       string
  ok:          boolean
  detail:      string   // version string when present, else a short reason
  installable: boolean  // whether CCC can attempt a backend install (brew)
}

export interface MagiEnvReport {
  items: MagiEnvItem[]
  allOk: boolean
}

export interface MagiInstalledResult {
  installed: boolean
}

export interface MagiOpResult {
  ok:     boolean
  error?: string
  // Set when an UPDATE failed only because CCC-MAGI's git-clean guard refused:
  // the workspace has uncommitted changes (the norm right after install, when
  // the new harness files aren't committed yet) or isn't a git repo. The panel
  // uses this to offer a "Force update" fallback (re-runs with --force, which
  // overwrites constitution.md / CLAUDE.md / AGENTS.md with the latest
  // templates — the installer backs up the user's versions first).
  needsForce?: boolean
  // Set on a SUCCESSFUL update when the installer reported 0 new + 0 updated
  // files (parsed from its "Installed. (N new, M updated, …)" summary) — i.e.
  // the workspace was already current. The panel shows an "already up to date"
  // message instead of "updated".
  noChanges?: boolean
}

// Streamed line of stdout/stderr from a backend install, pushed to the panel.
export interface MagiProgress {
  kind: 'env' | 'magi'
  id?:  MagiEnvId
  line: string
}
