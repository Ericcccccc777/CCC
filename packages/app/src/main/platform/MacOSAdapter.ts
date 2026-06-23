import { spawn, execFileSync, execSync } from 'child_process'
import { writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  type FocusSessionOptions,
  type HookEventName,
  type InjectCodexModelSelectionOptions,
  type InjectKeystrokesOptions,
  type KillSessionOptions,
  type LaunchCodexSessionOptions,
  type LaunchHeadlessOptions,
  type LaunchInteractiveOptions,
  type LaunchResult,
  type PlatformAdapter,
  type PlatformCapabilities,
  type RespawnMonitorOptions,
  type RespawnResult,
} from './PlatformAdapter'

// Phase C1 (hook commands) and C2 (lifecycle) implemented here.
// Phase C3 (`injectKeystrokes` via AppleScript + Accessibility permission)
// still throws NotImplementedYetError.
//
// Process model — see DECISION_LOG.md 2026-05-02-2.
//   1. `ccc-inner-${id}.sh` writes its own `$$` to `pidFile`, then
//      `exec claude`. Because `exec` reuses the shell's PID, the value in
//      `pidFile` is the live `claude` PID — same contract Windows gets via
//      `Start-Process -PassThru`.
//   2. `ccc-watcher-${id}.sh` polls for `pidFile` (≤ 5s grace) then
//      `while kill -0 $PID; do sleep 1; done`. The watcher is what we hand
//      back as `LaunchResult.proc`, so its exit drives SessionManager's
//      `result.proc.on('close', ...)` like Windows' outer-PS `WaitForExit`.
//   3. The visible surface is a fresh Terminal.app window, opened via
//      `osascript ... do script` — mirrors Windows' visible PowerShell window.

// Inline node script body shared by all three hook events (Stop / PreToolUse
// / Notification). Dispatch is keyed on env-var CCC_EV; sessionId comes from
// CCC_SID, port from CCC_PORT. Env vars (not argv) because Node `-e` mode
// shifts argv index across versions — Node 24 puts the first user arg at
// argv[1], earlier majors used argv[1]='[eval]' and shifted user args to
// argv[2+]. Reading argv[2/3/4] silently misread the slots and exited 0,
// hiding the failure (see DECISION_LOG 2026-05-05-1).
//
// Uses ONLY double-quoted JS strings so the outer shell wrap can use single
// quotes without escape-hell. The trailing `# ccc-hook` shell comment is
// what ClaudeSettingsManager.inject() looks for to detect / replace stale
// entries (matches CCC_TAG = "ccc-hook").
const HOOK_SCRIPT_BODY =
  'const http=require("http");' +
  'const sid=parseInt(process.env.CCC_SID,10);' +
  'const port=parseInt(process.env.CCC_PORT,10);' +
  'const ev=process.env.CCC_EV;' +
  'let raw="";' +
  'process.stdin.setEncoding("utf8");' +
  'process.stdin.on("data",c=>raw+=c);' +
  'process.stdin.on("end",()=>{' +
    'let d={};try{d=JSON.parse(raw)}catch(e){}' +
    'let p;' +
    'if(ev==="stop")p={sessionId:sid,event:"stop"};' +
    'else if(ev==="pretooluse")p={sessionId:sid,event:"pretooluse",tool:d.tool_name||"unknown",toolInput:d.tool_input};' +
    'else p={sessionId:sid,event:"notification",message:d.message||""};' +
    'const b=JSON.stringify(p);' +
    'const t=ev==="pretooluse"?60000:3000;' +
    // For PreToolUse, Claude Code does NOT treat the exit code alone as a
    // permission decision in current versions — it requires an explicit
    // hookSpecificOutput.permissionDecision JSON on stdout. Without that,
    // exit 0 reads as "no objection" (Claude prompts the user in terminal
    // anyway) and exit 1 reads as "hook error" (Claude proceeds with the
    // tool, ignoring the user's Deny click). We always exit 0 and put the
    // decision in stdout so the popup's Yes/No/Always buttons actually
    // gate the tool. See DECISION_LOG 2026-05-17-5.
    'const req=http.request({hostname:"127.0.0.1",port:port,path:"/hook",method:"POST",' +
      'headers:{"Content-Type":"application/json","Content-Length":Buffer.byteLength(b)},timeout:t},r=>{' +
      'let s="";r.on("data",c=>s+=c);' +
      'r.on("end",()=>{' +
        'if(ev==="pretooluse"){' +
          'let ec=0;try{ec=JSON.parse(s).exitCode||0}catch(e){}' +
          'const dec=ec===0?"allow":"deny";' +
          'const out=JSON.stringify({hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:dec}});' +
          'process.stdout.write(out,()=>process.exit(0))' +
        '}' +
        'else process.exit(0)' +
      '})' +
    '});' +
    'req.on("error",()=>process.exit(0));' +
    'req.on("timeout",()=>process.exit(0));' +
    'req.write(b);req.end()' +
  '})'

