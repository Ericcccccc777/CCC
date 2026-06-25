import { spawn, execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type {
  InjectCodexModelSelectionOptions,
  FocusSessionOptions,
  HookEventName,
  InjectKeystrokesOptions,
  KillSessionOptions,
  LaunchCodexSessionOptions,
  LaunchHeadlessOptions,
  LaunchInteractiveOptions,
  LaunchResult,
  PlatformAdapter,
  PlatformCapabilities,
  RespawnMonitorOptions,
  RespawnResult,
} from './PlatformAdapter'

interface ConsoleInputSegment {
  readonly text: string
  readonly delayAfterMs?: number
}

// All PowerShell, taskkill, tasklist, and WriteConsoleInput P/Invoke code
// is contained in this file. No other module in the codebase reads
// 'process.platform' or imports a Windows-specific binary name.
//
// Hook command bodies carry a '# ccc-hook' tag so ClaudeSettingsManager
// can re-inject idempotently and ClaudeSettingsManager.restore() can
// identify our entries.

// Builds `$env:KEY = 'value'` lines for a record of env vars, with
// PowerShell single-quote escaping (single quote → doubled). Exported for
// tests; the real call path stays inline in launchInteractive.
export function buildPowerShellEnvLines(env: Readonly<Record<string, string>> | undefined): string[] {
  return Object.entries(env ?? {}).map(
    ([k, v]) => `$env:${k} = '${v.replace(/'/g, "''")}'`,
  )
}

export function buildCodexPowerShellScripts(opts: {
  readonly workspace: string
  readonly modelId: string
  readonly inner: string
  readonly pidFile: string
  readonly skipPermissions?: boolean
}): { readonly inner: string; readonly outer: string } {
  const escWs    = opts.workspace.replace(/'/g, "''")
  const escInner = opts.inner.replace(/'/g, "''")
  const escPid   = opts.pidFile.replace(/'/g, "''")
  const modelArg = opts.modelId ? ` --model '${opts.modelId.replace(/'/g, "''")}'` : ''
  const permArg  = opts.skipPermissions ? ' --dangerously-bypass-approvals-and-sandbox' : ''

  return {
    inner: [
      `Set-Location '${escWs}'`,
      `codex${modelArg}${permArg}`,
    ].join('\n'),
    outer: [
      `$proc = Start-Process powershell.exe -ArgumentList '-ExecutionPolicy','Bypass','-NoExit','-File','${escInner}' -PassThru`,
      `if ($proc) { $proc.Id | Set-Content '${escPid}'; $proc.WaitForExit() }`,
      `Remove-Item '${escPid}' -ErrorAction SilentlyContinue`,
    ].join('\n'),
  }
}

export class WindowsAdapter implements PlatformAdapter {
  private readonly tmp: string

  constructor() {
    this.tmp = tmpdir()
  }

  launchInteractive(opts: LaunchInteractiveOptions): LaunchResult {
    const { workspace, modelId, sessionId, port, env, skipPermissions, resumeSessionId } = opts

    const inner   = join(this.tmp, `ccc-inner-${sessionId}.ps1`)
    const outer   = join(this.tmp, `ccc-outer-${sessionId}.ps1`)
    const pidFile = join(this.tmp, `ccc-pid-${sessionId}.txt`)

    const escWs    = workspace.replace(/'/g, "''")
    const escInner = inner.replace(/'/g, "''")
    const escPid   = pidFile.replace(/'/g, "''")
    const modelArg = modelId ? ` --model ${modelId}` : ''
    const permArg  = skipPermissions ? ' --dangerously-skip-permissions' : ''
    // Resume restores the session's own model, so --model is omitted on resume.
    const claudeLine = resumeSessionId
      ? `claude --resume ${resumeSessionId.replace(/'/g, "''")}${permArg}`
      : `claude${modelArg}${permArg}`

    const extraEnvLines = buildPowerShellEnvLines(env)

    writeFileSync(inner, [
      `$env:CCC_OWNER      = 'Claude-Code-Controller'`,
      `$env:CCC_ENGINE     = 'claude'`,
      `$env:CCC_PORT       = '${port}'`,
      `$env:CCC_SESSION_ID = '${sessionId}'`,
      ...extraEnvLines,
      `Set-Location '${escWs}'`,
      claudeLine,
    ].join('\n'), 'utf8')

    writeFileSync(outer, [
      `$proc = Start-Process powershell.exe -ArgumentList '-ExecutionPolicy','Bypass','-NoExit','-File','${escInner}' -PassThru`,
      `if ($proc) { $proc.Id | Set-Content '${escPid}'; $proc.WaitForExit() }`,
      `Remove-Item '${escPid}' -ErrorAction SilentlyContinue`,
    ].join('\n'), 'utf8')

    const proc = spawn('powershell.exe', [
      '-ExecutionPolicy', 'Bypass',
      '-WindowStyle',     'Hidden',
      '-NonInteractive',
      '-File',            outer,
    ], { stdio: 'ignore', windowsHide: true })

    return { proc, pidFile, cleanupPaths: [inner, outer, pidFile] }
  }

  launchHeadless(opts: LaunchHeadlessOptions): LaunchResult {
    const { workspace, prompt, sessionId, port } = opts

    const inner      = join(this.tmp, `ccc-headless-${sessionId}.ps1`)
    const promptFile = join(this.tmp, `ccc-headless-prompt-${sessionId}.txt`)

    writeFileSync(promptFile, prompt, 'utf8')

    const escWs         = workspace.replace(/'/g, "''")
    const escPromptFile = promptFile.replace(/'/g, "''")

    writeFileSync(inner, [
      `$env:CCC_PORT       = '${port}'`,
      `$env:CCC_SESSION_ID = '${sessionId}'`,
      `Set-Location '${escWs}'`,
      `$prompt = Get-Content -Raw -Path '${escPromptFile}'`,
      `& claude -p $prompt`,
    ].join('\n'), 'utf8')

    const proc = spawn('powershell.exe', [
      '-ExecutionPolicy', 'Bypass',
      '-WindowStyle',     'Hidden',
      '-NonInteractive',
      '-File',            inner,
    ], { stdio: 'ignore', windowsHide: true })

    return { proc, pidFile: '', cleanupPaths: [inner, promptFile] }
  }

  launchCodexSession(opts: LaunchCodexSessionOptions): LaunchResult {
    const { workspace, modelId, sessionId, skipPermissions } = opts

    const inner   = join(this.tmp, `ccc-codex-inner-${sessionId}.ps1`)
    const outer   = join(this.tmp, `ccc-codex-outer-${sessionId}.ps1`)
    const pidFile = join(this.tmp, `ccc-codex-pid-${sessionId}.txt`)

    const scripts = buildCodexPowerShellScripts({ workspace, modelId, inner, pidFile, skipPermissions })

    writeFileSync(inner, scripts.inner, 'utf8')
    writeFileSync(outer, scripts.outer, 'utf8')

    const proc = spawn('powershell.exe', [
      '-ExecutionPolicy', 'Bypass',
      '-WindowStyle',     'Hidden',
      '-NonInteractive',
      '-File',            outer,
    ], { stdio: 'ignore', windowsHide: true })

    return { proc, pidFile, cleanupPaths: [inner, outer, pidFile] }
  }

  respawnMonitor(opts: RespawnMonitorOptions): RespawnResult {
    const { sessionId, innerPid, pidFile } = opts

    const monitorPath = join(this.tmp, `ccc-monitor-${sessionId}-${Date.now()}.ps1`)
    const escPid      = pidFile.replace(/'/g, "''")
    const escMonitor  = monitorPath.replace(/'/g, "''")

    writeFileSync(monitorPath, [
      `$targetPid = ${innerPid}`,
      `$p = $null`,
      `try { $p = Get-Process -Id $targetPid -ErrorAction Stop } catch {}`,
      `if ($p) { $p.WaitForExit() }`,
      `Remove-Item '${escPid}'     -ErrorAction SilentlyContinue`,
      `Remove-Item '${escMonitor}' -ErrorAction SilentlyContinue`,
    ].join('\n'), 'utf8')

    const proc = spawn('powershell.exe', [
      '-ExecutionPolicy', 'Bypass',
      '-WindowStyle',     'Hidden',
      '-NonInteractive',
      '-File',            monitorPath,
    ], { stdio: 'ignore', windowsHide: true })

    return { proc, cleanupPaths: [monitorPath] }
  }

  killSession(opts: KillSessionOptions): void {
    const { proc, pidFile } = opts
    try {
      const pid = readFileSync(pidFile, 'utf8').trim()
      if (pid) spawn('taskkill', ['/PID', pid, '/T', '/F'], { stdio: 'ignore' })
    } catch { /* PID file not ready */ }
    if (proc.pid !== undefined) {
      spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' })
    }
  }

  isPidAlive(pid: number): boolean {
    try {
      const out = execSync(
        `tasklist /FI "PID eq ${pid}" /FO CSV /NH`,
        { stdio: 'pipe', encoding: 'utf8', timeout: 5000 },
      )
      return out.includes(`"${pid}"`)
    } catch { return false }
  }

  resolveSessionTty(_opts: { readonly pidFile: string }): string | null {
    return null
  }

  recoverSessionProcess(opts: { readonly currentPid?: number; readonly pidFile: string }): { readonly pid: number } | null {
    const pid = opts.currentPid ?? this.readPidFile(opts.pidFile)
    return pid && this.isPidAlive(pid) ? { pid } : null
  }

  private readPidFile(pidFile: string): number | null {
    try {
      const pid = Number(readFileSync(pidFile, 'utf8').trim())
      return Number.isInteger(pid) && pid > 0 ? pid : null
    } catch {
      return null
    }
  }

  injectKeystrokes(opts: InjectKeystrokesOptions): void {
    this.injectConsoleSegments(opts.pidFile, opts.sessionId, [{ text: `${opts.text}\r` }])
  }

  injectCodexModelSelection(opts: InjectCodexModelSelectionOptions): void {
    const modelDigit  = String(opts.modelMenuIndex)
    const effortDigit = String(opts.effortMenuIndex)
    this.injectConsoleSegments(opts.pidFile, opts.sessionId, [
      { text: '/model\r', delayAfterMs: 350 },
      { text: modelDigit, delayAfterMs: 150 },
      { text: effortDigit },
    ])
  }

  private injectConsoleSegments(pidFile: string, sessionId: number, segments: readonly ConsoleInputSegment[]): void {
    let innerPid: string
    try { innerPid = readFileSync(pidFile, 'utf8').trim() } catch { return }
    if (!innerPid || isNaN(Number(innerPid))) return

    const pidNum     = Number(innerPid)
    const scriptPath = join(this.tmp, `ccc-inject-${pidNum}-${Date.now()}.ps1`)
    const safePath   = scriptPath.replace(/'/g, "''")
    const calls = segments.map(segment => {
      const payload = Buffer.from(segment.text, 'utf8').toString('base64')
      const delay = segment.delayAfterMs
        ? `\nStart-Sleep -Milliseconds ${segment.delayAfterMs}`
        : ''
      return `[CCI]::Inject(${pidNum}, [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${payload}')))${delay}`
    }).join('\n')

    const script = `Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class CCI {
    [StructLayout(LayoutKind.Sequential)]
    public struct KEY_EVENT_RECORD {
        public int bKeyDown; public short wRepeatCount;
        public short wVirtualKeyCode; public short wVirtualScanCode;
        public char UnicodeChar; public int dwControlKeyState;
    }
    [StructLayout(LayoutKind.Explicit)]
    public struct INPUT_RECORD {
        [FieldOffset(0)] public short EventType;
        [FieldOffset(4)] public KEY_EVENT_RECORD KeyEvent;
    }
    [DllImport("kernel32.dll")] public static extern bool FreeConsole();
    [DllImport("kernel32.dll")] public static extern bool AttachConsole(int pid);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    public static extern IntPtr CreateFile(string n, uint a, uint s, IntPtr p, uint c, uint f, IntPtr t);
    [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
    [DllImport("kernel32.dll")] public static extern bool WriteConsoleInput(IntPtr h, INPUT_RECORD[] r, uint n, out uint w);
    public static void Inject(int pid, string text) {
        FreeConsole();
        if (!AttachConsole(pid)) return;
        var h = CreateFile("CONIN$", 0xC0000000u, 3u, IntPtr.Zero, 3u, 0u, IntPtr.Zero);
        if (h == new IntPtr(-1)) { FreeConsole(); return; }
        var full = text;
        var recs = new INPUT_RECORD[full.Length * 2];
        for (int i = 0; i < full.Length; i++) {
            short vk = full[i] == '\\r' ? (short)0x0D : (short)0;
            recs[i*2].EventType = 1; recs[i*2].KeyEvent.bKeyDown = 1;
            recs[i*2].KeyEvent.wRepeatCount = 1; recs[i*2].KeyEvent.wVirtualKeyCode = vk;
            recs[i*2].KeyEvent.UnicodeChar = full[i];
            recs[i*2+1].EventType = 1; recs[i*2+1].KeyEvent.bKeyDown = 0;
            recs[i*2+1].KeyEvent.wRepeatCount = 1; recs[i*2+1].KeyEvent.wVirtualKeyCode = vk;
            recs[i*2+1].KeyEvent.UnicodeChar = full[i];
        }
        uint w; WriteConsoleInput(h, recs, (uint)recs.Length, out w);
        CloseHandle(h);
        FreeConsole();
    }
}
'@ -Language CSharp
${calls}
Remove-Item '${safePath}' -ErrorAction SilentlyContinue
`
    try {
      writeFileSync(scriptPath, script, 'utf8')
      spawn('powershell.exe', [
        '-ExecutionPolicy', 'Bypass',
        '-WindowStyle',     'Hidden',
        '-NonInteractive',
        '-File',            scriptPath,
      ], { stdio: 'ignore', windowsHide: true })
    } catch { /* non-fatal */ }
  }

  // Windows users normally bring a window to the foreground via taskbar
  // / Alt-Tab; CCC clicking a session does not need to programmatically
  // steal OS focus the way the macOS Terminal.app path does. Tracked as
  // a future enhancement (would require either FindWindow + SetForeground
  // P/Invoke or a hidden marker in the PowerShell window title we set).
  focusSession(_opts: FocusSessionOptions): void {
    /* no-op on Windows for now (sessionId / pidFile both unused) */
  }

  buildHookCommands(sessionId: number, port: number): Record<HookEventName, string> {
    const url = `http://127.0.0.1:${port}/hook`
    return {
      Stop:
        `powershell.exe -NonInteractive -ExecutionPolicy Bypass -Command ` +
        `"try{[void][System.Console]::In.ReadToEnd()}catch{};` +
        `$b=(@{sessionId=${sessionId};event='stop'}|ConvertTo-Json -Compress);` +
        `try{Invoke-RestMethod -Uri '${url}' -Method POST -Body $b ` +
        `-ContentType 'application/json' -TimeoutSec 3|Out-Null}catch{} # ccc-hook"`,
      // Claude Code does NOT treat exit code alone as a permission
      // decision in current versions — it requires an explicit
      // hookSpecificOutput.permissionDecision JSON on stdout. Exit 0
      // alone reads as "no objection" (Claude prompts the user in the
      // terminal) and exit 1 reads as "hook error" (Claude ignores the
      // user's Deny click and runs the tool anyway). Always exit 0 and
      // put the decision in stdout so the popup buttons actually gate.
      // See DECISION_LOG 2026-05-17-5. Parallels MacOSAdapter HOOK_SCRIPT_BODY.
      PreToolUse:
        `powershell.exe -NonInteractive -ExecutionPolicy Bypass -Command ` +
        `"$stdin=try{[System.Console]::In.ReadToEnd()}catch{'{}'}; ` +
        `$d=try{$stdin|ConvertFrom-Json}catch{[PSCustomObject]@{}}; ` +
        `$tool=if($d.tool_name){[string]$d.tool_name}else{'unknown'}; ` +
        `$b=(@{sessionId=${sessionId};event='pretooluse';tool=$tool;toolInput=$d.tool_input}|ConvertTo-Json -Compress -Depth 6); ` +
        `$code=0; ` +
        `try{$r=Invoke-RestMethod -Uri '${url}' -Method POST -Body $b ` +
        `-ContentType 'application/json' -TimeoutSec 60; $code=[int]$r.exitCode}catch{}; ` +
        `$decision=if($code -eq 0){'allow'}else{'deny'}; ` +
        `$out=(@{hookSpecificOutput=@{hookEventName='PreToolUse';permissionDecision=$decision}}|ConvertTo-Json -Compress); ` +
        `[Console]::Out.Write($out); ` +
        `exit 0 # ccc-hook"`,
      Notification:
        `powershell.exe -NonInteractive -ExecutionPolicy Bypass -Command ` +
        `"$stdin=try{[System.Console]::In.ReadToEnd()}catch{'{}'}; ` +
        `$d=try{$stdin|ConvertFrom-Json}catch{[PSCustomObject]@{}}; ` +
        `$msg=if($d.message){[string]$d.message}else{''}; ` +
        `$b=(@{sessionId=${sessionId};event='notification';message=$msg}|ConvertTo-Json -Compress); ` +
        `try{Invoke-RestMethod -Uri '${url}' -Method POST -Body $b ` +
        `-ContentType 'application/json' -TimeoutSec 3|Out-Null}catch{} # ccc-hook"`,
    }
  }

  buildStatusLineCommand(scriptPath: string): string {
    // Forward-slash form is required by Claude Code's command parser on Windows
    // (back-slashes get interpreted as escape characters in the JSON value).
    const slashPath = scriptPath.replace(/\\/g, '/')
    return `node "${slashPath}"`
  }

  shouldQuitOnAllWindowsClosed(): boolean {
    return true
  }

  capabilities(): PlatformCapabilities {
    return {
      platform:                     'win32',
      needsAccessibilityPermission: false,
    }
  }
}
