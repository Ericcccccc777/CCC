import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Island, MODELS_INFO, formatCountdown, shouldSuppressNotifPopup } from '@renderer/components/Island'
import type { Session, AppState, ActionType } from '@renderer/types'

const DEFAULT_SESSION: Session = {
  id:            1,
  name:          'test-session',
  workspace:     'C:/projects/test-session',
  modelId:       'claude-sonnet-4-6',
  model:         'Claude Sonnet 4.6',
  contextPct:    0.3,
  usagePct:      0,
  weeklyPct:     0,
  reset5hAt:     0,
  reset7dAt:     0,
  state:         'streaming',
  notification:  null,
  pendingPermissions: [],
  lastActivityAt: 0,
  mode:          'anthropic',
}

class IslandTests {
  static session(overrides: Partial<Session>): Session {
    return {
      ...DEFAULT_SESSION,
      ...overrides,
      id: overrides.id ?? DEFAULT_SESSION.id,
      name: overrides.name ?? DEFAULT_SESSION.name,
      workspace: overrides.workspace ?? DEFAULT_SESSION.workspace,
    }
  }

  static makeProps(overrides: Partial<Parameters<typeof Island>[0]> = {}): Parameters<typeof Island>[0] {
    return {
      state:            'idle' as AppState,
      model:            'Claude Sonnet 4.6',
      selectedModelId:  'claude-sonnet-4-6',
      isSwitchingModel: false,
      contextPct:       0.3,
      usagePct:         0.4,
      weeklyPct:        0.5,
      reset5hAt:        0,
      reset7dAt:        0,
      activeSessionMode: 'anthropic',
      activeApiUsage:   null,
      expanded:         false,
      showModelPicker:  false,
      notification:     null,
      sessions:         [DEFAULT_SESSION],
      activeSessionId:  1,
      remotePopupSessionId: null,
      showAccessibilityWarning: false,
      apiProviders:        [],
      apiBalances:         {} as Record<'deepseek', never>,
      apiUsage:            {},
      onToggleExpand:      vi.fn(),
      onToggleModelPicker: vi.fn(),
      onSelectModel:       vi.fn(),
      onSelectApiModel:    vi.fn(),
      codexModels:         [],
      onSelectCodexModel:  vi.fn(),
      onAddSession:        vi.fn(),
      onRemoveSession:     vi.fn(),
      onRenameSession:     vi.fn(),
      onSelectSession:     vi.fn(),
      onOpenHarness:       vi.fn(),
      onOpenRemote:        vi.fn(),
      onCloseRemote:       vi.fn(),
      onActivateRemote:    vi.fn(),
      onAction:            vi.fn(),
      onQuit:              vi.fn(),
      onDismissNotif:      vi.fn(),
      onHookDecision:      vi.fn(),
      onAllowAlways:       vi.fn(),
      onReplyAndAllow:     vi.fn(),
      ...overrides,
    }
  }

