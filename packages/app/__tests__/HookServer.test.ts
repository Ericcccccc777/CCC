import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as http from 'http'

// Mock electron's runtime surface so HookServer.attachWindow / stop can call
// ipcMain.* without a real Electron context. HookServer's reference to
// BrowserWindow is type-only, so we don't need to mock the constructor.
vi.mock('electron', () => ({
  ipcMain: {
    on:                 vi.fn(),
    removeAllListeners: vi.fn(),
  },
}))

import { HookServer } from '../src/main/HookServer'
import { IPC } from '../src/shared/ipc-channels'
import type { SessionStateUpdate, SessionMetricsUpdate } from '../src/shared/session-state'

// Regression coverage for the `AskUserQuestion popup-timeout vs streaming
// flip` fix (2026-05-05). Before the fix, every PreToolUse hook timeout
// uniformly flipped the island icon to `streaming`, which was wrong for
// AskUserQuestion: that tool, once unblocked, renders its own picker in the
// Terminal and waits there for the user — Claude is *not* actively
// streaming. The fix routes AskUserQuestion through a separate path that
// keeps the icon at `waiting` and suppresses transcript→streaming until the
// next Stop. Other tools keep the existing streaming behavior.
class HookServerTimeoutTests {
  static run(): void {
    describe('HookServer pretooluse timeout', () => {
      let server: HookServer
      let port:   number
      let sent:   SessionStateUpdate[]

      beforeEach(async () => {
        // 80 ms test-only timeout — production default is 30_000 ms.
        server = new HookServer(80)
        sent = []
        const fakeWin = {
          webContents: {
            send: (channel: string, payload: unknown): void => {
              if (channel === IPC.SESSION_STATE_CHANGED) {
                sent.push(payload as SessionStateUpdate)
              }
            },
          },
          isDestroyed: (): boolean => false,
        }
        server.attachWindow(fakeWin as unknown as Parameters<HookServer['attachWindow']>[0])
        port = await server.start()
      })

      afterEach(() => {
        server.stop()
      })

      const postHook = (body: object): Promise<void> =>
        new Promise<void>((resolve, reject) => {
          const json = JSON.stringify(body)
          const req = http.request(
            {
              hostname: '127.0.0.1',
              port,
              path:     '/hook',
              method:   'POST',
              headers:  {
                'Content-Type':   'application/json',
                'Content-Length': Buffer.byteLength(json),
              },
            },
            (res: http.IncomingMessage) => {
              res.on('data', () => { /* drain */ })
              res.on('end',  () => { resolve() })
            },
          )
          req.on('error', reject)
          req.write(json)
          req.end()
        })

      const postHookBody = (body: object): Promise<string> =>
        new Promise<string>((resolve, reject) => {
          const json = JSON.stringify(body)
          const req = http.request(
            { hostname: '127.0.0.1', port, path: '/hook', method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) } },
            (res: http.IncomingMessage) => {
              let out = ''
              res.on('data', c => { out += c })
              res.on('end', () => resolve(out))
            },
          )
          req.on('error', reject)
          req.write(json)
          req.end()
        })

      it('remote-control session passes PreToolUse through to native (no popup, passthrough body)', async () => {
        server.registerRemoteSession(1)
        const body = await postHookBody({
          sessionId: 1, event: 'pretooluse', tool: 'Bash', toolInput: { command: 'ls' },
        })
        // response tells the hook to emit NO decision → Claude's native prompt fires
        expect(JSON.parse(body)).toMatchObject({ passthrough: true })
        // single streaming emit, never a waiting/permission popup
        expect(sent).toEqual([{ sessionId: 1, state: 'streaming' }])
      })

      it('unregisterRemoteSession restores the permission popup', async () => {
        server.registerRemoteSession(1)
        server.unregisterRemoteSession(1)
        await postHook({ sessionId: 1, event: 'pretooluse', tool: 'Bash', toolInput: { command: 'ls' } })
        expect(sent).toHaveLength(2)
        expect(sent[0].state).toBe('waiting')
        expect(sent[0].permission).toBeDefined()
      })

      it('AskUserQuestion timeout keeps state=waiting (icon stays `?`, popup clears, no flip to streaming)', async () => {
        await postHook({
          sessionId: 1,
          event:     'pretooluse',
          tool:      'AskUserQuestion',
          toolInput: { questions: [] },
        })
        // Two emits expected:
        //   [0] immediate — `waiting` + `permission` payload (popup opens)
        //   [1] after 80ms timeout — `waiting` alone (popup closes, icon stays)
        expect(sent).toHaveLength(2)
        expect(sent[0].state).toBe('waiting')
        expect(sent[0].permission).toBeDefined()
        expect(sent[1]).toEqual({ sessionId: 1, state: 'waiting' })
      })

      it('Bash timeout flips to streaming (regression — non-interactive tools keep existing behavior)', async () => {
        await postHook({
          sessionId: 1,
          event:     'pretooluse',
          tool:      'Bash',
          toolInput: { command: 'ls' },
        })
        expect(sent).toHaveLength(2)
        expect(sent[0].state).toBe('waiting')
        expect(sent[0].permission).toBeDefined()
        expect(sent[1]).toEqual({ sessionId: 1, state: 'streaming' })
      })

      it('full-access (danger mode) session auto-allows PreToolUse with no popup', async () => {
        server.registerFullAccessSession(1)
        await postHook({
          sessionId: 1,
          event:     'pretooluse',
          tool:      'Bash',
          toolInput: { command: 'rm -rf build' },
        })
        // Single emit: streaming, no `waiting`/permission popup ever shown.
        expect(sent).toHaveLength(1)
        expect(sent[0]).toEqual({ sessionId: 1, state: 'streaming' })
        expect(sent[0].permission).toBeUndefined()
      })

      it('unregisterFullAccessSession restores the permission popup', async () => {
        server.registerFullAccessSession(1)
        server.unregisterFullAccessSession(1)
        await postHook({
          sessionId: 1,
          event:     'pretooluse',
          tool:      'Bash',
          toolInput: { command: 'ls' },
        })
        // Back to normal: popup opens, then timeout flips to streaming.
        expect(sent).toHaveLength(2)
        expect(sent[0].state).toBe('waiting')
        expect(sent[0].permission).toBeDefined()
        expect(sent[1]).toEqual({ sessionId: 1, state: 'streaming' })
      })

      it('Stop event after AskUserQuestion timeout flips to done and clears terminal-awaiting suppression', async () => {
        await postHook({
          sessionId: 1,
          event:     'pretooluse',
          tool:      'AskUserQuestion',
          toolInput: { questions: [] },
        })
        // After timeout: sent = [waiting+perm, waiting]
        expect(sent[1]).toEqual({ sessionId: 1, state: 'waiting' })

        await postHook({ sessionId: 1, event: 'stop' })
        // Stop unconditionally emits done; if terminal-awaiting were leaking
        // past Stop, future transcript activity would be suppressed — that
        // path is covered by manual verification (transcript files require
        // real fs polling). Here we assert the Stop emit itself.
        expect(sent.at(-1)).toEqual({ sessionId: 1, state: 'done' })
      })
    })

    // Regression: while a PreToolUse popup is pending, the transcript watcher
    // used to read Claude's own tool_use line ~800ms later and emit streaming,
    // clobbering the popup. Bug surface: "popup flashes once and disappears".
    describe('processTranscriptLine — Bug 1 (popup flicker)', () => {
      let server: HookServer
      let sent:   SessionStateUpdate[]

      beforeEach(async () => {
        server = new HookServer(80)
        sent = []
        const fakeWin = {
          webContents: {
            send: (channel: string, payload: unknown): void => {
              if (channel === IPC.SESSION_STATE_CHANGED) {
                sent.push(payload as SessionStateUpdate)
              }
            },
          },
          isDestroyed: (): boolean => false,
        }
        server.attachWindow(fakeWin as unknown as Parameters<HookServer['attachWindow']>[0])
        await server.start()
      })

      afterEach(() => { server.stop() })

      const callProcess = (sessionId: number, line: string): void => {
        // processTranscriptLine is private; reach in for testing.
        ;(server as unknown as {
          processTranscriptLine: (sid: number, l: string) => void
        }).processTranscriptLine(sessionId, line)
      }

      const setPendingHook = (sessionId: number): void => {
        // Inject a fake pending hook entry — transcript suppression checks
        // `pendingHooks.values().some(p => p.sessionId === sid)`. The stub
        // `res` only needs writeHead/end because server.stop() drains all
        // pending hooks via `reply()` on teardown.
        const fakeRes = {
          writeHead: (): void => { /* noop */ },
          end:       (): void => { /* noop */ },
        }
        ;(server as unknown as {
          pendingHooks: Map<string, { res: object; timer: NodeJS.Timeout; sessionId: number }>
        }).pendingHooks.set('ptu-test-1', {
          res:       fakeRes,
          timer:     setTimeout(() => { /* noop */ }, 60_000),
          sessionId,
        })
      }

      it('assistant message during pending PreToolUse hook does NOT emit streaming (popup stays)', () => {
        setPendingHook(1)
        callProcess(1, JSON.stringify({
          type:    'assistant',
          message: { role: 'assistant', content: [{ type: 'tool_use', name: 'AskUserQuestion' }] },
        }))
        expect(sent).toEqual([])
      })

      it('assistant message with no pending hook emits streaming (regression: normal path preserved)', () => {
        callProcess(1, JSON.stringify({
          type:    'assistant',
          message: { role: 'assistant', content: [{ type: 'text', text: 'hi' }] },
        }))
        expect(sent).toEqual([{ sessionId: 1, state: 'streaming' }])
      })
    })

    // Regression: after AskUserQuestion popup timed out, terminalAwaiting was
    // set to suppress streaming. But the flag only cleared on Stop, so users
    // who pressed ESC in the terminal saw the icon stuck at `?` until the
    // *next* turn ended. Fix: clear flag on user-role transcript messages
    // (which fire when a tool_result is written back).
    describe('processTranscriptLine — Bug 2 (stuck `?` after ESC in terminal)', () => {
      let server: HookServer
      let sent:   SessionStateUpdate[]

      beforeEach(async () => {
        server = new HookServer(80)
        sent = []
        const fakeWin = {
          webContents: {
            send: (channel: string, payload: unknown): void => {
              if (channel === IPC.SESSION_STATE_CHANGED) {
                sent.push(payload as SessionStateUpdate)
              }
            },
          },
          isDestroyed: (): boolean => false,
        }
        server.attachWindow(fakeWin as unknown as Parameters<HookServer['attachWindow']>[0])
        await server.start()
      })

      afterEach(() => { server.stop() })

      const callProcess = (sessionId: number, line: string): void => {
        ;(server as unknown as {
          processTranscriptLine: (sid: number, l: string) => void
        }).processTranscriptLine(sessionId, line)
      }

      const setTerminalAwaiting = (sessionId: number): void => {
        ;(server as unknown as {
          terminalAwaiting: Set<number>
        }).terminalAwaiting.add(sessionId)
      }

      const isTerminalAwaiting = (sessionId: number): boolean =>
        (server as unknown as {
          terminalAwaiting: Set<number>
        }).terminalAwaiting.has(sessionId)

      it('user-role message clears terminalAwaiting AND pushes state=streaming for the auto-dismiss flow', () => {
        // When the AskUserQuestion popup timed out and the user then
        // answered in the terminal, the transcript records a user-role
        // entry. The watcher both clears the awaiting flag AND emits
        // state=streaming so the renderer drops the stale popup
        // immediately — see HookServer.processTranscriptLine.
        setTerminalAwaiting(1)
        expect(isTerminalAwaiting(1)).toBe(true)

        callProcess(1, JSON.stringify({
          type:    'user',
          message: {
            role:    'user',
            content: [{ type: 'tool_result', tool_use_id: 'abc', content: 'cancelled' }],
          },
        }))
        expect(isTerminalAwaiting(1)).toBe(false)
        expect(sent).toEqual([{ sessionId: 1, state: 'streaming' }])
      })

      it('user-msg without terminalAwaiting does NOT emit (avoid spurious state churn)', () => {
        // If terminalAwaiting was never set (e.g. user answered in CCC
        // popup before the 30s timeout, or this is just a regular
        // assistant→tool_result→user turn), the user-msg arrival should
        // be silent — no extra state update.
        expect(isTerminalAwaiting(1)).toBe(false)
        callProcess(1, JSON.stringify({
          type: 'user', message: { role: 'user', content: [] },
        }))
        expect(sent).toEqual([])
      })

      it('assistant message AFTER terminalAwaiting cleared also flips to streaming', () => {
        setTerminalAwaiting(1)

        // tool_result arrives → flag cleared, also emits state=streaming
        callProcess(1, JSON.stringify({
          type: 'user', message: { role: 'user', content: [] },
        }))

        // Subsequent assistant text → flips to streaming (idempotent —
        // the renderer treats duplicate state updates as no-ops).
        callProcess(1, JSON.stringify({
          type: 'assistant', message: { role: 'assistant', content: 'hi' },
        }))
        expect(sent).toEqual([
          { sessionId: 1, state: 'streaming' },
          { sessionId: 1, state: 'streaming' },
        ])
      })

      it('assistant message while terminalAwaiting set is now the FALLBACK: clears flag + flips to streaming', () => {
        // DECISION_LOG 2026-05-17-3 option B. The old behavior (suppress
        // assistant→streaming while terminalAwaiting set) was supposed to
        // hold the `?` icon until the user-msg branch cleared the flag,
        // but observed Claude Code transcripts didn't always emit a
        // user-msg the watcher could match. assistant-msg is a strict
        // superset of "user has answered" (Claude only writes assistant
        // continuations after a user response), so we clear the flag and
        // flip to streaming here too.
        setTerminalAwaiting(1)
        callProcess(1, JSON.stringify({
          type: 'assistant', message: { role: 'assistant', content: 'hi' },
        }))
        expect(sent).toEqual([{ sessionId: 1, state: 'streaming' }])
        expect(isTerminalAwaiting(1)).toBe(false)
      })
    })

    // Regression: Claude's idle-nudge "Claude is waiting for your input"
    // notification is redundant with the pill's `?` icon and the user
    // explicitly asked for it removed. Other notification messages
    // (permission attention, etc.) still propagate.
    describe('notification suppression', () => {
      let server: HookServer
      let sent:   SessionStateUpdate[]

      beforeEach(async () => {
        server = new HookServer(80)
        sent = []
        const fakeWin = {
          webContents: {
            send: (channel: string, payload: unknown): void => {
              if (channel === IPC.SESSION_STATE_CHANGED) sent.push(payload as SessionStateUpdate)
            },
          },
          isDestroyed: (): boolean => false,
        }
        server.attachWindow(fakeWin as unknown as Parameters<HookServer['attachWindow']>[0])
        await server.start()
      })
      afterEach(() => { server.stop() })

      const dispatch = (event: string, message: string): void => {
        ;(server as unknown as {
          dispatch: (p: object, res: object) => void
        }).dispatch(
          { sessionId: 1, event, message },
          { writeHead: () => { /* noop */ }, end: () => { /* noop */ } },
        )
      }

      it('drops notifications matching the idle-nudge phrase', () => {
        dispatch('notification', 'Claude is waiting for your input')
        expect(sent).toEqual([])
      })

      it('case-insensitive match', () => {
        dispatch('notification', 'CLAUDE IS WAITING FOR YOUR INPUT')
        expect(sent).toEqual([])
      })

      it('forwards other notification messages unchanged', () => {
        dispatch('notification', 'Claude needs your permission')
        expect(sent).toEqual([{ sessionId: 1, message: 'Claude needs your permission' }])
      })
    })

    // Regression: Claude Code's statusLine actually emits resets_at as a
    // Unix-SECONDS number (verified 2026-05-09: {"resets_at": 1778313600}).
    // Earlier code only treated `resets_at` as an ISO string; numbers fell
    // through to the no-data path and the renderer never received reset
    // timestamps. Magnitude-based discrimination handles both seconds and
    // ms encodings without a build-version sniff.
    describe('rate_limits resets_at parsing', () => {
      let server: HookServer
      let metricsSent: SessionMetricsUpdate[]

      beforeEach(async () => {
        server = new HookServer(80)
        metricsSent = []
        const fakeWin = {
          webContents: {
            send: (channel: string, payload: unknown): void => {
              if (channel === IPC.SESSION_METRICS_UPDATED) metricsSent.push(payload as SessionMetricsUpdate)
            },
          },
          isDestroyed: (): boolean => false,
        }
        server.attachWindow(fakeWin as unknown as Parameters<HookServer['attachWindow']>[0])
        await server.start()
      })
      afterEach(() => { server.stop() })

      const fakeRes = { writeHead: (): void => { /* noop */ }, end: (): void => { /* noop */ } }
      const handle = (rateLimits: object): void => {
        ;(server as unknown as {
          handleStatusLine: (p: { sessionId: number; data: object }, res: object) => void
        }).handleStatusLine({
          sessionId: 1,
          data: { rate_limits: rateLimits },
        }, fakeRes)
      }

      it('parses Unix-SECONDS number (Claude Code 2026-05 schema)', () => {
        handle({
          five_hour: { used_percentage: 0,  resets_at: 1778313600 },
          seven_day: { used_percentage: 91, resets_at: 1778720400 },
        })
        const m = metricsSent[0]!
        expect(m.reset5hAt).toBe(1778313600 * 1000)
        expect(m.reset7dAt).toBe(1778720400 * 1000)
      })

      it('parses Unix-MS number unchanged', () => {
        handle({ five_hour: { resets_at: 1778313600_000 } })
        expect(metricsSent[0]!.reset5hAt).toBe(1778313600_000)
      })

      it('parses ISO string fallback', () => {
        handle({ five_hour: { resets_at: '2026-05-10T08:00:00Z' } })
        expect(metricsSent[0]!.reset5hAt).toBe(Date.parse('2026-05-10T08:00:00Z'))
      })

      it('reset_in_seconds is converted to absolute ms via Date.now()', () => {
        const before = Date.now()
        handle({ five_hour: { reset_in_seconds: 3600 } })
        const after = Date.now()
        const got = metricsSent[0]!.reset5hAt!
        expect(got).toBeGreaterThanOrEqual(before + 3600 * 1000 - 50)
        expect(got).toBeLessThanOrEqual(after + 3600 * 1000 + 50)
      })

      it('returns undefined when no reset field is present', () => {
        handle({ five_hour: { used_percentage: 12 } })
        expect(metricsSent[0]!.reset5hAt).toBeUndefined()
      })
    })

    // Regression: the Windows "stuck running" bug. A trailing PreToolUse POST
    // (e.g. the harness's after-reply scratchpad Write) can arrive AFTER the
    // Stop event on slow transports — Windows spawns hooks via PowerShell, far
    // slower than macOS node — flipping a just-`done` session back to
    // `streaming`. maybeStream()'s STREAM_GRACE_MS guard suppresses that;
    // sweepIdle() is the longer-horizon backstop for any unmodeled stuck state.
    describe('stop→pretooluse ordering race + idle backstop', () => {
      let server: HookServer
      let port:   number
      let sent:   SessionStateUpdate[]

      beforeEach(async () => {
        server = new HookServer(80)
        sent = []
        const fakeWin = {
          webContents: {
            send: (channel: string, payload: unknown): void => {
              if (channel === IPC.SESSION_STATE_CHANGED) sent.push(payload as SessionStateUpdate)
            },
          },
          isDestroyed: (): boolean => false,
        }
        server.attachWindow(fakeWin as unknown as Parameters<HookServer['attachWindow']>[0])
        port = await server.start()
      })
      afterEach(() => { server.stop() })

      const postHook = (body: object): Promise<void> =>
        new Promise<void>((resolve, reject) => {
          const json = JSON.stringify(body)
          const req = http.request(
            { hostname: '127.0.0.1', port, path: '/hook', method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) } },
            (res: http.IncomingMessage) => { res.on('data', () => { /* drain */ }); res.on('end', () => resolve()) },
          )
          req.on('error', reject); req.write(json); req.end()
        })

      const setLastDone = (sessionId: number, at: number): void => {
        ;(server as unknown as { lastDoneAt: Map<number, number> }).lastDoneAt.set(sessionId, at)
      }
      const setState = (sessionId: number, state: string): void => {
        ;(server as unknown as { lastState: Map<number, string> }).lastState.set(sessionId, state)
      }
      const setActivity = (sessionId: number, at: number): void => {
        ;(server as unknown as { lastActivityAt: Map<number, number> }).lastActivityAt.set(sessionId, at)
      }
      const sweepIdle = (): void => {
        ;(server as unknown as { sweepIdle: () => void }).sweepIdle()
      }

      it('trailing auto-allowed PreToolUse within grace does NOT resurrect a done session', async () => {
        server.registerFullAccessSession(1)
        await postHook({ sessionId: 1, event: 'stop' })
        expect(sent.at(-1)).toEqual({ sessionId: 1, state: 'done' })
        // Trailing pretooluse (e.g. the scratchpad Write) lands just after Stop.
        await postHook({ sessionId: 1, event: 'pretooluse', tool: 'Write', toolInput: { file_path: 'x' } })
        // No streaming emitted after done — the session stays done.
        expect(sent.filter(s => s.state === 'streaming')).toEqual([])
        expect(sent.at(-1)).toEqual({ sessionId: 1, state: 'done' })
      })

      it('auto-allowed PreToolUse AFTER the grace window flips to streaming (genuine new turn)', async () => {
        server.registerFullAccessSession(1)
        setLastDone(1, Date.now() - 10_000)  // a Stop well beyond STREAM_GRACE_MS
        await postHook({ sessionId: 1, event: 'pretooluse', tool: 'Bash', toolInput: { command: 'ls' } })
        expect(sent).toEqual([{ sessionId: 1, state: 'streaming' }])
      })

      it('sweepIdle force-completes a session stuck running with stale activity', () => {
        setState(1, 'streaming')
        setActivity(1, Date.now() - 6 * 60_000)  // 6 min idle
        sweepIdle()
        expect(sent.at(-1)).toEqual({ sessionId: 1, state: 'done' })
      })

      it('sweepIdle leaves a recently-active running session alone', () => {
        setState(1, 'streaming')
        setActivity(1, Date.now() - 1_000)  // 1 s ago
        sweepIdle()
        expect(sent).toEqual([])
      })

      it('sweepIdle never force-completes a session already done', () => {
        setState(1, 'done')
        setActivity(1, Date.now() - 6 * 60_000)
        sweepIdle()
        expect(sent).toEqual([])
      })

      it('sweepIdle skips a session blocked on a permission popup', () => {
        setState(1, 'waiting')
        setActivity(1, Date.now() - 6 * 60_000)
        ;(server as unknown as {
          pendingHooks: Map<string, { res: object; timer: NodeJS.Timeout; sessionId: number }>
        }).pendingHooks.set('ptu-x', {
          res:   { writeHead: (): void => { /* noop */ }, end: (): void => { /* noop */ } },
          timer: setTimeout(() => { /* noop */ }, 60_000),
          sessionId: 1,
        })
        sweepIdle()
        expect(sent).toEqual([])
      })
    })

    // Regression: after Mac sleep / long idle / an app restart, a session that
    // was rebuilt (removed + re-added) lost its model in the pill and showed
    // "—" until a full restart. Root cause: the real statusLine display name
    // lived ONLY in the renderer, fed by statusLine POSTs; a rebuilt session
    // fell back to the launch alias / "" → "—" and never refilled while idle.
    // HookServer now remembers the model (lastModel) so restore payloads carry
    // it and the on-wake rebroadcast re-hydrates a blank session.
    describe('model memory (blank-model-after-sleep fix)', () => {
      let server:      HookServer
      let metricsSent: SessionMetricsUpdate[]

      beforeEach(async () => {
        server = new HookServer(80)
        metricsSent = []
        const fakeWin = {
          webContents: {
            send: (channel: string, payload: unknown): void => {
              if (channel === IPC.SESSION_METRICS_UPDATED) metricsSent.push(payload as SessionMetricsUpdate)
            },
          },
          isDestroyed: (): boolean => false,
        }
        server.attachWindow(fakeWin as unknown as Parameters<HookServer['attachWindow']>[0])
        await server.start()
      })
      afterEach(() => { server.stop() })

      const fakeRes = { writeHead: (): void => { /* noop */ }, end: (): void => { /* noop */ } }
      const handle = (sessionId: number, data: object): void => {
        ;(server as unknown as {
          handleStatusLine: (p: { sessionId: number; data: object }, res: object) => void
        }).handleStatusLine({ sessionId, data }, fakeRes)
      }

      it('remembers the statusLine display_name and forwards it in metrics', () => {
        handle(1, { model: { id: 'claude-opus-4-8', display_name: 'Opus 4.8' } })
        expect(server.lastKnownModel(1)).toBe('Opus 4.8')
        expect(metricsSent.at(-1)!.model).toBe('Opus 4.8')
      })

      it('falls back to the model id when display_name is absent', () => {
        handle(2, { model: { id: 'claude-sonnet-5' } })
        expect(server.lastKnownModel(2)).toBe('claude-sonnet-5')
      })

      it('does NOT forget the remembered model when a later statusLine omits it', () => {
        handle(1, { model: { display_name: 'Opus 4.8' } })
        handle(1, { model: {} })                                // resolves to undefined
        handle(1, { context_window: { used_percentage: 12 } })  // no model key at all
        expect(server.lastKnownModel(1)).toBe('Opus 4.8')
      })

      it('rebroadcastSessionMetrics re-emits the cached model for every tracked session (on-wake recovery)', () => {
        handle(1, { model: { display_name: 'Opus 4.8' } })
        handle(2, { model: { display_name: 'Sonnet 5' } })
        metricsSent.length = 0
        server.rebroadcastSessionMetrics()
        expect(metricsSent).toEqual([
          { sessionId: 1, replay: true, model: 'Opus 4.8' },
          { sessionId: 2, replay: true, model: 'Sonnet 5' },
        ])
      })

      it('seedModel primes the cache (used when restoring a persisted session cold)', () => {
        server.seedModel(7, 'Fable 5')
        expect(server.lastKnownModel(7)).toBe('Fable 5')
        server.rebroadcastSessionMetrics()
        expect(metricsSent).toContainEqual({ sessionId: 7, replay: true, model: 'Fable 5' })
      })

      it('stopTranscript forgets the remembered model even with no transcript watcher', () => {
        handle(1, { model: { display_name: 'Opus 4.8' } })   // sets model, opens no transcript
        server.stopTranscript(1)
        expect(server.lastKnownModel(1)).toBeUndefined()
      })
    })

    // Regression: the numeric metrics (context %, 5h/7d usage, reset times) had
    // the exact bug the model fix above solved — they arrive only on statusLine
    // POSTs and lived only in the renderer, so a session rebuilt after sleep /
    // long idle / app restart reset them to 0 and stayed there while idle. The
    // server now caches + re-hydrates them the same way it does the model.
    describe('metrics memory (blank-metrics-after-sleep fix)', () => {
      let server:      HookServer
      let metricsSent: SessionMetricsUpdate[]

      beforeEach(async () => {
        server = new HookServer(80)
        metricsSent = []
        const fakeWin = {
          webContents: {
            send: (channel: string, payload: unknown): void => {
              if (channel === IPC.SESSION_METRICS_UPDATED) metricsSent.push(payload as SessionMetricsUpdate)
            },
          },
          isDestroyed: (): boolean => false,
        }
        server.attachWindow(fakeWin as unknown as Parameters<HookServer['attachWindow']>[0])
        await server.start()
      })
      afterEach(() => { server.stop() })

      const fakeRes = { writeHead: (): void => { /* noop */ }, end: (): void => { /* noop */ } }
      const handle = (sessionId: number, data: object): void => {
        ;(server as unknown as {
          handleStatusLine: (p: { sessionId: number; data: object }, res: object) => void
        }).handleStatusLine({ sessionId, data }, fakeRes)
      }

      it('remembers context %, usage, and reset times from the statusLine', () => {
        handle(1, {
          context_window: { used_percentage: 42, total_input_tokens: 100, total_output_tokens: 20, context_window_size: 200000 },
          rate_limits: { five_hour: { used_percentage: 30 }, seven_day: { used_percentage: 55 } },
        })
        expect(server.lastKnownMetrics(1)).toEqual({
          contextPct: 0.42, contextTokens: 120, contextWindowSize: 200000,
          usagePct5h: 0.30, usagePct7d: 0.55,
        })
      })

      it('does NOT forget remembered numbers when a later statusLine omits them', () => {
        handle(1, { context_window: { used_percentage: 42 }, rate_limits: { five_hour: { used_percentage: 30 }, seven_day: { used_percentage: 55 } } })
        handle(1, { model: { display_name: 'Opus 4.8' } })   // no context_window / rate_limits at all
        expect(server.lastKnownMetrics(1)).toMatchObject({ contextPct: 0.42, usagePct5h: 0.30, usagePct7d: 0.55 })
      })

      it('rebroadcastSessionMetrics re-emits cached model + numbers together (on-wake recovery)', () => {
        handle(1, {
          model: { display_name: 'Opus 4.8' },
          context_window: { used_percentage: 42 },
          rate_limits: { five_hour: { used_percentage: 30 }, seven_day: { used_percentage: 55 } },
        })
        metricsSent.length = 0
        server.rebroadcastSessionMetrics()
        expect(metricsSent).toEqual([
          { sessionId: 1, replay: true, model: 'Opus 4.8', contextPct: 0.42, usagePct5h: 0.30, usagePct7d: 0.55 },
        ])
      })

      it('rebroadcasts a session that has numbers but never sent a model', () => {
        handle(9, { context_window: { used_percentage: 12 } })
        metricsSent.length = 0
        server.rebroadcastSessionMetrics()
        expect(metricsSent).toEqual([{ sessionId: 9, replay: true, contextPct: 0.12 }])
      })

      it('seedMetrics primes the cache (used when restoring a persisted session cold)', () => {
        server.seedMetrics(7, { contextPct: 0.5, usagePct5h: 0.25, usagePct7d: 0.6 })
        expect(server.lastKnownMetrics(7)).toEqual({ contextPct: 0.5, usagePct5h: 0.25, usagePct7d: 0.6 })
        server.rebroadcastSessionMetrics()
        expect(metricsSent).toContainEqual({ sessionId: 7, replay: true, contextPct: 0.5, usagePct5h: 0.25, usagePct7d: 0.6 })
      })

      it('stopTranscript forgets the remembered numbers even with no transcript watcher', () => {
        handle(1, { context_window: { used_percentage: 42 } })
        server.stopTranscript(1)
        expect(server.lastKnownMetrics(1)).toBeUndefined()
      })
    })
  }
}

HookServerTimeoutTests.run()
