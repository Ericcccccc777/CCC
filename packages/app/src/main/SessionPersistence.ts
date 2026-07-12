import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import type { SessionMode, SessionOrigin, SessionRecoveryCapability } from '../shared/session-state'

export interface PersistedSession {
  id:               number
  workspace:        string
  name:             string
  modelId:          string
  // Last real statusLine model display name (e.g. "Opus 4.8"), so a session
  // restored after a full app restart shows its true model without waiting
  // for Claude Code to emit a fresh statusLine. See SessionRestored.model.
  model?:           string
  innerPid:         number
  pidFile:          string
  statuslineScript: string
  mode:             SessionMode
  origin:           SessionOrigin
  capability:       SessionRecoveryCapability
  apiProviderId?:   string
  apiModelId?:      string
  codexModelId?:    string
  startedAt?:       number
  terminalTty?:     string
  skipPermissions?: boolean
}

export class SessionPersistence {
  private readonly filePath: string

  constructor() {
    this.filePath = join(app.getPath('userData'), 'ccc-sessions.json')
  }

  save(sessions: PersistedSession[]): void {
    try {
      writeFileSync(this.filePath, JSON.stringify(sessions, null, 2), 'utf8')
    } catch { /* non-fatal */ }
  }

  load(): PersistedSession[] | null {
    if (!existsSync(this.filePath)) return null
    try {
      const data = JSON.parse(readFileSync(this.filePath, 'utf8')) as unknown
      if (!Array.isArray(data)) return null
      return data as PersistedSession[]
    } catch { return null }
  }

  clear(): void {
    try { unlinkSync(this.filePath) } catch { /* non-fatal */ }
  }
}