  static run(): void {
    describe('Island', () => {
      describe('pill (collapsed)', () => {
        it('renders the model name without "Claude" prefix', () => {
          render(<Island {...IslandTests.makeProps()} />)
          // model prop is 'Claude Sonnet 4.6' → displayed as 'Sonnet 4.6'
          expect(screen.getByText('Sonnet 4.6')).toBeDefined()
        })

        it('renders the status text for non-waiting states only', () => {
          const cases: Array<[AppState, string]> = [
            ['idle',      'idle'],
            ['streaming', 'responding'],
            ['done',      'complete'],
          ]
          cases.forEach(([state, label]) => {
            const { unmount } = render(<Island {...IslandTests.makeProps({ state })} />)
            expect(screen.getByText(label)).toBeDefined()
            unmount()
          })
        })

        it('hides the status text in waiting state (icon + popup convey it)', () => {
          render(<Island {...IslandTests.makeProps({ state: 'waiting' })} />)
          expect(screen.queryByText('awaiting input')).toBeNull()
        })

        it('calls onToggleExpand when island body clicked', () => {
          const onToggleExpand = vi.fn()
          const { container } = render(<Island {...IslandTests.makeProps({ onToggleExpand })} />)
          fireEvent.click(container.querySelector('.island')!)
          expect(onToggleExpand).toHaveBeenCalledOnce()
        })

        it('calls onToggleModelPicker when model button clicked', () => {
          const onToggleModelPicker = vi.fn()
          render(<Island {...IslandTests.makeProps({ onToggleModelPicker })} />)
          fireEvent.click(screen.getByRole('button', { name: /sonnet/i }))
          expect(onToggleModelPicker).toHaveBeenCalledOnce()
        })

        it('shows CCC logo when there are no sessions', () => {
          const { container } = render(<Island {...IslandTests.makeProps({ sessions: [], activeSessionId: null })} />)
          expect(container.querySelector('.ccc-logo')).not.toBeNull()
        })

        it('context ring hover shows absolute tokens / window size when provided', () => {
          const { container } = render(<Island {...IslandTests.makeProps({
            contextTokens: 137000, contextWindowSize: 1_000_000, contextPct: 0.14,
          })} />)
          fireEvent.mouseEnter(container.querySelector('.ring-hover-target')!)
          expect(screen.getByText(/137k \/ 1\.0M \(14%\)/)).toBeDefined()
        })
      })

      describe('reasoning-effort row (model picker)', () => {
        it('renders effort chips gated to the model — Opus 4.8 shows the full set incl. xhigh + max', () => {
          render(<Island {...IslandTests.makeProps({
            showModelPicker: true,
            selectedModelId: 'claude-opus-4-8',
          })} />)
          expect(screen.getByText('Reasoning effort')).toBeDefined()
          expect(screen.getByRole('radio', { name: 'Reasoning effort — Extra High' })).toBeDefined()
          expect(screen.getByRole('radio', { name: 'Reasoning effort — Max' })).toBeDefined()
        })

        it('hides xhigh for Sonnet 4.6 but still offers max', () => {
          render(<Island {...IslandTests.makeProps({
            showModelPicker: true,
            selectedModelId: 'claude-sonnet-4-6',
          })} />)
          expect(screen.queryByRole('radio', { name: 'Reasoning effort — Extra High' })).toBeNull()
          expect(screen.getByRole('radio', { name: 'Reasoning effort — Max' })).toBeDefined()
        })

        it('hides the whole effort row for Haiku (no effort support)', () => {
          render(<Island {...IslandTests.makeProps({
            showModelPicker: true,
            selectedModelId: 'claude-haiku-4-5-20251001',
          })} />)
          expect(screen.queryByText('Reasoning effort')).toBeNull()
        })

        it('does NOT render the effort row for API-mode sessions', () => {
          render(<Island {...IslandTests.makeProps({
            showModelPicker:   true,
            activeSessionMode: 'api',
            selectedModelId:   'claude-opus-4-8',
          })} />)
          expect(screen.queryByText('Reasoning effort')).toBeNull()
        })

        it('calls onSelectEffort with the picked level', () => {
          const onSelectEffort = vi.fn()
          render(<Island {...IslandTests.makeProps({
            showModelPicker: true,
            selectedModelId: 'claude-opus-4-8',
            onSelectEffort,
          })} />)
          fireEvent.click(screen.getByRole('radio', { name: 'Reasoning effort — Max' }))
          expect(onSelectEffort).toHaveBeenCalledWith('max')
        })

        it('highlights the currently-selected effort chip', () => {
          render(<Island {...IslandTests.makeProps({
            showModelPicker: true,
            selectedModelId: 'claude-opus-4-8',
            selectedEffort:  'xhigh',
          })} />)
          expect(screen.getByRole('radio', { name: 'Reasoning effort — Extra High' }).getAttribute('aria-checked')).toBe('true')
          expect(screen.getByRole('radio', { name: 'Reasoning effort — High' }).getAttribute('aria-checked')).toBe('false')
        })
      })

      describe('expanded panel', () => {
        it('shows New Session button when expanded', () => {
          render(<Island {...IslandTests.makeProps({ expanded: true })} />)
          expect(screen.getByText('New Session')).toBeDefined()
        })

        it('calls onAddSession when New Session button is clicked', () => {
          const onAddSession = vi.fn()
          render(<Island {...IslandTests.makeProps({ expanded: true, onAddSession })} />)
          fireEvent.click(screen.getByText('New Session'))
          expect(onAddSession).toHaveBeenCalledOnce()
        })

        it('shows session names in the list', () => {
          render(<Island {...IslandTests.makeProps({ expanded: true })} />)
          expect(screen.getByText('test-session')).toBeDefined()
        })

        it('renders the harness (CCC-Harness) button when a handler is wired', () => {
          render(<Island {...IslandTests.makeProps({ expanded: true, onOpenHarness: vi.fn() })} />)
          expect(screen.getByLabelText('Open harness wizard for test-session')).toBeDefined()
        })

        it('does NOT render an API Sessions group when no api-mode sessions exist (backwards-compatible UI)', () => {
          render(<Island {...IslandTests.makeProps({ expanded: true })} />)
          // Anthropic group label visible
          expect(screen.getByText('Claude Sessions')).toBeDefined()
          // No API group label
          expect(screen.queryByText('API Sessions')).toBeNull()
        })

        it('does NOT show a Claude sessions collapse button when there are fewer than 3 sessions', () => {
          const sessions = [
            IslandTests.session({ id: 1, name: 'claude-one', workspace: 'C:/projects/claude-one' }),
            IslandTests.session({ id: 2, name: 'claude-two', workspace: 'C:/projects/claude-two' }),
          ]
          render(<Island {...IslandTests.makeProps({ expanded: true, sessions })} />)
          expect(screen.queryByRole('button', { name: 'Collapse Claude Sessions' })).toBeNull()
          expect(screen.getByText('claude-one')).toBeDefined()
          expect(screen.getByText('claude-two')).toBeDefined()
        })

        it('collapses and expands Claude sessions when there are 3 or more', () => {
          const sessions = [
            IslandTests.session({ id: 1, name: 'claude-one', workspace: 'C:/projects/claude-one' }),
            IslandTests.session({ id: 2, name: 'claude-two', workspace: 'C:/projects/claude-two' }),
            IslandTests.session({ id: 3, name: 'claude-three', workspace: 'C:/projects/claude-three' }),
          ]
          render(<Island {...IslandTests.makeProps({ expanded: true, sessions })} />)
          fireEvent.click(screen.getByRole('button', { name: 'Collapse Claude Sessions' }))

          expect(screen.queryByText('claude-one')).toBeNull()
          expect(screen.getByRole('button', { name: 'Expand Claude Sessions' })).toBeDefined()

          fireEvent.click(screen.getByRole('button', { name: 'Expand Claude Sessions' }))

          expect(screen.getByText('claude-one')).toBeDefined()
          expect(screen.getByText('claude-three')).toBeDefined()
        })

        it('renders both group labels when sessions of both modes exist (Chunk D)', () => {
          const apiSession: Session = {
            ...DEFAULT_SESSION,
            id:            2,
            name:          'api-session',
            workspace:     'C:/projects/api-session',
            modelId:       'deepseek-v4-flash',
            model:         'deepseek-v4-flash',
            mode:          'api',
            apiProviderId: 'deepseek',
            apiModelId:    'deepseek-v4-flash',
          }
          render(<Island {...IslandTests.makeProps({
            expanded: true,
            sessions: [DEFAULT_SESSION, apiSession],
          })} />)
          expect(screen.getByText('Claude Sessions')).toBeDefined()
          expect(screen.getByText('API Sessions')).toBeDefined()
          expect(screen.getByText('test-session')).toBeDefined()
          expect(screen.getByText('api-session')).toBeDefined()
        })

        it('renders only the API Sessions group when all sessions are api-mode', () => {
          const apiSession: Session = {
            ...DEFAULT_SESSION, mode: 'api', apiProviderId: 'deepseek', apiModelId: 'deepseek-v4-flash',
          }
          render(<Island {...IslandTests.makeProps({
            expanded: true,
            sessions: [apiSession],
          })} />)
          expect(screen.queryByText('Claude Sessions')).toBeNull()
          expect(screen.getByText('API Sessions')).toBeDefined()
        })

        it('shows Stop All button when expanded', () => {
          render(<Island {...IslandTests.makeProps({ expanded: true })} />)
          expect(screen.getByText('Stop All')).toBeDefined()
        })

        it('calls onAction("stop") when Stop All clicked', () => {
          const onAction = vi.fn<[ActionType], void>()
          render(<Island {...IslandTests.makeProps({ expanded: true, onAction })} />)
          fireEvent.click(screen.getByText('Stop All'))
          expect(onAction).toHaveBeenCalledWith('stop')
        })

        it('shows Quit button when expanded', () => {
          render(<Island {...IslandTests.makeProps({ expanded: true })} />)
          expect(screen.getByText('Quit')).toBeDefined()
        })

        it('calls onQuit when Quit button clicked', () => {
          const onQuit = vi.fn()
          render(<Island {...IslandTests.makeProps({ expanded: true, onQuit })} />)
          fireEvent.click(screen.getByText('Quit'))
          expect(onQuit).toHaveBeenCalledTimes(1)
        })
      })

      describe('shouldSuppressNotifPopup', () => {
        it('never suppresses anything in default mode', () => {
          expect(shouldSuppressNotifPopup('default', 'done')).toBe(false)
          expect(shouldSuppressNotifPopup('default', 'permission')).toBe(false)
          expect(shouldSuppressNotifPopup('default', 'message')).toBe(false)
        })

        it('suppresses done in every non-default mode', () => {
          expect(shouldSuppressNotifPopup('top-hidden', 'done')).toBe(true)
          expect(shouldSuppressNotifPopup('corner-shrunk', 'done')).toBe(true)
        })

        it('suppresses message in every non-default mode (background toasts)', () => {
          expect(shouldSuppressNotifPopup('top-hidden', 'message')).toBe(true)
          expect(shouldSuppressNotifPopup('corner-shrunk', 'message')).toBe(true)
        })

        it('NEVER suppresses permission (always actionable — needs buttons)', () => {
          expect(shouldSuppressNotifPopup('default', 'permission')).toBe(false)
          expect(shouldSuppressNotifPopup('top-hidden', 'permission')).toBe(false)
          expect(shouldSuppressNotifPopup('corner-shrunk', 'permission')).toBe(false)
        })
      })

      describe('notification popup', () => {
        it('shows done notification when notification.type is done', () => {
          render(<Island {...IslandTests.makeProps({ notification: { type: 'done' } })} />)
          expect(screen.getByText('Response complete')).toBeDefined()
        })

        it('shows permission notification with Yes/Always/No buttons for known tool', () => {
          render(<Island {...IslandTests.makeProps({
            notification: { type: 'permission', hookKey: 'k1', tool: 'Bash' },
          })} />)
          expect(screen.getByText('Permission Required')).toBeDefined()
          expect(screen.getByText('Yes')).toBeDefined()
          expect(screen.getByText('Always')).toBeDefined()
          expect(screen.getByText('No')).toBeDefined()
        })

        it('shows Yes/Always/No for unknown tool without question content', () => {
          render(<Island {...IslandTests.makeProps({
            notification: { type: 'permission', hookKey: 'k0', tool: 'unknown' },
          })} />)
          expect(screen.getByText('Permission Required')).toBeDefined()
          expect(screen.getByText('Yes')).toBeDefined()
          expect(screen.getByText('No')).toBeDefined()
        })

        // Regression: deferred-tool tools like ToolSearch ship a `query`
        // field that historically tripped parseQuestionSpec's single-field
        // fallback, rendering ToolSearch's `select:AskUserQuestion`
        // preamble as a textarea question that the user had to ESC past
        // before the real AskUserQuestion popup appeared. The Yes/Always/No
        // permission UI is the correct one for tools that aren't
        // AskUserQuestion, even when their tool_input has a string field.
        it('does not render question UI for ToolSearch (single-field tool_input)', () => {
          render(<Island {...IslandTests.makeProps({
            notification: {
              type:    'permission',
              hookKey: 'k-toolsearch',
              tool:    'ToolSearch',
              toolInput: { query: 'select:AskUserQuestion', max_results: 5 },
            },
          })} />)
          expect(screen.getByText('Permission Required')).toBeDefined()
          expect(screen.getByText('Yes')).toBeDefined()
          expect(screen.getByText('No')).toBeDefined()
          expect(screen.queryByText('Claude is asking')).toBeNull()
          expect(document.querySelector('.notif-reply-input')).toBeNull()
        })

        it('renders AskUserQuestion: question text + options + ESC button', () => {
          render(<Island {...IslandTests.makeProps({
            notification: {
              type:    'permission',
              hookKey: 'kq1',
              tool:    'AskUserQuestion',
              toolInput: {
                questions: [{
                  question:    'Which library should we use?',
                  header:      'Library',
                  multiSelect: false,
                  options: [
                    { label: 'date-fns', description: 'Small, functional' },
                    { label: 'dayjs',    description: 'Moment.js-like API' },
                  ],
                }],
              },
            },
          })} />)
          expect(screen.getByText('Claude is asking')).toBeDefined()
          expect(screen.getByText('Which library should we use?')).toBeDefined()
          expect(screen.getByText('date-fns')).toBeDefined()
          expect(screen.getByText('dayjs')).toBeDefined()
          expect(screen.getByText('ESC')).toBeDefined()
          // No textarea when options are present
          expect(document.querySelector('.notif-reply-input')).toBeNull()
        })

        it('injects option label via onReplyAndAllow when an option is clicked', () => {
          const onReplyAndAllow = vi.fn()
          render(<Island {...IslandTests.makeProps({
            notification: {
              type:    'permission',
              hookKey: 'kq2',
              tool:    'AskUserQuestion',
              toolInput: {
                questions: [{
                  question: 'Pick one',
                  header:   'Pick',
                  multiSelect: false,
                  options: [{ label: 'Option A', description: 'first' }],
                }],
              },
            },
            onReplyAndAllow,
          })} />)
          fireEvent.click(screen.getByText('Option A'))
          expect(onReplyAndAllow).toHaveBeenCalledWith('kq2', 'Option A')
        })

        it('shows textarea + Enter button when question has no options', () => {
          render(<Island {...IslandTests.makeProps({
            notification: {
              type:    'permission',
              hookKey: 'kq3',
              tool:    'AskUserQuestion',
              toolInput: {
                questions: [{
                  question: 'What should we name the file?',
                  header:   'Name',
                  multiSelect: false,
                  options:  [],
                }],
              },
            },
          })} />)
          expect(screen.getByText('What should we name the file?')).toBeDefined()
          expect(document.querySelector('.notif-reply-input')).not.toBeNull()
          expect(screen.getByText(/Enter/)).toBeDefined()
          expect(screen.getByText('ESC')).toBeDefined()
        })

        it('calls onHookDecision with exitCode 0 on Yes', () => {
          const onHookDecision = vi.fn()
          const onDismissNotif = vi.fn()
          render(<Island {...IslandTests.makeProps({
            notification: { type: 'permission', hookKey: 'k2', tool: 'Write' },
            onHookDecision,
            onDismissNotif,
          })} />)
          fireEvent.click(screen.getByText('Yes'))
          expect(onHookDecision).toHaveBeenCalledWith('k2', 0)
          expect(onDismissNotif).toHaveBeenCalledOnce()
        })

        it('calls onHookDecision with exitCode 1 on No', () => {
          const onHookDecision = vi.fn()
          const onDismissNotif = vi.fn()
          render(<Island {...IslandTests.makeProps({
            notification: { type: 'permission', hookKey: 'k3', tool: 'Edit' },
            onHookDecision,
            onDismissNotif,
          })} />)
          fireEvent.click(screen.getByText('No'))
          expect(onHookDecision).toHaveBeenCalledWith('k3', 1)
          expect(onDismissNotif).toHaveBeenCalledOnce()
        })

        it('calls onAllowAlways with hookKey and tool on Always', () => {
          const onAllowAlways = vi.fn()
          render(<Island {...IslandTests.makeProps({
            notification: { type: 'permission', hookKey: 'k4', tool: 'Bash' },
            onAllowAlways,
          })} />)
          fireEvent.click(screen.getByText('Always'))
          expect(onAllowAlways).toHaveBeenCalledWith('k4', 'Bash')
        })

        it('X button on done notification calls onDismissNotif', () => {
          const onDismissNotif = vi.fn()
          render(<Island {...IslandTests.makeProps({ notification: { type: 'done' }, onDismissNotif })} />)
          fireEvent.click(screen.getByLabelText('Dismiss notification'))
          expect(onDismissNotif).toHaveBeenCalledOnce()
        })

        it('X button on message notification calls onDismissNotif', () => {
          const onDismissNotif = vi.fn()
          render(<Island {...IslandTests.makeProps({
            notification: { type: 'message', message: 'Claude is waiting for your input' },
            onDismissNotif,
          })} />)
          fireEvent.click(screen.getByLabelText('Dismiss notification'))
          expect(onDismissNotif).toHaveBeenCalledOnce()
        })

        it('X button on "Claude is asking" releases hook via onHookDecision(key, 0)', () => {
          const onHookDecision = vi.fn()
          const onDismissNotif = vi.fn()
          render(<Island {...IslandTests.makeProps({
            notification: {
              type: 'permission', hookKey: 'kx1', tool: 'AskUserQuestion',
              toolInput: { questions: [{ question: 'Pick?', header: '', multiSelect: false, options: [{ label: 'A', description: null }] }] },
            },
            onHookDecision, onDismissNotif,
          })} />)
          fireEvent.click(screen.getByLabelText('Dismiss notification'))
          expect(onHookDecision).toHaveBeenCalledWith('kx1', 0)
          expect(onDismissNotif).toHaveBeenCalledOnce()
        })

        it('X button on "Permission Required" releases hook via onHookDecision(key, 0)', () => {
          const onHookDecision = vi.fn()
          const onDismissNotif = vi.fn()
          render(<Island {...IslandTests.makeProps({
            notification: { type: 'permission', hookKey: 'kx2', tool: 'Bash' },
            onHookDecision, onDismissNotif,
          })} />)
          fireEvent.click(screen.getByLabelText('Dismiss notification'))
          expect(onHookDecision).toHaveBeenCalledWith('kx2', 0)
          expect(onDismissNotif).toHaveBeenCalledOnce()
        })
      })

      describe('remote control popup', () => {
        it('does not render the popup when remotePopupSessionId is null', () => {
          const { container } = render(<Island {...IslandTests.makeProps({ remotePopupSessionId: null })} />)
          expect(container.querySelector('.remote-popup')).toBeNull()
        })

        it('renders the popup for the matching session id', () => {
          render(<Island {...IslandTests.makeProps({ remotePopupSessionId: 1 })} />)
          expect(screen.getByText(/test-session/)).toBeDefined()
        })

        it('does not override the App-owned remote popup window height', () => {
          vi.mocked(window.ccc.setMainHeight).mockReset()
          render(<Island {...IslandTests.makeProps({ expanded: true, remotePopupSessionId: 1 })} />)
          expect(window.ccc.setMainHeight).not.toHaveBeenCalled()
        })

        it('Enable Remote Control invokes onActivateRemote when session is not busy', () => {
          const onActivateRemote = vi.fn()
          // DEFAULT_SESSION.state = 'streaming' so we override to 'idle' first
          const idleSession = { ...DEFAULT_SESSION, state: 'idle' as const }
          render(<Island {...IslandTests.makeProps({
            sessions: [idleSession], remotePopupSessionId: 1, onActivateRemote,
          })} />)
          fireEvent.click(screen.getByText('Enable Remote Control'))
          expect(onActivateRemote).toHaveBeenCalledWith(1)
        })

        it('does NOT invoke onActivateRemote when session is streaming', () => {
          const onActivateRemote = vi.fn()
          // DEFAULT_SESSION already has state: 'streaming'
          render(<Island {...IslandTests.makeProps({
            remotePopupSessionId: 1, onActivateRemote,
          })} />)
          fireEvent.click(screen.getByText('Enable Remote Control'))
          expect(onActivateRemote).not.toHaveBeenCalled()
          expect(screen.getByText(/currently responding/i)).toBeDefined()
        })

        it('does NOT invoke onActivateRemote when session is waiting', () => {
          const onActivateRemote = vi.fn()
          const waitingSession = { ...DEFAULT_SESSION, state: 'waiting' as const }
          render(<Island {...IslandTests.makeProps({
            sessions: [waitingSession], remotePopupSessionId: 1, onActivateRemote,
          })} />)
          fireEvent.click(screen.getByText('Enable Remote Control'))
          expect(onActivateRemote).not.toHaveBeenCalled()
        })
      })

      describe('model picker', () => {
        it('shows model options when showModelPicker=true', () => {
          render(<Island {...IslandTests.makeProps({ showModelPicker: true })} />)
          expect(screen.getByText('Fable 5')).toBeDefined()
          expect(screen.getByText('Opus 4.8')).toBeDefined()
          expect(screen.getByText('Haiku 4.5')).toBeDefined()
        })

        it('calls onSelectModel with model id', () => {
          const onSelectModel = vi.fn<[string], void>()
          render(<Island {...IslandTests.makeProps({ showModelPicker: true, onSelectModel })} />)
          fireEvent.click(screen.getByText('Opus 4.8'))
          expect(onSelectModel).toHaveBeenCalledWith('claude-opus-4-8')
        })

        it('calls onSelectModel with the Fable 5 id', () => {
          const onSelectModel = vi.fn<[string], void>()
          render(<Island {...IslandTests.makeProps({ showModelPicker: true, onSelectModel })} />)
          fireEvent.click(screen.getByText('Fable 5'))
          expect(onSelectModel).toHaveBeenCalledWith('claude-fable-5')
        })

        // The CLI's "Default (recommended)" entry is Opus 4.8; its alias is
        // `default` — sending `/model opus` creates a custom 5th entry in the
        // CLI picker instead of selecting the built-in default. Lock the
        // alias mapping so a regression is caught here, not in smoke tests.
        it('maps chips to the CLI /model aliases', () => {
          expect(MODELS_INFO.map(m => [m.id, m.switchAlias])).toEqual([
            ['claude-opus-4-8',           'default'],
            ['claude-sonnet-4-6',         'sonnet'],
            ['claude-fable-5',            'fable'],
            ['claude-haiku-4-5-20251001', 'haiku'],
          ])
        })

        it('does NOT render the custom-API row when no providers configured', () => {
          const { container } = render(<Island {...IslandTests.makeProps({ showModelPicker: true, apiProviders: [] })} />)
          expect(container.querySelector('.model-picker-custom-row')).toBeNull()
        })

        it('does NOT render the custom-API row when providers exist but none has a key', () => {
          const { container } = render(<Island {...IslandTests.makeProps({
            showModelPicker: true,
            apiProviders: [{ id: 'deepseek', modelId: 'deepseek-v4-flash', hasKey: false, verified: false }],
          })} />)
          expect(container.querySelector('.model-picker-custom-row')).toBeNull()
        })

        it('does NOT render the custom-API row when a key exists but has not tested successfully', () => {
          const { container } = render(<Island {...IslandTests.makeProps({
            showModelPicker: true,
            apiProviders: [{ id: 'deepseek', modelId: 'deepseek-v4-flash', hasKey: true, verified: false }],
          })} />)
          expect(container.querySelector('.model-picker-custom-row')).toBeNull()
        })

        it('renders both DeepSeek model chips below the divider when a configured provider has a key', () => {
          const { container } = render(<Island {...IslandTests.makeProps({
            showModelPicker: true,
            apiProviders: [{ id: 'deepseek', modelId: 'deepseek-v4-flash', hasKey: true, verified: true }],
          })} />)
          expect(container.querySelector('.model-picker-divider')).not.toBeNull()
          expect(container.querySelector('.model-picker-custom-row')).not.toBeNull()
          // Chip name = the model id WITHOUT the provider prefix; the provider
          // label ("DeepSeek") is the sub-text, once per chip.
          expect(screen.getByText('v4-flash')).toBeDefined()
          expect(screen.getByText('v4-pro')).toBeDefined()
          expect(screen.queryByText('deepseek-v4-flash')).toBeNull()
          expect(screen.getAllByText('DeepSeek').length).toBe(2)
        })

        it('clicking a DeepSeek model chip fires onSelectApiModel(providerId, full modelId)', () => {
          const onSelectApiModel = vi.fn()
          render(<Island {...IslandTests.makeProps({
            showModelPicker: true,
            apiProviders: [{ id: 'deepseek', modelId: 'deepseek-v4-pro', hasKey: true, verified: true }],
            onSelectApiModel,
          })} />)
          // Click the shortened label; the FULL id is still what gets sent.
          fireEvent.click(screen.getByText('v4-pro'))
          expect(onSelectApiModel).toHaveBeenCalledWith('deepseek', 'deepseek-v4-pro')
        })

        it('renders a Kimi provider row (prefix stripped) and fires onSelectApiModel with the full kimi id', () => {
          const onSelectApiModel = vi.fn()
          const { container } = render(<Island {...IslandTests.makeProps({
            showModelPicker: true,
            apiProviders: [{ id: 'kimi', modelId: 'kimi-k2.6', hasKey: true, verified: true }],
            onSelectApiModel,
          })} />)
          expect(container.querySelectorAll('.model-picker-custom-row').length).toBe(1)
          expect(screen.getByText('k2.6')).toBeDefined()
          expect(screen.queryByText('kimi-k2.6')).toBeNull()
          expect(screen.getAllByText('Kimi').length).toBeGreaterThan(0)
          fireEvent.click(screen.getByText('k2.6'))
          expect(onSelectApiModel).toHaveBeenCalledWith('kimi', 'kimi-k2.6')
        })

        it('renders one custom-API row per verified provider (DeepSeek + Kimi)', () => {
          const { container } = render(<Island {...IslandTests.makeProps({
            showModelPicker: true,
            apiProviders: [
              { id: 'deepseek', modelId: 'deepseek-v4-flash', hasKey: true, verified: true },
              { id: 'kimi',     modelId: 'kimi-k2.6',         hasKey: true, verified: true },
            ],
          })} />)
          expect(container.querySelectorAll('.model-picker-custom-row').length).toBe(2)
          expect(screen.getByText('v4-flash')).toBeDefined()
          expect(screen.getByText('k2.6')).toBeDefined()
        })
      })

      describe('settings panel', () => {
        it('shows Settings button in expanded panel', () => {
          render(<Island {...IslandTests.makeProps({ expanded: true })} />)
          expect(screen.getByLabelText('Settings')).toBeDefined()
        })

        it('shows language buttons after clicking Settings', () => {
          render(<Island {...IslandTests.makeProps({ expanded: true })} />)
          fireEvent.click(screen.getByLabelText('Settings'))
          expect(screen.getByText('EN')).toBeDefined()
          expect(screen.getByText('中文')).toBeDefined()
          expect(screen.getByText('한국어')).toBeDefined()
        })

        it('settings panel is hidden initially', () => {
          const { container } = render(<Island {...IslandTests.makeProps({ expanded: true })} />)
          expect(container.querySelector('.settings-panel')).toBeNull()
        })

        it('settings panel appears after clicking Settings', () => {
          const { container } = render(<Island {...IslandTests.makeProps({ expanded: true })} />)
          fireEvent.click(screen.getByLabelText('Settings'))
          expect(container.querySelector('.settings-panel')).not.toBeNull()
        })

        it('settings panel includes the API zone with Add DeepSeek when no provider configured', async () => {
          render(<Island {...IslandTests.makeProps({ expanded: true })} />)
          fireEvent.click(screen.getByLabelText('Settings'))
          await waitFor(() => expect(screen.getByText(/Add DeepSeek/)).toBeDefined())
          // The "API" zone label and language zone label coexist
          expect(screen.getByText('Language')).toBeDefined()
          expect(screen.getByText('API')).toBeDefined()
        })

        it('settings panel resets to closed when island collapses and re-expands', () => {
          const { rerender, container } = render(<Island {...IslandTests.makeProps({ expanded: true })} />)
          fireEvent.click(screen.getByLabelText('Settings'))
          expect(container.querySelector('.settings-panel')).not.toBeNull()
          // Collapse the island
          rerender(<Island {...IslandTests.makeProps({ expanded: false })} />)
          // Re-expand — settings should default to closed
          rerender(<Island {...IslandTests.makeProps({ expanded: true })} />)
          expect(container.querySelector('.settings-panel')).toBeNull()
        })
      })

      describe('model switching spinner', () => {
        it('shows spinner instead of model name when isSwitchingModel=true', () => {
          const { container } = render(<Island {...IslandTests.makeProps({ isSwitchingModel: true })} />)
          expect(container.querySelector('.model-switching-spinner')).not.toBeNull()
          expect(container.querySelector('.model-name')).toBeNull()
        })

        it('shows model name and no spinner when isSwitchingModel=false', () => {
          const { container } = render(<Island {...IslandTests.makeProps({ isSwitchingModel: false })} />)
          expect(container.querySelector('.model-name')).not.toBeNull()
          expect(container.querySelector('.model-switching-spinner')).toBeNull()
        })
      })

      describe('hover hints (replaces clipped native tooltips)', () => {
        it('hovering the context ring replaces model name with the context hint', () => {
          const { container } = render(<Island {...IslandTests.makeProps({ contextPct: 0.42 })} />)
          const target = container.querySelectorAll('.ring-hover-target')[0]!
          fireEvent.mouseEnter(target)
          expect(screen.getByText('Context 42%')).toBeDefined()
        })

        it('hovering the 5h ring includes the reset countdown when reset5hAt is set', () => {
          const future = Date.now() + (3 * 60 + 12) * 60_000
          const { container } = render(<Island {...IslandTests.makeProps({
            usagePct: 0.10, reset5hAt: future,
          })} />)
          const target = container.querySelectorAll('.ring-hover-target')[1]!
          fireEvent.mouseEnter(target)
          // Match the % first, the trailing reset hint is rendered in the same node
          expect(screen.getByText(/5h Usage 10% · resets in 3h 1[12]m/)).toBeDefined()
        })

        it('hovering the 5h ring without reset timestamp shows %-only hint', () => {
          const { container } = render(<Island {...IslandTests.makeProps({ usagePct: 0.10, reset5hAt: 0 })} />)
          const target = container.querySelectorAll('.ring-hover-target')[1]!
          fireEvent.mouseEnter(target)
          expect(screen.getByText('5h Usage 10%')).toBeDefined()
        })

        it('mouseLeave restores the model name', () => {
          const { container } = render(<Island {...IslandTests.makeProps({ contextPct: 0.42 })} />)
          const target = container.querySelectorAll('.ring-hover-target')[0]!
          fireEvent.mouseEnter(target)
          expect(screen.queryByText('Sonnet 4.6')).toBeNull()
          fireEvent.mouseLeave(target)
          expect(screen.getByText('Sonnet 4.6')).toBeDefined()
        })
      })

      describe('API-mode session: cost badge replaces 5h ring', () => {
        const apiSession: Session = {
          ...DEFAULT_SESSION, mode: 'api', apiProviderId: 'deepseek', apiModelId: 'deepseek-v4-flash',
        }
        const apiUsageSnapshot = {
          sessionId: 1, providerId: 'deepseek' as const, modelId: 'deepseek-v4-flash',
          inputTokens: 1200, outputTokens: 3400, cacheReadTokens: 0, cacheCreationTokens: 0,
          estimatedCostUsd: 0.005, updatedAt: 0,
        }

        it('renders the cost badge in the rings row', () => {
          const { container } = render(<Island {...IslandTests.makeProps({
            sessions: [apiSession], activeSessionMode: 'api', activeApiUsage: apiUsageSnapshot,
          })} />)
          expect(container.querySelector('.usage-cost-badge')).not.toBeNull()
          expect(screen.getByText('$0.0050')).toBeDefined()
        })

        it('does NOT render the 5h ring while in API mode', () => {
          const { container } = render(<Island {...IslandTests.makeProps({
            sessions: [apiSession], activeSessionMode: 'api', activeApiUsage: apiUsageSnapshot,
          })} />)
          // Only one ring-hover-target should remain (context%); the 5h slot
          // is the cost badge instead.
          expect(container.querySelectorAll('.ring-hover-target')).toHaveLength(1)
        })

        it('hovering the cost badge shows tokens + cost in the model-name slot', () => {
          const { container } = render(<Island {...IslandTests.makeProps({
            sessions: [apiSession], activeSessionMode: 'api', activeApiUsage: apiUsageSnapshot,
          })} />)
          fireEvent.mouseEnter(container.querySelector('.usage-cost-badge')!)
          expect(screen.getByText(/Session: 1\.2k → 3\.4k · \$0\.0050/)).toBeDefined()
        })
      })

      describe('weekly bar reset countdown', () => {
        it('renders the reset hint below the weekly bar when reset7dAt is set', () => {
          const future = Date.now() + (2 * 24 * 60 + 3 * 60 + 45) * 60_000
          const { container } = render(<Island {...IslandTests.makeProps({
            expanded: true, reset7dAt: future,
          })} />)
          const hint = container.querySelector('.usage-reset-hint')
          expect(hint).not.toBeNull()
          expect(hint?.textContent).toMatch(/resets in 2d 3h 4[45]m/)
        })

        it('does NOT render the hint when reset7dAt is 0/unknown', () => {
          const { container } = render(<Island {...IslandTests.makeProps({
            expanded: true, reset7dAt: 0,
          })} />)
          expect(container.querySelector('.usage-reset-hint')).toBeNull()
        })
      })

      describe('codex sessions group', () => {
        it('does NOT render a Codex Sessions group when no codex-mode sessions exist', () => {
          render(<Island {...IslandTests.makeProps({ expanded: true })} />)
          expect(screen.queryByText('Codex Sessions')).toBeNull()
        })

        it('renders Codex Sessions group when codex-mode sessions exist', () => {
          const codexSession = {
            ...DEFAULT_SESSION,
            id: 99,
            mode: 'codex' as const,
            codexModelId: 'gpt-5.4',
          }
          render(<Island {...IslandTests.makeProps({
            expanded: true,
            sessions: [DEFAULT_SESSION, codexSession],
          })} />)
          expect(screen.getByText('Codex Sessions')).toBeDefined()
        })

        it('collapses and expands Codex sessions when there are 3 or more', () => {
          const sessions = [1, 2, 3].map(id => IslandTests.session({
            id,
            name: `codex-${id}`,
            workspace: `C:/projects/codex-${id}`,
            mode: 'codex',
            modelId: 'gpt-5.4',
            model: 'gpt-5.4',
            codexModelId: 'gpt-5.4',
          }))
          render(<Island {...IslandTests.makeProps({
            expanded: true,
            sessions,
            activeSessionMode: 'codex',
          })} />)

          fireEvent.click(screen.getByRole('button', { name: 'Collapse Codex Sessions' }))

          expect(screen.queryByText('codex-1')).toBeNull()
          expect(screen.getByRole('button', { name: 'Expand Codex Sessions' })).toBeDefined()

          fireEvent.click(screen.getByRole('button', { name: 'Expand Codex Sessions' }))

          expect(screen.getByText('codex-1')).toBeDefined()
          expect(screen.getByText('codex-3')).toBeDefined()
        })

        it('uses Codex-only status without unverifiable usage or metadata panels when Codex is active', () => {
          const codexSession: Session = {
            ...DEFAULT_SESSION,
            id: 99,
            name: 'codex-work',
            model: 'gpt-5.4',
            modelId: 'gpt-5.4',
            mode: 'codex',
            codexModelId: 'gpt-5.4',
            codexMetrics: { sessionStartedAt: Date.now() - 65_000, lastActivityAt: Date.now() },
          }
          const { container } = render(<Island {...IslandTests.makeProps({
            expanded: true,
            sessions: [codexSession],
            activeSessionId: 99,
            activeSessionMode: 'codex',
            model: 'gpt-5.4',
            selectedModelId: 'gpt-5.4',
          })} />)
          expect(container.querySelector('.ring-hover-target')).toBeNull()
          expect(container.querySelector('.codex-process-badge')).not.toBeNull()
          expect(screen.queryByText('Weekly Usage')).toBeNull()
          expect(screen.queryByText('Session time')).toBeNull()
          expect(screen.queryByText('Workspace')).toBeNull()
          expect(screen.queryByText('Last activity')).toBeNull()
          expect(screen.queryByText('Codex usage metrics are not available from a stable local source.')).toBeNull()
        })
      })

      describe('model picker codex row', () => {
        it('does NOT render codex chips when codexModels is empty', () => {
          const { container } = render(<Island {...IslandTests.makeProps({
            expanded: true,
            showModelPicker: true,
            activeSessionMode: 'codex',
            codexModels: [],
          })} />)
          // The divider + row only render when codexModels.length > 0
          expect(container.querySelector('.model-picker-codex-row')).toBeNull()
        })

        it('does NOT render codex chips while a non-Codex session is active', () => {
          render(<Island {...IslandTests.makeProps({
            expanded: true,
            showModelPicker: true,
            codexModels: [
              { id: 'gpt-5.4', label: 'gpt-5.4' },
              { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
            ],
          })} />)
          expect(screen.queryByText('gpt-5.4')).toBeNull()
          expect(screen.queryByText('gpt-5.4-mini')).toBeNull()
        })

        it('renders codex model chips when codexModels is non-empty and Codex is active', () => {
          const { container } = render(<Island {...IslandTests.makeProps({
            expanded: true,
            showModelPicker: true,
            activeSessionMode: 'codex',
            codexModels: [
              { id: 'gpt-5.4', label: 'gpt-5.4' },
              { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
            ],
          })} />)
          expect(screen.getByText('gpt-5.4')).toBeDefined()
          expect(screen.getByText('gpt-5.4-mini')).toBeDefined()
          expect(container.querySelector('.model-chip--codex .model-chip__name')?.textContent).toBe('gpt-5.4')
          expect(container.querySelector('.model-chip--codex .model-chip__desc')).toBeNull()
        })

        it('clicking a codex chip fires onSelectCodexModel', () => {
          const onSelectCodex = vi.fn()
          render(<Island {...IslandTests.makeProps({
            expanded: true,
            showModelPicker: true,
            activeSessionMode: 'codex',
            codexModels: [{ id: 'gpt-5.4', label: 'gpt-5.4' }],
            onSelectCodexModel: onSelectCodex,
          })} />)
          fireEvent.click(screen.getByText('gpt-5.4'))
          expect(onSelectCodex).toHaveBeenCalledWith('gpt-5.4')
        })

        it('hides Claude and DeepSeek chips when the active session is Codex', () => {
          const codexSession: Session = {
            ...DEFAULT_SESSION,
            id: 99,
            model: 'gpt-5.4',
            modelId: 'gpt-5.4',
            mode: 'codex',
            codexModelId: 'gpt-5.4',
          }
          render(<Island {...IslandTests.makeProps({
            expanded: true,
            showModelPicker: true,
            activeSessionMode: 'codex',
            sessions: [codexSession],
            activeSessionId: 99,
            model: 'gpt-5.4',
            selectedModelId: 'gpt-5.4',
            apiProviders: [{ id: 'deepseek', hasKey: true, verified: true, modelId: 'deepseek-v4-flash' }],
            codexModels: [{ id: 'gpt-5.4', label: 'gpt-5.4' }],
          })} />)
          expect(screen.queryByText('Sonnet 4.6')).toBeNull()
          expect(screen.queryByText('DeepSeek')).toBeNull()
          expect(screen.getAllByText('gpt-5.4').length).toBeGreaterThan(0)
        })
      })
    })

    describe('formatCountdown', () => {
      const NOW = 1_700_000_000_000
      it('returns null for non-positive timestamps', () => {
        expect(formatCountdown(0,         NOW)).toBeNull()
        expect(formatCountdown(NOW - 100, NOW)).toBeNull()
        expect(formatCountdown(NaN,       NOW)).toBeNull()
      })
      it('< 1m → "<1m"', () => {
        expect(formatCountdown(NOW + 30_000, NOW)).toBe('<1m')
      })
      it('< 1h → "Nm"', () => {
        expect(formatCountdown(NOW + 8 * 60_000, NOW)).toBe('8m')
      })
      it('< 1d → "Nh Mm"', () => {
        expect(formatCountdown(NOW + (3 * 60 + 12) * 60_000, NOW)).toBe('3h 12m')
      })
      it('>= 1d → "Nd Mh Pm"', () => {
        expect(formatCountdown(NOW + (2 * 24 * 60 + 3 * 60 + 45) * 60_000, NOW)).toBe('2d 3h 45m')
      })
    })

    // ── Hide / shrink overlay modes ─────────────────────────────────────
    // These exercise the visual surface of overlayMode prop combinations.
    // The state machine itself (long-press timing, drag-tracking math,
    // setOverlayBounds plumbing) lives in App.tsx and is exercised via
    // manual verification — keeping these renderer assertions narrow.
    describe('overlay modes', () => {
      // Architecture note: in the current design, top-hidden mode renders
      // BOTH the strip and the pill in the DOM at all times; visibility is
      // driven by the .island-wrapper--peek class on the wrapper (set in
      // App.tsx, not visible in these renderer-only tests). The window
      // stays pill-sized in top-hidden mode so there's no resize flicker.
      it('renders both the strip and the pill DOM in top-hidden mode', () => {
        const { container } = render(<Island {...IslandTests.makeProps({
          overlayMode: 'top-hidden', overlayPeek: false,
        })} />)
        expect(container.querySelector('.top-strip')).not.toBeNull()
        expect(container.querySelector('.island')).not.toBeNull()
      })

      it('still renders the pill when peeking (CSS class on wrapper toggles visibility)', () => {
        const { container } = render(<Island {...IslandTests.makeProps({
          overlayMode: 'top-hidden', overlayPeek: true,
        })} />)
        expect(container.querySelector('.island')).not.toBeNull()
      })

      it('keeps the pill in the DOM when a notification fires in top-hidden mode', () => {
        // Notification must keep the pill visible even when peek is false;
        // App.tsx forces peek=true while a notification is active so the
        // user sees the popup. DOM-wise the pill is always there.
        const { container } = render(<Island {...IslandTests.makeProps({
          overlayMode: 'top-hidden', overlayPeek: false,
          notification:  { type: 'done' },
        })} />)
        expect(container.querySelector('.island')).not.toBeNull()
      })

      it('hides the strip during a drag (snap zones own the canvas)', () => {
        const { container } = render(<Island {...IslandTests.makeProps({
          overlayMode: 'top-hidden', overlayPeek: false,
          dragState: { fromMode: 'top-hidden', pointerX: 100, pointerY: 100, hoverZone: null },
        })} />)
        expect(container.querySelector('.top-strip')).toBeNull()
      })

      it('renders the corner-circle modifier and hides the model-name button in corner-shrunk', () => {
        const { container } = render(<Island {...IslandTests.makeProps({
          overlayMode: 'corner-shrunk', state: 'idle',
        })} />)
        const island = container.querySelector('.island')
        expect(island).not.toBeNull()
        expect(island!.classList.contains('island--corner')).toBe(true)
        expect(island!.classList.contains('island--corner-hint')).toBe(false)
        // No hint text; pill-center still renders the model-name-btn but
        // CSS hides it. Assert the class hook is correct.
        expect(container.querySelector('.corner-hint-text')).toBeNull()
      })

      it('expands corner-shrunk into the hint banner when state == waiting', () => {
        const { container } = render(<Island {...IslandTests.makeProps({
          overlayMode: 'corner-shrunk', state: 'waiting',
        })} />)
        const island = container.querySelector('.island')!
        expect(island.classList.contains('island--corner')).toBe(true)
        expect(island.classList.contains('island--corner-hint')).toBe(true)
        // Default EN string for waiting hint.
        expect(screen.getByText('Question pending')).toBeDefined()
      })

      it('expands corner-shrunk into the hint banner when state == done', () => {
        render(<Island {...IslandTests.makeProps({
          overlayMode: 'corner-shrunk', state: 'done',
        })} />)
        expect(screen.getByText('Session complete')).toBeDefined()
      })

      it('does NOT apply corner modifiers when overlayMode is default', () => {
        const { container } = render(<Island {...IslandTests.makeProps({
          overlayMode: 'default', state: 'waiting',
        })} />)
        const island = container.querySelector('.island')!
        expect(island.classList.contains('island--corner')).toBe(false)
        expect(island.classList.contains('island--corner-hint')).toBe(false)
      })

      it('renders the two edge snap zones only while drag is engaged', () => {
        const { container, rerender } = render(<Island {...IslandTests.makeProps({
          overlayMode: 'default', dragState: null,
        })} />)
        expect(container.querySelectorAll('.snap-zone').length).toBe(0)

        rerender(<Island {...IslandTests.makeProps({
          overlayMode: 'default',
          dragState:   { fromMode: 'default', pointerX: 100, pointerY: 10, hoverZone: null },
        })} />)
        // Horizontal-only drag: left band (corner) + right band (hide). The
        // middle is plain default, so there is no painted center zone.
        expect(container.querySelectorAll('.snap-zone').length).toBe(2)
        expect(container.querySelector('.snap-zone--corner')).not.toBeNull()
        expect(container.querySelector('.snap-zone--hide')).not.toBeNull()
        expect(container.querySelector('.snap-zone--default')).toBeNull()
      })

      it('marks the hovered edge band with is-active', () => {
        const { container, rerender } = render(<Island {...IslandTests.makeProps({
          dragState: { fromMode: 'default', pointerX: 20, pointerY: 10, hoverZone: 'corner' },
        })} />)
        expect(container.querySelector('.snap-zone--corner')!.classList.contains('is-active')).toBe(true)
        expect(container.querySelector('.snap-zone--hide')!.classList.contains('is-active')).toBe(false)

        rerender(<Island {...IslandTests.makeProps({
          dragState: { fromMode: 'default', pointerX: 720, pointerY: 10, hoverZone: 'top' },
        })} />)
        expect(container.querySelector('.snap-zone--hide')!.classList.contains('is-active')).toBe(true)
        expect(container.querySelector('.snap-zone--corner')!.classList.contains('is-active')).toBe(false)
      })

      it('positions the pill at the cursor while dragging', () => {
        const { container } = render(<Island {...IslandTests.makeProps({
          dragState: { fromMode: 'default', pointerX: 333, pointerY: 222, hoverZone: null },
        })} />)
        const island = container.querySelector('.island') as HTMLElement
        expect(island).not.toBeNull()
        expect(island.classList.contains('island--dragging')).toBe(true)
        expect(island.style.left).toBe('333px')
        expect(island.style.top).toBe('222px')
      })

      it('fires onPillPointerDown for clicks on the pill body (not the model button)', () => {
        const onPillPointerDown = vi.fn()
        const { container } = render(<Island {...IslandTests.makeProps({
          onPillPointerDown,
        })} />)
        fireEvent.mouseDown(container.querySelector('.island-pill')!)
        expect(onPillPointerDown).toHaveBeenCalledOnce()
      })
    })
  }
}

IslandTests.run()
