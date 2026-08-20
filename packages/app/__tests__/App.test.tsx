import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { App, advancePermissionQueue } from '../src/renderer/src/App'
import type { Session } from '../src/renderer/src/types'

const baseSession: Session = {
  id: 1, name: 's', workspace: '/x', modelId: 'm', model: 'M',
  contextPct: 0,
  state: 'waiting',
  notification: { type: 'permission', hookKey: 'A', tool: 'Bash' },
  pendingPermissions: [
    { hookKey: 'B', tool: 'Read', toolInput: {} },
    { hookKey: 'C', tool: 'Write', toolInput: {} },
  ],
  lastActivityAt: 0, mode: 'anthropic',
}

class AppTests {
  static resetBridge(): void {
    vi.mocked(window.ccc.setIgnoreMouseEvents).mockReset()
    vi.mocked(window.ccc.openFolderDialog).mockReset()
    vi.mocked(window.ccc.launchSession).mockReset()
    vi.mocked(window.ccc.killSession).mockReset()
    vi.mocked(window.ccc.apiProviderList).mockReset()
    vi.mocked(window.ccc.listKnownSessions).mockReset()
    vi.mocked(window.ccc.codexCliLaunch).mockReset()
    vi.mocked(window.ccc.claudeCliDetect).mockReset()
    vi.mocked(window.ccc.codexCliDetect).mockReset()
    vi.mocked(window.ccc.injectConsoleText).mockReset()
    vi.mocked(window.ccc.codexCliSelectModel).mockReset()
    vi.mocked(window.ccc.focusSession).mockReset()
    vi.mocked(window.ccc.onSessionClosed).mockReset()
    vi.mocked(window.ccc.openFolderDialog).mockResolvedValue('/tmp/workspace-a')
    vi.mocked(window.ccc.launchSession).mockResolvedValue({ sessionId: 11 })
    vi.mocked(window.ccc.apiProviderList).mockResolvedValue([])
    vi.mocked(window.ccc.listKnownSessions).mockResolvedValue([])
    vi.mocked(window.ccc.codexCliLaunch).mockResolvedValue({ ok: true, sessionId: 22 })
    vi.mocked(window.ccc.injectConsoleText).mockReturnValue(undefined)
    vi.mocked(window.ccc.codexCliSelectModel).mockReturnValue(undefined)
    vi.mocked(window.ccc.focusSession).mockReturnValue(undefined)
    vi.mocked(window.ccc.claudeCliDetect).mockResolvedValue({ installed: true, loggedIn: true, account: null, version: 'Claude Code' })
    vi.mocked(window.ccc.codexCliDetect).mockResolvedValue({
      installed: true,
      loggedIn: false,
      email: null,
      models: [{ id: 'gpt-5.4', label: 'gpt-5.4' }],
    })
    vi.mocked(window.ccc.onSessionClosed).mockReturnValue(() => {})
  }

  static openExpandedPanel(): void {
    fireEvent.click(document.querySelector('.island')!)
  }

