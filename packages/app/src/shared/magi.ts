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
}

// Streamed line of stdout/stderr from a backend install, pushed to the panel.
export interface MagiProgress {
  kind: 'env' | 'magi'
  id?:  MagiEnvId
  line: string
}
