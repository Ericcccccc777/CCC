import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { CodexCliPanel } from '../src/renderer/src/components/CodexCliPanel'
import type { ClaudeCliStatus } from '../src/shared/claude-cli'
import type { CodexCliStatus } from '../src/shared/codex-cli'
import { LangProvider } from '../src/renderer/src/i18n'

const CLAUDE_LOGGED_IN: ClaudeCliStatus = {
  installed: true,
  loggedIn: true,
  account: 'user@anthropic.com',
  version: '2.1.119 (Claude Code)',
}

const INSTALLED_LOGGED_IN: CodexCliStatus = {
  installed: true,
  loggedIn: true,
  email: 'user@openai.com',
  models: [
    { id: 'gpt-5.4', label: 'gpt-5.4' },
    { id: 'gpt-5.4-mini', label: 'gpt-5.4-mini' },
  ],
}

const INSTALLED_NOT_LOGGED_IN: CodexCliStatus = {
  installed: true,
  loggedIn: false,
  email: null,
  models: [],
}

function renderPanel(
  detectResult: CodexCliStatus | null = null,
  opts: {
    claude?: ClaudeCliStatus
  } = {},
) {
  const detectClaude = vi.fn().mockResolvedValue(opts.claude ?? CLAUDE_LOGGED_IN)
  const detect = vi.fn().mockResolvedValue(detectResult)
  const result = render(
    <LangProvider>
      <CodexCliPanel detectClaude={detectClaude} detect={detect} />
    </LangProvider>,
  )
  return { detectClaude, detect, ...result }
}

class CodexCliPanelTests {
  static run(): void {
    describe('CodexCliPanel', () => {
      it('defaults to the shared CLI panel on the Claude Code page', async () => {
        renderPanel({ installed: false, loggedIn: false, email: null, models: [] })
        expect(await screen.findByText('CLI')).toBeDefined()
        expect(await screen.findByText('user@anthropic.com')).toBeDefined()
        expect(screen.queryByText('Status')).toBeNull()
        expect(screen.queryByText('Logged in')).toBeNull()
        expect(screen.getByRole('tab', { name: 'Claude Code' }).getAttribute('aria-selected')).toBe('true')
      })

      it('shows Claude Code install failure when the binary is missing', async () => {
        renderPanel({ installed: false, loggedIn: false, email: null, models: [] }, {
          claude: { installed: false, loggedIn: false, account: null, version: null },
        })
        expect(await screen.findByText('Not installed')).toBeDefined()
        expect(screen.getByText('npm install -g @anthropic-ai/claude-code')).toBeDefined()
      })

      it('switches the CLI panel to the Codex page', async () => {
        renderPanel({ installed: false, loggedIn: false, email: null, models: [] })
        const codexTab = await screen.findByRole('tab', { name: 'Codex' })
        fireEvent.click(codexTab)
        expect(codexTab.getAttribute('aria-selected')).toBe('true')
      })

      it('shows manual install command + detect button when codex is not installed', async () => {
        renderPanel({ installed: false, loggedIn: false, email: null, models: [] })
        const codexPanel = screen.getByRole('tabpanel', { name: 'Codex CLI' })
        expect(await within(codexPanel).findByText('Codex CLI not detected')).toBeDefined()
        expect(within(codexPanel).getByText('npm install -g @openai/codex')).toBeDefined()
        expect(within(codexPanel).getByText('Check Again')).toBeDefined()
      })

      it('shows detected status without login controls when installed but not logged in', async () => {
        renderPanel(INSTALLED_NOT_LOGGED_IN)
        const codexPanel = screen.getByRole('tabpanel', { name: 'Codex CLI' })
        expect(await within(codexPanel).findByText('Codex CLI detected')).toBeDefined()
        expect(within(codexPanel).queryByText('Log In')).toBeNull()
        expect(within(codexPanel).getByText('Check Again')).toBeDefined()
      })

      it('shows detected status without model selection when installed', async () => {
        renderPanel(INSTALLED_LOGGED_IN)
        expect(await screen.findByText('Codex CLI detected')).toBeDefined()
        expect(screen.queryByText('Codex CLI')).toBeNull()
        expect(screen.queryByRole('combobox')).toBeNull()
        expect(screen.queryByText('Log Out')).toBeNull()
      })

      it('check again button calls detect()', async () => {
        const { detect } = renderPanel(null) // null = first detect returns idle-like state
        const codexPanel = screen.getByRole('tabpanel', { name: 'Codex CLI' })
        const btn = await within(codexPanel).findByText('Check Again')
        fireEvent.click(btn)
        await waitFor(() => expect(detect).toHaveBeenCalledTimes(2))
      })

      it('Claude Code check again button calls detectClaude()', async () => {
        const { detectClaude } = renderPanel({ installed: false, loggedIn: false, email: null, models: [] })
        const claudePanel = screen.getByRole('tabpanel', { name: 'Claude Code CLI' })
        const btn = await within(claudePanel).findByText('Check Again')
        fireEvent.click(btn)
        await waitFor(() => expect(detectClaude).toHaveBeenCalledTimes(2))
      })
    })
  }
}

CodexCliPanelTests.run()