// POSIX single-quote escaping: `'` becomes `'\''` (close, escaped, reopen).
const shq = (s: string): string => s.replace(/'/g, "'\\''")
const asq = (s: string): string => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

interface MacOSCliProcessRecord {
  readonly pid:     number
  readonly ppid:    number
  readonly tty?:    string
  readonly command: string
}

export interface MacOSCliProcessCandidate {
  readonly pid:            number
  readonly parentPid?:     number
  readonly sessionId?:     number
  readonly terminalTty?:   string
  readonly engine:         'claude' | 'codex'
  readonly command:        string
  readonly workspace?:     string
  readonly modelId?:       string
  readonly alreadyManaged: boolean
  readonly confidence:     'high' | 'medium'
  readonly origin:         'ccc-managed' | 'external'
  readonly capability:     'full' | 'best-effort' | 'basic'
  readonly reason?:        string
}

export interface AppleScriptKeyStep {
  readonly key: string
  readonly delaySeconds: number
}

const splitCommand = (command: string): readonly string[] => {
  const matches = command.match(/"([^"\\]*(?:\\.[^"\\]*)*)"|'([^']*)'|[^\s]+/g) ?? []
  return matches.map(token => {
    if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
      return token.slice(1, -1)
    }
    return token
  })
}

const basenameOfToken = (token: string): string => {
  const parts = token.split('/')
  return parts[parts.length - 1] ?? token
}

const extractEnvValue = (command: string, key: string): string | undefined => {
  const match = command.match(new RegExp(`(?:^|\\s)${key}=(?:'([^']*)'|"([^"]*)"|(\\S+))`))
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined
}

const normalizeTty = (tty: string): string | null => {
  const trimmed = tty.trim()
  if (!trimmed || trimmed === '??') return null
  return trimmed.replace(/^\/dev\//, '')
}

const isLikelyTtyColumn = (token: string): boolean => {
  const normalized = normalizeTty(token)
  return token === '??' || normalized === 'console' || normalized?.startsWith('tty') === true
}

const inferEngine = (command: string): 'claude' | 'codex' | null => {
  const markedEngine = extractEnvValue(command, 'CCC_ENGINE')
  if (markedEngine === 'claude' || markedEngine === 'codex') return markedEngine

  // Strip CCC's own .app path from the lowercased ps line before scanning
  // for `claude` / `codex` tokens — otherwise the host overlay binary would
  // match its own name and shadow the real CLI engine detection. Both the
  // current (`CCC.app`) and legacy (`Claude Code Controller.app`) bundle
  // shapes are stripped so installs upgraded across the rename keep working.
  const withoutCcc = command.toLowerCase()
    .replace(/\/ccc\.app\/[^ ]*/g, '')
    .replace(/claude-code-controller/g, '')
    .replace(/claude code controller/g, '')
  const tokens = splitCommand(withoutCcc).map(token => basenameOfToken(token))
  if (tokens.some(token => token === 'codex' || token === 'codex.js') || withoutCcc.includes('@openai/codex')) {
    return 'codex'
  }
  if (
    tokens.some(token => token === 'claude' || token === 'claude.js') ||
    withoutCcc.includes('@anthropic-ai/claude-code') ||
    withoutCcc.includes('/claude-code/')
  ) {
    return 'claude'
  }
  return null
}

const inferCccSessionId = (command: string): number | undefined => {
  const raw = extractEnvValue(command, 'CCC_SESSION_ID')
  const sessionId = raw ? Number(raw) : NaN
  return Number.isInteger(sessionId) && sessionId > 0 ? sessionId : undefined
}

const isCccMarked = (command: string): boolean =>
  inferCccSessionId(command) !== undefined ||
  extractEnvValue(command, 'CCC_OWNER') === 'Claude-Code-Controller'

const extractFlag = (command: string, names: readonly string[]): string | undefined => {
  const tokens = splitCommand(command)
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    for (const name of names) {
      if (token === name) return tokens[i + 1]
      if (token.startsWith(`${name}=`)) return token.slice(name.length + 1)
    }
  }
  return undefined
}

