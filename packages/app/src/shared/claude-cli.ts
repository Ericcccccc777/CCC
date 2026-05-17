export interface ClaudeCliStatus {
  readonly installed: boolean
  readonly loggedIn: boolean
  readonly account: string | null
  readonly version: string | null
}