  static run(): void {
    describe('App', () => {
      beforeEach(() => {
        AppTests.resetBridge()
      })

      it('keeps the pill clickable when CCC collapses under the pointer', async () => {
        render(<App />)
        await waitFor(() => {
          expect(window.ccc.apiProviderList).toHaveBeenCalledWith()
          expect(window.ccc.claudeCliDetect).toHaveBeenCalledWith()
          expect(window.ccc.codexCliDetect).toHaveBeenCalledWith()
        })
        const wrapper = document.querySelector('.island-wrapper')!
        const island = document.querySelector('.island')!

        fireEvent.mouseEnter(wrapper)
        expect(window.ccc.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false)

        fireEvent.click(island)
        fireEvent.click(island)

        expect(window.ccc.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false)

        fireEvent.click(island)

        expect(window.ccc.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false)
      })

      it('restores mouse passthrough when Stop All clears sessions', async () => {
        vi.mocked(window.ccc.codexCliDetect).mockResolvedValue({ installed: false, loggedIn: false, email: null, models: [] })
        render(<App />)
        await waitFor(() => expect(window.ccc.codexCliDetect).toHaveBeenCalledWith())

        AppTests.openExpandedPanel()
        fireEvent.click(await screen.findByText('New Session'))
        fireEvent.click(await screen.findByText('Claude Code CLI'))
        await waitFor(() => expect(window.ccc.launchSession).toHaveBeenCalledWith('/tmp/workspace-a', '', false))

        fireEvent.mouseMove(document.querySelector('.island-wrapper')!, { clientX: 999, clientY: 999 })
        expect(window.ccc.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false)

        fireEvent.click(screen.getByText('Stop All'))

        expect(window.ccc.killSession).toHaveBeenCalledWith(11)
        expect(window.ccc.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true)
        expect(screen.queryByText('workspace-a')).toBeNull()
      })

      it('restores mouse passthrough when the app window loses focus', async () => {
        render(<App />)
        await waitFor(() => expect(window.ccc.codexCliDetect).toHaveBeenCalledWith())

        window.dispatchEvent(new Event('blur'))

        expect(window.ccc.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true)
      })

      // Lost-mouseup self-heal — on Windows after an idle period the mouseup
      // following a click on the pill can be delivered to the window under
      // the overlay (passthrough flip / focus change), so the renderer never
      // sees it and the long-press timer engages drag mode on a plain click.
      // A spuriously engaged drag is not cosmetic: targetBounds grows the
      // window to the whole work area and click-through goes off, so an
      // invisible full-screen surface eats every click on the machine until
      // something ends the drag. These three invariants make that bounded.
      describe('drag cannot engage or persist by accident', () => {
        const pill = (): Element => document.querySelector('.island')!
        const dragging = (): Element | null => document.querySelector('.island-wrapper--dragging')
        const wrapper = (): Element | null => document.querySelector('.island-wrapper')

        it('does not engage when the long-press timer fires far later than scheduled', async () => {
          vi.useFakeTimers()
          try {
            render(<App />)
            await vi.advanceTimersByTimeAsync(0)
            fireEvent.mouseDown(pill(), { button: 0, buttons: 1, clientX: 50, clientY: 10 })
            // The renderer stalled / the machine slept: wall clock jumps well
            // past the deadline before the timer callback actually runs.
            vi.setSystemTime(Date.now() + 5_000)
            await vi.advanceTimersByTimeAsync(500)
            expect(dragging()).toBeNull()
          } finally { vi.useRealTimers() }
        })

        it('still engages on a normal long press', async () => {
          vi.useFakeTimers()
          try {
            render(<App />)
            await vi.advanceTimersByTimeAsync(0)
            fireEvent.mouseDown(pill(), { button: 0, buttons: 1, clientX: 50, clientY: 10 })
            await vi.advanceTimersByTimeAsync(450)
            expect(dragging()).not.toBeNull()
          } finally { vi.useRealTimers() }
        })

        // The self-heal used to call settleDragAt, which COMMITS: the pill
        // lands wherever the cursor drifted to and the overlay mode changes
        // with it. We never saw the release, so there is nothing to commit.
        it('reverts rather than relocating when the mouseup was lost', async () => {
          vi.useFakeTimers()
          try {
            render(<App />)
            await vi.advanceTimersByTimeAsync(0)
            fireEvent.mouseDown(pill(), { button: 0, buttons: 1, clientX: 700, clientY: 10 })
            await vi.advanceTimersByTimeAsync(450)
            expect(dragging()).not.toBeNull()

            // Button already up, cursor now at the far-left snap zone.
            fireEvent.mouseMove(document, { buttons: 0, clientX: 2, clientY: 10 })
            await vi.advanceTimersByTimeAsync(0)

            expect(dragging()).toBeNull()
            // Back to the mode it started in — NOT corner-shrunk, which is what
            // committing at x=2 would have selected.
            expect(wrapper()?.className ?? '').not.toContain('island-wrapper--corner-shrunk')
          } finally { vi.useRealTimers() }
        })

        it('abandons a drag that receives no pointer input at all', async () => {
          vi.useFakeTimers()
          try {
            render(<App />)
            await vi.advanceTimersByTimeAsync(0)
            fireEvent.mouseDown(pill(), { button: 0, buttons: 1, clientX: 50, clientY: 10 })
            await vi.advanceTimersByTimeAsync(450)
            expect(dragging()).not.toBeNull()

            await vi.advanceTimersByTimeAsync(6_000)   // watchdog is 5s
            expect(dragging()).toBeNull()
          } finally { vi.useRealTimers() }
        })

        it('keeps a drag alive while the pointer is actually moving', async () => {
          vi.useFakeTimers()
          try {
            render(<App />)
            await vi.advanceTimersByTimeAsync(0)
            fireEvent.mouseDown(pill(), { button: 0, buttons: 1, clientX: 50, clientY: 10 })
            await vi.advanceTimersByTimeAsync(450)
            for (let i = 0; i < 4; i++) {
              await vi.advanceTimersByTimeAsync(3_000)
              fireEvent.mouseMove(document, { buttons: 1, clientX: 60 + i, clientY: 10 })
            }
            expect(dragging()).not.toBeNull()
          } finally { vi.useRealTimers() }
        })
      })

      describe('long-press lost-mouseup self-heal', () => {
        it('does not engage drag when a move reports the button released before the timer fires', async () => {
          render(<App />)
          await waitFor(() => expect(window.ccc.codexCliDetect).toHaveBeenCalledWith())
          const island = document.querySelector('.island')!

          fireEvent.mouseDown(island, { button: 0, buttons: 1, clientX: 50, clientY: 10 })
          // The missed mouseup: the next move says the primary button is up.
          fireEvent.mouseMove(document, { buttons: 0, clientX: 51, clientY: 11 })
          await act(async () => { await new Promise(r => setTimeout(r, 450)) })

          expect(document.querySelector('.island-wrapper--dragging')).toBeNull()
        })

        it('exits drag mode on the first mouse move after a lost mouseup', async () => {
          render(<App />)
          await waitFor(() => expect(window.ccc.codexCliDetect).toHaveBeenCalledWith())
          const island = document.querySelector('.island')!

          fireEvent.mouseDown(island, { button: 0, buttons: 1, clientX: 50, clientY: 10 })
          // Poll rather than sleeping past LONG_PRESS_MS and asserting once:
          // under a contended full-suite run the app's 400ms timer can land
          // after a fixed 450ms wait, which made this test flaky (~3 in 8 full
          // runs). The sibling tests assert ABSENCE after the deadline, so a
          // fixed wait is still correct for them.
          await waitFor(() => expect(document.querySelector('.island-wrapper--dragging')).toBeTruthy())

          fireEvent.mouseMove(document, { buttons: 0, clientX: 60, clientY: 20 })
          expect(document.querySelector('.island-wrapper--dragging')).toBeNull()
        })

        it('cancels a pending long-press when the window blurs mid-press', async () => {
          render(<App />)
          await waitFor(() => expect(window.ccc.codexCliDetect).toHaveBeenCalledWith())
          const island = document.querySelector('.island')!

          fireEvent.mouseDown(island, { button: 0, buttons: 1, clientX: 50, clientY: 10 })
          window.dispatchEvent(new Event('blur'))
          await act(async () => { await new Promise(r => setTimeout(r, 450)) })

          expect(document.querySelector('.island-wrapper--dragging')).toBeNull()
        })
      })

      it('keeps CCC clickable after switching sessions while the pointer stays inside', async () => {
        vi.mocked(window.ccc.codexCliDetect).mockResolvedValue({ installed: false, loggedIn: false, email: null, models: [] })
        vi.mocked(window.ccc.openFolderDialog)
          .mockResolvedValueOnce('/tmp/one')
          .mockResolvedValueOnce('/tmp/two')
          .mockResolvedValueOnce('/tmp/three')
        vi.mocked(window.ccc.launchSession)
          .mockResolvedValueOnce({ sessionId: 1 })
          .mockResolvedValueOnce({ sessionId: 2 })
          .mockResolvedValueOnce({ sessionId: 3 })

        render(<App />)
        await waitFor(() => expect(window.ccc.codexCliDetect).toHaveBeenCalledWith())
        AppTests.openExpandedPanel()
        fireEvent.click(await screen.findByText('New Session'))
        fireEvent.click(await screen.findByText('Claude Code CLI'))
        await waitFor(() => expect(window.ccc.launchSession).toHaveBeenCalledWith('/tmp/one', '', false))
        fireEvent.click(await screen.findByText('New Session'))
        fireEvent.click(await screen.findByText('Claude Code CLI'))
        await waitFor(() => expect(window.ccc.launchSession).toHaveBeenCalledWith('/tmp/two', '', false))

        fireEvent.mouseEnter(document.querySelector('.island-wrapper')!)
        expect(window.ccc.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false)

        fireEvent.click(screen.getByText('one'))
        window.dispatchEvent(new Event('blur'))

        expect(window.ccc.focusSession).toHaveBeenCalledWith(1)
        expect(window.ccc.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false)

        fireEvent.click(await screen.findByText('New Session'))
        fireEvent.click(await screen.findByText('Claude Code CLI'))

        await waitFor(() => expect(window.ccc.launchSession).toHaveBeenCalledWith('/tmp/three', '', false))
      })

      it('restores mouse passthrough after an outside click collapses CCC', async () => {
        render(<App />)
        await waitFor(() => expect(window.ccc.codexCliDetect).toHaveBeenCalledWith())

        AppTests.openExpandedPanel()
        await waitFor(() => expect(window.ccc.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false))

        fireEvent.mouseDown(document.body, { clientX: 999, clientY: 999 })

        expect(window.ccc.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true)
      })

      it('restores mouse passthrough after canceling an API switch popup', async () => {
        vi.mocked(window.ccc.codexCliDetect).mockResolvedValue({ installed: false, loggedIn: false, email: null, models: [] })
        vi.mocked(window.ccc.apiProviderList).mockResolvedValue([
          { id: 'deepseek', modelId: 'deepseek-v4-flash', hasKey: true, verified: true },
        ])
        render(<App />)
        await waitFor(() => expect(window.ccc.codexCliDetect).toHaveBeenCalledWith())

        AppTests.openExpandedPanel()
        fireEvent.click(await screen.findByText('New Session'))
        fireEvent.click(await screen.findByText('Claude Code CLI'))
        await waitFor(() => expect(window.ccc.launchSession).toHaveBeenCalledWith('/tmp/workspace-a', '', false))

        fireEvent.mouseEnter(document.querySelector('.island-wrapper')!)
        fireEvent.click(document.querySelector('.island-pill')!)
        expect(window.ccc.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false)

        fireEvent.mouseMove(document.querySelector('.island-wrapper')!)

        fireEvent.click(document.querySelector('.model-name-btn')!)
        fireEvent.click(await screen.findByRole('button', { name: /deepseek-v4-flash/i }))
        expect(await screen.findByRole('dialog', { name: 'Switch to API model' })).toBeDefined()
        expect(window.ccc.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false)

        const dismissApiSwitch = screen.getByLabelText('Dismiss notification')
        fireEvent.mouseDown(dismissApiSwitch, { clientX: 999, clientY: 999 })
        fireEvent.click(dismissApiSwitch)

        expect(window.ccc.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true)
      })

      it('restores mouse passthrough after canceling the new-session engine popup', async () => {
        render(<App />)
        await waitFor(() => expect(window.ccc.codexCliDetect).toHaveBeenCalledWith())

        AppTests.openExpandedPanel()
        fireEvent.click(await screen.findByText('New Session'))
        expect(await screen.findByRole('dialog', { name: 'New Session' })).toBeDefined()

        fireEvent.mouseEnter(document.querySelector('.island-wrapper')!)
        expect(window.ccc.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false)

        const dismissEnginePicker = screen.getByLabelText('Dismiss notification')
        fireEvent.mouseDown(dismissEnginePicker, { clientX: 999, clientY: 999 })
        fireEvent.click(dismissEnginePicker)

        expect(window.ccc.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true)
      })

      it('shows an engine picker for new sessions when Claude and Codex are available', async () => {
        render(<App />)
        AppTests.openExpandedPanel()
        fireEvent.click(await screen.findByText('New Session'))

        expect(await screen.findByRole('dialog', { name: 'New Session' })).toBeDefined()
        expect(screen.getByText('Claude Code CLI')).toBeDefined()
        expect(screen.getByText('Codex CLI')).toBeDefined()
      })

      it('shows the engine picker without waiting for another CLI detect after folder selection', async () => {
        vi.mocked(window.ccc.claudeCliDetect).mockImplementation(() => new Promise(() => {}))
        vi.mocked(window.ccc.codexCliDetect).mockImplementation(() => new Promise(() => {}))

        render(<App />)
        AppTests.openExpandedPanel()
        const claudeDetectCalls = vi.mocked(window.ccc.claudeCliDetect).mock.calls.length
        const codexDetectCalls = vi.mocked(window.ccc.codexCliDetect).mock.calls.length
        fireEvent.click(await screen.findByText('New Session'))

        expect(await screen.findByRole('dialog', { name: 'New Session' })).toBeDefined()
        expect(window.ccc.claudeCliDetect).toHaveBeenCalledTimes(claudeDetectCalls)
        expect(window.ccc.codexCliDetect).toHaveBeenCalledTimes(codexDetectCalls)
      })

      it('launches Codex from the engine picker without starting Claude', async () => {
        render(<App />)
        AppTests.openExpandedPanel()
        fireEvent.click(await screen.findByText('New Session'))
        fireEvent.click(await screen.findByText('Codex CLI'))

        await waitFor(() => {
          expect(window.ccc.codexCliLaunch).toHaveBeenCalledWith('/tmp/workspace-a', 'gpt-5.4', false)
        })
        expect(window.ccc.launchSession).not.toHaveBeenCalled()
      })

      it('switches a Codex session model via /model after choosing reasoning effort', async () => {
        vi.mocked(window.ccc.codexCliDetect).mockResolvedValue({
          installed: true,
          loggedIn: true,
          email: null,
          defaultModelId: 'gpt-5.4',
          models: [
            { id: 'gpt-5.5', label: 'gpt-5.5' },
            { id: 'gpt-5.4', label: 'gpt-5.4' },
            { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
          ],
        })

        render(<App />)
        AppTests.openExpandedPanel()
        fireEvent.click(await screen.findByText('New Session'))
        fireEvent.click(await screen.findByText('Codex CLI'))

        await waitFor(() => {
          expect(window.ccc.codexCliLaunch).toHaveBeenCalledWith('/tmp/workspace-a', 'gpt-5.4', false)
        })

        fireEvent.click(await screen.findByRole('button', { name: /gpt-5\.4/i }))
        fireEvent.click(await screen.findByText('gpt-5.4-mini'))

        expect(await screen.findByRole('dialog', { name: 'Switch Codex Model' })).toBeDefined()
        fireEvent.click(screen.getByRole('radio', { name: 'High' }))

        expect(window.ccc.codexCliSelectModel).toHaveBeenCalledWith(22, 3, 'high')
        expect(window.ccc.injectConsoleText).not.toHaveBeenCalledWith(22, '/model gpt-5.4-mini high')
        expect(window.ccc.codexCliLaunch).toHaveBeenCalledTimes(1)
      })

      it('keeps the active session while showing a popup for a background close', async () => {
        const closedHandlers: Array<(id: number) => void> = []
        vi.mocked(window.ccc.onSessionClosed).mockImplementation(cb => {
          closedHandlers.push(cb)
          return () => {}
        })
        vi.mocked(window.ccc.codexCliDetect).mockResolvedValue({ installed: false, loggedIn: false, email: null, models: [] })
        vi.mocked(window.ccc.openFolderDialog)
          .mockResolvedValueOnce('/tmp/one')
          .mockResolvedValueOnce('/tmp/two')
        vi.mocked(window.ccc.launchSession)
          .mockResolvedValueOnce({ sessionId: 1 })
          .mockResolvedValueOnce({ sessionId: 2 })

        render(<App />)
        await waitFor(() => expect(window.ccc.codexCliDetect).toHaveBeenCalled())
        AppTests.openExpandedPanel()
        fireEvent.click(await screen.findByText('New Session'))
        fireEvent.click(await screen.findByText('Claude Code CLI'))
        await waitFor(() => expect(window.ccc.launchSession).toHaveBeenCalledWith('/tmp/one', '', false))
        fireEvent.click(await screen.findByText('New Session'))
        fireEvent.click(await screen.findByText('Claude Code CLI'))
        await waitFor(() => expect(window.ccc.launchSession).toHaveBeenCalledWith('/tmp/two', '', false))
        // Wait until session two is committed/active so the latest onSessionClosed
        // handler (which closes over activeId) sees activeId === 2 before we close 1.
        await screen.findByText('two')

        const closed = closedHandlers[closedHandlers.length - 1]
        if (!closed) throw new Error('session close listener was not registered')
        act(() => { closed(1) })

        expect(await screen.findByText(/Claude · one\//)).toBeDefined()
        expect(screen.getByText('two')).toBeDefined()
      })

    })

    // Pure unit tests for the parallel-permission queue helper. Renders
    // no DOM — exercises the state-transition table directly.
    // The on-wake rebroadcast replays the last-known metrics so a session
    // rebuilt during sleep repaints immediately. contextAlertLevelRef is
    // per-renderer-mount, so without the replay marker a replayed >=85% reads
    // as a first-time band crossing and pops the compact/hand-off prompt on
    // every wake, off a reading the user was already warned about.
    describe('context-pressure alert vs the on-wake metrics replay', () => {
      const restored = {
        sessionId: 42, workspace: '/w', name: 'w', modelId: 'opus',
        mode: 'anthropic' as const, origin: 'ccc-managed' as const, capability: 'full' as const,
      }

      const mount = async (): Promise<{ push: (u: Record<string, unknown>) => void }> => {
        let onRestored!: (d: typeof restored) => void
        let onMetrics!: (u: Record<string, unknown>) => void
        vi.mocked(window.ccc.onSessionRestored).mockImplementation((cb: unknown) => {
          onRestored = cb as (d: typeof restored) => void
          return () => {}
        })
        vi.mocked(window.ccc.onSessionMetricsUpdated).mockImplementation((cb: unknown) => {
          onMetrics = cb as (u: Record<string, unknown>) => void
          return () => {}
        })
        // Flush the mount-time bridge promises (capabilities / CLI detect) so a
        // later synchronous assertion doesn't race a state update out of act().
        await act(async () => { render(<App />) })
        act(() => { onRestored(restored) })
        return { push: (u) => { act(() => { onMetrics(u) }) } }
      }

      it('does not fire the prompt for a replayed high context reading', async () => {
        const { push } = await mount()
        push({ sessionId: 42, contextPct: 0.92, replay: true })
        expect(screen.queryByRole('dialog')).toBeNull()
      })

      it('still fires the prompt for a live high context reading', async () => {
        const { push } = await mount()
        push({ sessionId: 42, contextPct: 0.92 })
        await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
      })

      it('a replay does not consume the band, so the next live reading still fires', async () => {
        const { push } = await mount()
        push({ sessionId: 42, contextPct: 0.92, replay: true })
        expect(screen.queryByRole('dialog')).toBeNull()
        push({ sessionId: 42, contextPct: 0.92 })
        await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument())
      })
    })

    // 5h and weekly usage belong to the ACCOUNT, but they only ever arrive
    // per-terminal on a statusLine. Storing them per session and painting the
    // active one's private copy meant N terminals disagreed, and a terminal
    // whose feed had died showed its last value forever.
    describe('account-level 5h / weekly reconciliation', () => {
      const restored = (sessionId: number, mode: 'anthropic' | 'api' = 'anthropic'): Record<string, unknown> => ({
        sessionId, workspace: '/w', name: 'w', modelId: 'opus',
        mode, origin: 'ccc-managed', capability: 'full',
      })

      const mount = async (): Promise<{
        restore: (d: Record<string, unknown>) => void
        push: (u: Record<string, unknown>) => void
        close: (id: number) => void
      }> => {
        let onRestored!: (d: Record<string, unknown>) => void
        let onMetrics!: (u: Record<string, unknown>) => void
        // App subscribes to onSessionClosed from two separate effects; capture
        // both here rather than digging into mock.calls, which accumulates
        // across tests in this file and would hand back a callback belonging to
        // an already-unmounted render.
        const onClosed: ((id: number) => void)[] = []
        vi.mocked(window.ccc.onSessionRestored).mockImplementation((cb: unknown) => {
          onRestored = cb as (d: Record<string, unknown>) => void
          return () => {}
        })
        vi.mocked(window.ccc.onSessionMetricsUpdated).mockImplementation((cb: unknown) => {
          onMetrics = cb as (u: Record<string, unknown>) => void
          return () => {}
        })
        vi.mocked(window.ccc.onSessionClosed).mockImplementation((cb: unknown) => {
          onClosed.push(cb as (id: number) => void)
          return () => {}
        })
        await act(async () => { render(<App />) })
        return {
          restore: (d) => { act(() => { onRestored(d) }) },
          push:    (u) => { act(() => { onMetrics(u) }) },
          close:   (id) => { act(() => { onClosed.forEach(cb => cb(id)) }) },
        }
      }

      // Both rings share .ring-wrap; pick the 5h one by its title.
      const ring = (): string | null =>
        [...document.querySelectorAll('.ring-wrap')]
          .map(el => el.getAttribute('title'))
          .find(t => t?.startsWith('5h Usage')) ?? null

      it('shows the freshest reading from ANY terminal, not the active one’s copy', async () => {
        const { restore, push } = await mount()
        restore(restored(1))   // becomes the active session
        restore(restored(2))

        push({ sessionId: 1, usagePct5h: 0.40, observedAt: 1_000 })
        expect(ring()).toBe('5h Usage 40%')

        // A background terminal reports a newer, higher number. The account is
        // at 71% for every terminal, including the active one.
        push({ sessionId: 2, usagePct5h: 0.71, observedAt: 2_000 })
        expect(ring()).toBe('5h Usage 71%')
      })

      it('an older reading never overwrites a newer one', async () => {
        const { restore, push } = await mount()
        restore(restored(1))
        restore(restored(2))

        push({ sessionId: 2, usagePct5h: 0.71, observedAt: 2_000 })
        // Terminal 1 has been idle; the CLI keeps re-emitting its pre-sleep
        // snapshot, so this arrives later but was observed earlier.
        push({ sessionId: 1, usagePct5h: 0.40, observedAt: 1_000 })
        expect(ring()).toBe('5h Usage 71%')
      })

      it('an on-wake replay carries its original time and cannot clobber a live reading', async () => {
        const { restore, push } = await mount()
        restore(restored(1))

        push({ sessionId: 1, usagePct5h: 0.71, observedAt: 5_000 })
        push({ sessionId: 1, usagePct5h: 0.10, observedAt: 4_000, replay: true })
        expect(ring()).toBe('5h Usage 71%')
      })

      it('merges field-by-field so a five_hour-only payload keeps a known seven_day', async () => {
        const { restore, push } = await mount()
        restore(restored(1))

        push({ sessionId: 1, usagePct5h: 0.20, usagePct7d: 0.66, observedAt: 1_000 })
        push({ sessionId: 1, usagePct5h: 0.25, observedAt: 2_000 })

        AppTests.openExpandedPanel()
        await waitFor(() => expect(screen.getByText('66%')).toBeInTheDocument())
      })

      // Before this, a session rebuilt with no remembered metrics rendered a
      // confident "0" for context and 5h — a number the app had never measured.
      it('shows — for a session whose metrics have never arrived', async () => {
        const { restore } = await mount()
        restore(restored(1))
        expect([...document.querySelectorAll('.ring-label')].map(el => el.textContent)).toEqual(['—', '—'])
      })

      it('fills in the rings once a reading lands', async () => {
        const { restore, push } = await mount()
        restore(restored(1))
        push({ sessionId: 1, contextPct: 0.42, usagePct5h: 0.71, observedAt: 1_000 })
        expect([...document.querySelectorAll('.ring-label')].map(el => el.textContent)).toEqual(['42', '71'])
      })

      it('leaves 5h at — for an api session even when the account number is known', async () => {
        const { restore, push, close } = await mount()
        restore(restored(1))
        restore(restored(2, 'api'))
        push({ sessionId: 1, usagePct5h: 0.71, observedAt: 1_000 })

        close(1)   // makes the api session active
        // Context has no reading for session 2, and 5h must not borrow the
        // account's Anthropic number for a non-Anthropic endpoint.
        expect([...document.querySelectorAll('.ring-label')].map(el => el.textContent)).toEqual(['—', '—'])
      })

      // resets_at only ever moves forward for an account, so it settles
      // staleness even when the sample times don't. This is what stops a
      // pre-sleep snapshot from resurrecting once the window has turned over.
      it('rejects a reading from a previous 5h window whatever its timestamp', async () => {
        const { restore, push } = await mount()
        restore(restored(1))
        restore(restored(2))

        push({ sessionId: 1, usagePct5h: 0.71, reset5hAt: 2_000, observedAt: 1_000 })
        // Terminal 2 was asleep through the rollover: higher number, later
        // sample time, but an older window.
        push({ sessionId: 2, usagePct5h: 0.95, reset5hAt: 1_000, observedAt: 5_000 })
        expect(ring()).toBe('5h Usage 71%')
      })

      it('accepts a reading from a newer 5h window even if sampled earlier', async () => {
        const { restore, push } = await mount()
        restore(restored(1))
        restore(restored(2))

        push({ sessionId: 1, usagePct5h: 0.95, reset5hAt: 1_000, observedAt: 9_000 })
        // The window rolled over; usage resets. Sampled earlier in wall-clock
        // terms, but unambiguously the newer window.
        push({ sessionId: 2, usagePct5h: 0.03, reset5hAt: 2_000, observedAt: 5_000 })
        expect(ring()).toBe('5h Usage 3%')
      })

      // An api-mode session talks to a third-party endpoint and has no
      // Anthropic quota, so it must never write the account numbers.
      it('ignores rate limits reported for a non-Anthropic session', async () => {
        const { restore, push } = await mount()
        restore(restored(1))
        restore(restored(2, 'api'))

        push({ sessionId: 1, usagePct5h: 0.71, observedAt: 1_000 })
        push({ sessionId: 2, usagePct5h: 0.05, observedAt: 9_000 })
        expect(ring()).toBe('5h Usage 71%')
      })
    })

    describe('advancePermissionQueue (parallel permissions)', () => {
      it('pops the head of the queue and keeps state=waiting when more remain', () => {
        const result = advancePermissionQueue(baseSession, { stateWhenEmpty: 'streaming' })
        expect(result.notification).toEqual({ type: 'permission', hookKey: 'B', tool: 'Read', toolInput: {} })
        expect(result.pendingPermissions).toHaveLength(1)
        expect(result.pendingPermissions[0]?.hookKey).toBe('C')
        expect(result.state).toBe('waiting')
      })

      it('clears notification and flips to streaming when queue is empty (answer path)', () => {
        const lonely: Session = { ...baseSession, pendingPermissions: [] }
        const result = advancePermissionQueue(lonely, { stateWhenEmpty: 'streaming' })
        expect(result.notification).toBeNull()
        expect(result.pendingPermissions).toEqual([])
        expect(result.state).toBe('streaming')
      })

      it('preserves state when queue is empty (dismiss path — icon must not lie)', () => {
        const lonely: Session = { ...baseSession, pendingPermissions: [], state: 'waiting' }
        const result = advancePermissionQueue(lonely, { stateWhenEmpty: 'preserve' })
        expect(result.notification).toBeNull()
        expect(result.state).toBe('waiting')
      })

      it('chained advance walks the full queue in order', () => {
        const r1 = advancePermissionQueue(baseSession, { stateWhenEmpty: 'streaming' })
        expect(r1.notification?.hookKey).toBe('B')
        const r2 = advancePermissionQueue(r1, { stateWhenEmpty: 'streaming' })
        expect(r2.notification?.hookKey).toBe('C')
        const r3 = advancePermissionQueue(r2, { stateWhenEmpty: 'streaming' })
        expect(r3.notification).toBeNull()
        expect(r3.state).toBe('streaming')
      })
    })
  }
}

AppTests.run()