const parseProcessRecords = (raw: string): readonly MacOSCliProcessRecord[] =>
  raw.split(/\r?\n/)
    .map(line => line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)(?:\s+(.+?))?\s*$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map(match => {
      const third = match[3] ?? ''
      const rest = match[4]
      const hasTtyColumn = isLikelyTtyColumn(third) && rest !== undefined
      const tty = hasTtyColumn ? normalizeTty(third) : null
      return {
        pid:     Number(match[1]),
        ppid:    Number(match[2]),
        ...(tty && { tty }),
        command: hasTtyColumn ? (rest ?? '') : [third, rest].filter(Boolean).join(' '),
      }
    })
    .filter(record => Number.isInteger(record.pid) && record.pid > 0)

export function parseMacOSCliProcesses(
  raw: string,
  managedPids: readonly number[],
  cwdByPid: ReadonlyMap<number, string> = new Map(),
  terminalTtys?: ReadonlySet<string> | readonly string[],
): readonly MacOSCliProcessCandidate[] {
  const managed = new Set(managedPids)
  const allowedTtys = terminalTtys
    ? new Set(Array.from(terminalTtys).map(tty => normalizeTty(tty)).filter((tty): tty is string => tty !== null))
    : null
  return parseProcessRecords(raw).reduce<MacOSCliProcessCandidate[]>((acc, record) => {
    if (allowedTtys && (!record.tty || !allowedTtys.has(record.tty))) return acc
    const engine = inferEngine(record.command)
    if (!engine) return acc

    const sessionId = inferCccSessionId(record.command)
    const alreadyManaged = managed.has(record.pid) || isCccMarked(record.command)
    const workspace = extractFlag(record.command, ['--cwd', '--cd', '-C']) ?? cwdByPid.get(record.pid)
    const modelId = extractFlag(record.command, ['--model', '-m'])
    acc.push({
      pid: record.pid,
      ...(Number.isInteger(record.ppid) && record.ppid > 0 && { parentPid: record.ppid }),
      ...(sessionId && { sessionId }),
      ...(record.tty && { terminalTty: `/dev/${record.tty}` }),
      engine,
      command: record.command,
      ...(workspace && { workspace }),
      ...(modelId && { modelId }),
      alreadyManaged,
      confidence: workspace ? 'high' : 'medium',
      origin: alreadyManaged ? 'ccc-managed' : 'external',
      capability: alreadyManaged ? (engine === 'claude' ? 'full' : 'basic') : (engine === 'claude' ? 'best-effort' : 'basic'),
      reason: alreadyManaged
        ? 'Already managed by CCC'
        : (engine === 'claude' ? 'External Claude process' : 'External Codex process'),
    })
    return acc
  }, [])
}

// Builds `export KEY='value'` lines for a record of env vars, with POSIX
// single-quote escaping. Exported for tests; the real call path stays
// inline in launchInteractive.
export function buildShellEnvExports(env: Readonly<Record<string, string>> | undefined): string[] {
  return Object.entries(env ?? {}).map(([k, v]) => `export ${k}='${shq(v)}'`)
}

