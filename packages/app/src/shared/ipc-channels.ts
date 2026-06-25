export const IPC = {
  SET_IGNORE_MOUSE:        'set-ignore-mouse-events',
  OPEN_FOLDER_DIALOG:      'open-folder-dialog',
  LAUNCH_SESSION:          'launch-session',
  KILL_SESSION:            'kill-session',
  SESSION_CLOSED:          'session-closed',
  SESSION_STATE_CHANGED:   'session-state-changed',
  SESSION_METRICS_UPDATED: 'session-metrics-updated',
  HOOK_DECISION:           'hook-decision',
  ALLOW_TOOL_ALWAYS:       'ccc:allow-tool-always',
  SWITCH_SESSION_MODEL:    'ccc:switch-session-model',
  SWITCH_SESSION_EFFORT:   'ccc:switch-session-effort',
  INJECT_CONSOLE_TEXT:     'ccc:inject-console-text',
  SESSION_FOCUS:           'ccc:session-focus',
  SESSION_RESTORED:        'ccc:session-restored',
  SESSION_LIST_KNOWN:      'ccc:session-list-known',
  MAIN_SET_HEIGHT:         'ccc:main-set-height',
  // Hide/show overlay modes (default top-center pill, top-edge auto-hide
  // strip, top-left shrunk circle). Renderer drives the state machine and
  // tells main where to put the BrowserWindow + how big to make it. Drag
  // mode also goes through this channel — bypasses MAIN_SET_HEIGHT's
  // min-clamp so the strip can be 6px tall.
  OVERLAY_SET_BOUNDS:      'ccc:overlay-set-bounds',
  OVERLAY_GET_WORK_AREA:   'ccc:overlay-get-work-area',
  // Harness
  HARNESS_CHECK:           'harness:check',
  HARNESS_LOAD:            'harness:load',
  HARNESS_SAVE:            'harness:save',
  HARNESS_GENERATE:        'harness:generate',
  HARNESS_ANSWER:          'harness:answer',
  HARNESS_QUESTION:        'harness:question',
  HARNESS_COMPLETE:        'harness:complete',
  HARNESS_ERROR:           'harness:error',
  HARNESS_EXPAND_WINDOW:   'harness:expand-window',
  HARNESS_COLLAPSE_WINDOW: 'harness:collapse-window',
  HARNESS_OPEN_WINDOW:     'harness:open-window',
  HARNESS_CLOSE_WINDOW:    'harness:close-window',
  // Harness visualization dashboard (read-only project-state viewer)
  DASHBOARD_OPEN_WINDOW:   'dashboard:open-window',
  HARNESS_READ:            'harness:read',
  HARNESS_SUMMARY:         'harness:summary',
  HARNESS_LIST_SESSIONS:   'harness:list-sessions',
  HARNESS_READ_SESSION:    'harness:read-session',
  HARNESS_STATS:           'harness:stats',
  RESUME_SESSION:          'ccc:resume-session',
  // CCC-MAGI install flow (panel shown by the harness window)
  MAGI_CHECK_INSTALLED:    'magi:check-installed',
  MAGI_CHECK_ENV:          'magi:check-env',
  MAGI_INSTALL_ENV:        'magi:install-env',
  MAGI_INSTALL:            'magi:install',
  MAGI_UPDATE:             'magi:update',
  MAGI_PROGRESS:           'magi:progress',
  // Remote mirror
  MARK_SESSION_REMOTE:     'remote:mark-session',
  // Platform capabilities (renderer probes for accessibility-permission UI etc.)
  PLATFORM_GET_CAPABILITIES:        'platform:get-capabilities',
  OPEN_ACCESSIBILITY_SETTINGS:      'platform:open-accessibility-settings',
  // API providers (DeepSeek + future Anthropic-compatible endpoints)
  API_PROVIDER_LIST:                'api-provider:list',
  API_PROVIDER_SAVE:                'api-provider:save',
  API_PROVIDER_SET_MODEL:           'api-provider:set-model',
  API_PROVIDER_REMOVE:              'api-provider:remove',
  API_PROVIDER_TEST:                'api-provider:test',
  // Session-level API mode (Chunk C — Restart in place)
  API_SESSION_RESTART:              'api-session:restart',
  API_SESSION_SWITCHED:             'api-session:switched',
  // Session-level API mode (Chunk D — New session, no restart)
  API_SESSION_LAUNCH_NEW:           'api-session:launch-new',
  // Chunk E — runtime usage / balance broadcasts (main → renderer)
  API_BALANCE_UPDATE:               'api-session:balance-update',
  API_USAGE_UPDATE:                 'api-session:usage-update',
  // Claude Code CLI — user-managed binary detected from Settings → CLI.
  // *_DETECT returns the cached snapshot (60 s TTL) so the pill expand path
  // never spawns a subprocess on the click. *_REDETECT bypasses the cache
  // for Settings → "Check Again". See STABILITY_RULES.md §2.1.
  CLAUDE_CLI_DETECT:                'claude-cli:detect',
  CLAUDE_CLI_REDETECT:              'claude-cli:redetect',
  // Codex CLI — standalone session engine (spawns `codex` binary, not `claude`)
  CODEX_CLI_DETECT:                 'codex-cli:detect',
  CODEX_CLI_REDETECT:               'codex-cli:redetect',
  CODEX_CLI_LAUNCH:                 'codex-cli:launch',
  CODEX_CLI_SELECT_MODEL:           'codex-cli:select-model',
  // App lifecycle — user-initiated full quit from Settings → Quit button.
  // Full teardown happens via win.on('closed') → cleanup() so the renderer
  // only fires-and-forgets here.
  QUIT_APP:                         'app:quit',
} as const