// AppleScript that finds the Terminal tab whose `tty` matches the given
// path (e.g. `/dev/ttys003`), brings it to the foreground, then asks
// System Events to send Cmd+V + Return. Caller is expected to have
// written the text into the clipboard via `pbcopy` first.
//
// Why tty and not `custom title`: claude's TUI emits OSC 0 escape
// sequences shortly after launch (`\033]0;✳ Claude Code\007`) which
// Terminal.app uses to overwrite the tab's custom title. We observed
// in real testing that the title we set in launchInteractive is gone
// by the time the user clicks "switch model" — the iteration finds no
// match and the keystroke never fires. The tab's `tty` property is
// read-only and stable for the lifetime of the tab, so the inner
// process can't touch it. We resolve the tty from the claude pid via
// `ps -p <pid> -o tty=` (see MacOSAdapter.injectKeystrokes) before
// invoking this script.
//
// If no tab matches the tty (rare — only if the tab was destroyed
// between the user clicking and the script running) the script logs
// the discrepancy and returns early. No characters are typed anywhere,
// preserving the invariant that only CCC-managed sessions can receive
// CCC-originated keystrokes.
export function buildInjectKeystrokesAppleScript(
  tty: string,
  afterSubmitSteps: readonly AppleScriptKeyStep[] = [],
): readonly string[] {
  const extraSteps = afterSubmitSteps.flatMap(step => [
    `  delay ${step.delaySeconds}`,
    `  keystroke "${asq(step.key)}"`,
  ])

  return [
    'tell application "Terminal"',
    '  set targetTab to missing value',
    '  set targetWin to missing value',
    '  set seenTtys to ""',
    '  repeat with w in (every window)',
    '    try',
    '      repeat with t in (every tab of w)',
    '        set tabTty to (tty of t)',
    '        set seenTtys to seenTtys & "<" & tabTty & ">"',
    `        if tabTty is "${tty}" then`,
    '          set targetTab to t',
    '          set targetWin to w',
    '          exit repeat',
    '        end if',
    '      end repeat',
    '    end try',
    '    if targetTab is not missing value then exit repeat',
    '  end repeat',
    '  if targetTab is missing value then',
    `    log "ccc-inject: NO_MATCH for tty ${tty}; ttys=" & seenTtys`,
    '    return',
    '  end if',
    `  log "ccc-inject: MATCHED tty ${tty}"`,
    '  try',
    '    set selected of targetTab to true',
    '  end try',
    '  try',
    '    set index of targetWin to 1',
    '  end try',
    '  activate',
    'end tell',
    // Poll for Terminal to actually become the frontmost app before
    // sending Cmd+V. Without this, the FIRST click of model-switch when
    // the user is on a different app/Space races the activate transition
    // — keystroke fires while the previous app still has focus, Cmd+V
    // lands nowhere, and the user has to click again. Subsequent clicks
    // work because Terminal is already warm. ~1.5s cap; usually returns
    // in <100ms.
    'set frontReady to false',
    'repeat 30 times',
    '  try',
    '    tell application "System Events"',
    '      set frontReady to frontmost of application process "Terminal"',
    '    end tell',
    '  end try',
    '  if frontReady then exit repeat',
    '  delay 0.05',
    'end repeat',
    'log "ccc-inject: frontmost=" & (frontReady as text)',
    'delay 0.1',
    'tell application "System Events"',
    '  keystroke "v" using {command down}',
    '  keystroke return',
    ...extraSteps,
    'end tell',
    'log "ccc-inject: keystroke done"',
  ]
}

// AppleScript that brings the Terminal window/tab whose `tty` matches
// the given path to the foreground. Used by `focusSession` when the
// user clicks a SessionRow in CCC's expanded panel.
//
// tty matching for the same reason as injectKeystrokes: claude's OSC 0
// overwrites `custom title`, so we can't rely on title-based lookup.
export function buildFocusWindowAppleScript(tty: string): readonly string[] {
  return [
    'tell application "Terminal"',
    '  set targetWin to missing value',
    '  set targetTab to missing value',
    '  repeat with w in (every window)',
    '    try',
    '      repeat with t in (every tab of w)',
    `        if (tty of t) is "${tty}" then`,
    '          set targetWin to w',
    '          set targetTab to t',
    '          exit repeat',
    '        end if',
    '      end repeat',
    '    end try',
    '    if targetWin is not missing value then exit repeat',
    '  end repeat',
    '  if targetWin is missing value then return',
    '  activate',
    '  try',
    '    set index of targetWin to 1',
    '  end try',
    '  try',
    '    set selected of targetTab to true',
    '  end try',
    'end tell',
  ]
}

export class MacOSAdapter implements PlatformAdapter {
  private readonly tmp: string

  constructor() {
    this.tmp = tmpdir()
  }

  launchInteractive(opts: LaunchInteractiveOptions): LaunchResult {
    const { workspace, modelId, sessionId, port, env, skipPermissions } = opts

    const inner   = join(this.tmp, `ccc-inner-${sessionId}.sh`)
    const watcher = join(this.tmp, `ccc-watcher-${sessionId}.sh`)
    const pidFile = join(this.tmp, `ccc-pid-${sessionId}.txt`)

    const modelArg = modelId ? ` --model ${modelId}` : ''
    const permArg  = skipPermissions ? ' --dangerously-skip-permissions' : ''

    const extraEnvLines = buildShellEnvExports(env)

    writeFileSync(inner, [
      '#!/bin/sh',
      `cd '${shq(workspace)}' || exit 1`,
      `export CCC_OWNER='Claude-Code-Controller'`,
      `export CCC_ENGINE='claude'`,
      `export CCC_PORT='${port}'`,
      `export CCC_SESSION_ID='${sessionId}'`,
      ...extraEnvLines,
      `echo $$ > '${shq(pidFile)}'`,
      `exec claude${modelArg}${permArg}`,
      '',
    ].join('\n'), { mode: 0o755 })

    writeFileSync(watcher, [
      '#!/bin/sh',
      'PID=""',
      'i=0',
      'while [ $i -lt 50 ]; do',
      `  if [ -f '${shq(pidFile)}' ]; then PID=$(cat '${shq(pidFile)}' 2>/dev/null); break; fi`,
      '  i=$((i+1))',
      '  sleep 0.1',
      'done',
      '[ -n "$PID" ] && while kill -0 "$PID" 2>/dev/null; do sleep 1; done',
      '',
    ].join('\n'), { mode: 0o755 })

    // Tell Terminal.app to open a new window and run inner.sh inside it.
    //
    // `; exit 0` (not `; exit`) — `exit` without a status forwards the previous
    // command's exit code, so SIGTERM-killed claude (status 143) propagates and
    // Terminal.app's default "close if shell exited cleanly" preference keeps
    // the window open. Forcing 0 lets natural exits (claude /quit, claude
    // crashes, etc.) close the window without needing AppleScript.
    //
    // The custom title `CCC <id>` is the handle killSession() uses to find and
    // close *this specific window* via AppleScript when the user clicks
    // close-session in the renderer — Terminal.app windows are not in our
    // process tree, so SIGTERM alone leaves the window dangling regardless of
    // exit status if the user has changed the Terminal preference.
    spawn('osascript', [
      '-e', 'tell application "Terminal"',
      '-e', '  activate',
      '-e', `  set t to do script "sh '${shq(inner)}'; exit 0"`,
      '-e', `  set custom title of t to "CCC ${sessionId}"`,
      '-e', 'end tell',
    ], { stdio: 'ignore' })

    const proc = spawn('sh', [watcher], { stdio: 'ignore' })

    return { proc, pidFile, cleanupPaths: [inner, watcher, pidFile] }
  }

  launchHeadless(opts: LaunchHeadlessOptions): LaunchResult {
    const { workspace, prompt, sessionId, port } = opts

    const inner      = join(this.tmp, `ccc-headless-${sessionId}.sh`)
    const promptFile = join(this.tmp, `ccc-headless-prompt-${sessionId}.txt`)

    writeFileSync(promptFile, prompt, 'utf8')

    writeFileSync(inner, [
      '#!/bin/sh',
      `cd '${shq(workspace)}' || exit 1`,
      `export CCC_OWNER='Claude-Code-Controller'`,
      `export CCC_ENGINE='claude'`,
      `export CCC_PORT='${port}'`,
      `export CCC_SESSION_ID='${sessionId}'`,
      // The captured `$(cat …)` is treated as a literal in the surrounding
      // double quotes — sh does NOT re-expand $VAR or backticks inside it.
      // Safe for prompts containing shell metacharacters.
      `exec claude -p "$(cat '${shq(promptFile)}')"`,
      '',
    ].join('\n'), { mode: 0o755 })

    const proc = spawn('sh', [inner], { stdio: 'ignore' })

    return { proc, pidFile: '', cleanupPaths: [inner, promptFile] }
  }

  launchCodexSession(opts: LaunchCodexSessionOptions): LaunchResult {
    const { workspace, modelId, sessionId, skipPermissions } = opts

    const inner   = join(this.tmp, `ccc-codex-inner-${sessionId}.sh`)
    const watcher = join(this.tmp, `ccc-codex-watcher-${sessionId}.sh`)
    const pidFile = join(this.tmp, `ccc-codex-pid-${sessionId}.txt`)

    const modelArg = modelId ? ` --model '${shq(modelId)}'` : ''
    const permArg  = skipPermissions ? ' --dangerously-bypass-approvals-and-sandbox' : ''

    writeFileSync(inner, [
      '#!/bin/sh',
      `cd '${shq(workspace)}' || exit 1`,
      `export CCC_OWNER='Claude-Code-Controller'`,
      `export CCC_ENGINE='codex'`,
      `export CCC_SESSION_ID='${sessionId}'`,
      `echo $$ > '${shq(pidFile)}'`,
      `exec codex${modelArg}${permArg}`,
      '',
    ].join('\n'), { mode: 0o755 })

    writeFileSync(watcher, [
      '#!/bin/sh',
      'PID=""',
      'i=0',
      'while [ $i -lt 50 ]; do',
      `  if [ -f '${shq(pidFile)}' ]; then PID=$(cat '${shq(pidFile)}' 2>/dev/null); break; fi`,
      '  i=$((i+1))',
      '  sleep 0.1',
      'done',
      '[ -n "$PID" ] && while kill -0 "$PID" 2>/dev/null; do sleep 1; done',
      '',
    ].join('\n'), { mode: 0o755 })

    spawn('osascript', [
      '-e', 'tell application "Terminal"',
      '-e', '  activate',
      '-e', `  set t to do script "sh '${shq(inner)}'; exit 0"`,
      '-e', `  set custom title of t to "CCC ${sessionId}"`,
      '-e', 'end tell',
    ], { stdio: 'ignore' })

    const proc = spawn('sh', [watcher], { stdio: 'ignore' })

    return { proc, pidFile, cleanupPaths: [inner, watcher, pidFile] }
  }

  respawnMonitor(opts: RespawnMonitorOptions): RespawnResult {
    const { sessionId, innerPid, pidFile } = opts

    const monitor = join(this.tmp, `ccc-monitor-${sessionId}-${Date.now()}.sh`)

    writeFileSync(monitor, [
      '#!/bin/sh',
      `while kill -0 ${innerPid} 2>/dev/null; do sleep 1; done`,
      `rm -f '${shq(monitor)}' 2>/dev/null`,
      '',
    ].join('\n'), { mode: 0o755 })

    const proc = spawn('sh', [monitor], { stdio: 'ignore' })

    return { proc, cleanupPaths: [monitor] }
  }

  killSession(opts: KillSessionOptions): void {
    const { proc, pidFile, sessionId } = opts
    try {
      const pid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10)
      if (pid && !isNaN(pid)) process.kill(pid, 'SIGTERM')
    } catch { /* PID file not ready or process already gone */ }
    if (proc.pid !== undefined) {
      try { process.kill(proc.pid, 'SIGTERM') } catch { /* already exited */ }
    }

    // Terminal.app is not in our process tree — SIGTERM on the inner shell
    // doesn't take the visible window with it the way `taskkill /T` does on
    // Windows. Match the title we set in launchInteractive() and close that
    // window. `try` swallows AppleScript errors (window already closed, user
    // dragged tab elsewhere, Terminal not running).
    spawn('osascript', [
      '-e', 'tell application "Terminal"',
      '-e', '  repeat with w in (every window)',
      '-e', '    try',
      '-e', '      repeat with t in (every tab of w)',
      '-e', `        if (custom title of t) is "CCC ${sessionId}" then`,
      '-e', '          close w saving no',
      '-e', '          return',
      '-e', '        end if',
      '-e', '      end repeat',
      '-e', '    end try',
      '-e', '  end repeat',
      '-e', 'end tell',
    ], { stdio: 'ignore' })
  }

  isPidAlive(pid: number): boolean {
    try {
      execSync(`kill -0 ${pid}`, { stdio: 'pipe', timeout: 5000 })
      return true
    } catch { return false }
  }

  resolveSessionTty(opts: { readonly pidFile: string }): string | null {
    return this.resolveTty(opts.pidFile)
  }

  recoverSessionProcess(opts: {
    readonly sessionId: number
    readonly pidFile: string
    readonly engine: 'claude' | 'codex'
    readonly currentPid?: number
    readonly terminalTty?: string
  }): { readonly pid: number; readonly terminalTty?: string } | null {
    const currentPid = opts.currentPid ?? this.readPidFile(opts.pidFile)
    if (currentPid && this.isPidAlive(currentPid)) {
      const terminalTty = this.resolveTty(opts.pidFile) ?? opts.terminalTty
      return { pid: currentPid, ...(terminalTty && { terminalTty }) }
    }

    const marked = this.findCccMarkedProcess(opts.sessionId, opts.engine)
    if (marked) return marked

    const normalizedTty = opts.terminalTty ? normalizeTty(opts.terminalTty) : null
    if (!normalizedTty) return null
    try {
      const raw = this.readProcessTable(false)
      const candidates = parseMacOSCliProcesses(raw, [], new Map(), new Set([normalizedTty]))
        .filter(candidate => candidate.engine === opts.engine)
      const candidate = candidates[0]
      return candidate ? { pid: candidate.pid, terminalTty: normalizedTty } : null
    } catch {
      return null
    }
  }

  private findCccMarkedProcess(
    sessionId: number,
    engine: 'claude' | 'codex',
  ): { readonly pid: number; readonly terminalTty?: string } | null {
    try {
      const candidates = parseMacOSCliProcesses(this.readProcessTable(true), [])
        .filter(candidate =>
          candidate.sessionId === sessionId &&
          candidate.engine === engine &&
          candidate.origin === 'ccc-managed',
        )
      const candidate = candidates[0]
      return candidate
        ? { pid: candidate.pid, ...(candidate.terminalTty && { terminalTty: candidate.terminalTty }) }
        : null
    } catch {
      return null
    }
  }

  private readProcessTable(includeEnv: boolean): string {
    const baseArgs = ['-axo', 'pid=,ppid=,tty=,command=']
    if (!includeEnv) {
      return execFileSync('ps', baseArgs, {
        encoding: 'utf8',
        timeout:  5000,
      })
    }

    try {
      return execFileSync('ps', ['eww', ...baseArgs], {
        encoding: 'utf8',
        timeout:  5000,
      })
    } catch {
      return execFileSync('ps', baseArgs, {
        encoding: 'utf8',
        timeout:  5000,
      })
    }
  }

  private readPidFile(pidFile: string): number | null {
    try {
      const pid = Number(readFileSync(pidFile, 'utf8').trim())
      return Number.isInteger(pid) && pid > 0 ? pid : null
    } catch {
      return null
    }
  }

  // Phase C3: send `text` + Return to the frontmost Terminal tab via
  // AppleScript `keystroke`. Targets the *frontmost* Terminal window, not a
  // specific session — Windows can target by PID via WriteConsoleInput, but
  // Terminal.app doesn't expose tab PIDs to AppleScript, so a multi-session
  // user with two visible Terminal windows risks keystroke landing in the
  // wrong tab. Single-session is the common case; revisit if real users hit
  // the multi-window failure mode. `pidFile` is part of the interface
  // contract (Windows needs it) but unused on macOS.
  //
  // Silently no-ops without Accessibility permission. The renderer side
  // (Phase C4) is responsible for surfacing the missing permission to the
  // user before they hit this path.
  injectKeystrokes(opts: InjectKeystrokesOptions): void {
    this.injectViaClipboard(opts.pidFile, opts.sessionId, opts.text, [])
  }

  injectCodexModelSelection(opts: InjectCodexModelSelectionOptions): void {
    this.injectViaClipboard(opts.pidFile, opts.sessionId, '/model', [
      { key: String(opts.modelMenuIndex),  delaySeconds: 0.35 },
      { key: String(opts.effortMenuIndex), delaySeconds: 0.15 },
    ])
  }

  private injectViaClipboard(
    pidFile: string,
    sessionId: number,
    text: string,
    afterSubmitSteps: readonly AppleScriptKeyStep[],
  ): void {
    const tty = this.resolveTty(pidFile)
    if (!tty) {
      // eslint-disable-next-line no-console
      console.error(`[CCC injectKeystrokes sid=${sessionId}] no tty resolved from pid in ${pidFile}; skipping`)
      return
    }

    // Step 1: copy the full text to the clipboard. Cmd+V then pastes
    // atomically into the targeted tab — character-by-character
    // `keystroke` had problems with claude's TUI eating the space in
    // `/model sonnet` (autocomplete trigger).
    const pb = spawn('pbcopy', [], { stdio: ['pipe', 'ignore', 'ignore'] })
    pb.stdin?.write(text)
    pb.stdin?.end()
    pb.on('close', () => {
      // Step 2: AppleScript brings the tty-matching tab to the front,
      // then sends Cmd+V + Return via System Events. stderr is always
      // surfaced to the dev console so a "click does nothing" report
      // can be diagnosed without re-instrumenting.
      const lines = buildInjectKeystrokesAppleScript(tty, afterSubmitSteps)
      const args = lines.flatMap(l => ['-e', l])
      const sp = spawn('osascript', args, { stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      sp.stdout?.on('data', d => { stdout += d.toString() })
      sp.stderr?.on('data', d => { stderr += d.toString() })
      sp.on('close', code => {
        // eslint-disable-next-line no-console
        console.error(
          `[CCC injectKeystrokes sid=${sessionId} tty=${tty} text=${JSON.stringify(text)}] ` +
          `exit=${code} stderr=${stderr.trim()} stdout=${stdout.trim()}`,
        )
      })
    })
  }

  focusSession(opts: FocusSessionOptions): void {
    const tty = this.resolveTty(opts.pidFile)
    if (!tty) return
    const lines = buildFocusWindowAppleScript(tty)
    const args = lines.flatMap(l => ['-e', l])
    spawn('osascript', args, { stdio: 'ignore' })
  }

  // Look up the tty path (`/dev/ttysXXX`) for the inner claude process.
  // The pidFile contains claude's pid (because inner.sh `exec claude`
  // replaces the shell, keeping the same pid). `ps -p <pid> -o tty=`
  // returns the short tty name (`ttys003`); we prepend `/dev/` to match
  // what Terminal's `tty of <tab>` returns.
  private resolveTty(pidFile: string): string | null {
    try {
      const pid = readFileSync(pidFile, 'utf8').trim()
      if (!pid || isNaN(Number(pid))) return null
      const out = execSync(`ps -p ${pid} -o tty=`, { encoding: 'utf8', timeout: 2000 }).trim()
      if (!out || out === '?' || out === '??') return null
      return `/dev/${out}`
    } catch {
      return null
    }
  }

  buildHookCommands(sessionId: number, port: number): Record<HookEventName, string> {
    const wrap = (event: 'stop' | 'pretooluse' | 'notification'): string =>
      `CCC_SID=${sessionId} CCC_PORT=${port} CCC_EV=${event} node -e '${HOOK_SCRIPT_BODY}' # ccc-hook`
    return {
      Stop:         wrap('stop'),
      PreToolUse:   wrap('pretooluse'),
      Notification: wrap('notification'),
    }
  }

  // Unix paths already use forward slashes — no rewrite needed (the Windows
  // counterpart converts back-slashes to dodge Claude Code's parser quirk;
  // there's no equivalent on macOS).
  buildStatusLineCommand(scriptPath: string): string {
    return `node "${scriptPath}"`
  }

  // Standard Electron convention on macOS: app stays alive when all windows close.
  shouldQuitOnAllWindowsClosed(): boolean {
    return false
  }

  capabilities(): PlatformCapabilities {
    let hasPerm: boolean | undefined = undefined
    try {
      // Lazy require so this file is safe to import in vitest/jsdom (where
      // `require("electron")` returns a string path, not the module surface).
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const electron = require('electron') as typeof import('electron')
      const sp = electron.systemPreferences
      if (sp && typeof sp.isTrustedAccessibilityClient === 'function') {
        // `false` = probe only, do not surface the system prompt now —
        // CCC's renderer banner handles user education.
        hasPerm = sp.isTrustedAccessibilityClient(false)
      }
    } catch { /* electron not loadable in this environment */ }
    return {
      platform:                            'darwin',
      needsAccessibilityPermission:        true,
      hasAccessibilityPermissionInitially: hasPerm,
    }
  }
}
