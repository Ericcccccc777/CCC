import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { HarnessWizard } from '@renderer/HarnessWizard'
import { defaultHarnessConfig, type HarnessConfig } from '@renderer/harness-types'
import { defaultRuleSet, defaultDoD, BUILTIN_RULES, recommendedOptionalRuleIds } from '@renderer/coding-rules'

interface BridgeMock {
  harnessLoad:        ReturnType<typeof vi.fn>
  harnessSave:        ReturnType<typeof vi.fn>
  harnessGenerate:    ReturnType<typeof vi.fn>
  harnessCheck:       ReturnType<typeof vi.fn>
  closeHarnessWindow: ReturnType<typeof vi.fn>
}

function loadedConfig(): HarnessConfig {
  const c = defaultHarnessConfig()
  c.basics.name        = 'demo'
  c.basics.description = 'a demo project for tests'
  c.basics.projectType = 'web-app'
  c.architecture.codingRules      = defaultRuleSet('web-app')
  c.architecture.definitionOfDone = defaultDoD('web-app')
  return c
}

function installBridge(config: HarnessConfig | null = null): BridgeMock {
  const m: BridgeMock = {
    harnessLoad:        vi.fn().mockResolvedValue(config),
    harnessSave:        vi.fn().mockResolvedValue(undefined),
    harnessGenerate:    vi.fn().mockResolvedValue({ path: 'C:/projects/demo/CLAUDE.md' }),
    harnessCheck:       vi.fn().mockResolvedValue({ hasConfig: false, hasClaudeMd: false }),
    closeHarnessWindow: vi.fn(),
  }
  ;(globalThis as unknown as { window: { ccc: BridgeMock } }).window.ccc = m
  return m
}

class HarnessWizardTests {
  static run(): void {
    describe('HarnessWizard (V2.1)', () => {
      let bridge: BridgeMock
      beforeEach(() => { bridge = installBridge() })

      // ── Mode select ─────────────────────────────────────────────────────────

      it('shows mode select page when no saved config', async () => {
        render(<HarnessWizard workspace="C:/projects/demo" />)
        await waitFor(() => expect(bridge.harnessLoad).toHaveBeenCalled())
        expect(screen.getByText('Set up your harness')).toBeDefined()
        expect(screen.getByText('Guide me through it')).toBeDefined()
        expect(screen.getByText("I'll fill it in myself")).toBeDefined()
      })

      it('clicking Pro mode shows the 2-section sidebar (Basics + Architecture)', async () => {
        const { container } = render(<HarnessWizard workspace="C:/projects/demo" />)
        await waitFor(() => expect(bridge.harnessLoad).toHaveBeenCalled())
        fireEvent.click(screen.getByText("I'll fill it in myself"))
        const labels = Array.from(container.querySelectorAll('.hw-nav-label')).map(n => n.textContent)
        expect(labels).toEqual(['Basics', 'Architecture'])
      })

      it('clicking Beginner shows simplified form with name + description + project type', async () => {
        render(<HarnessWizard workspace="C:/projects/demo" />)
        await waitFor(() => expect(bridge.harnessLoad).toHaveBeenCalled())
        fireEvent.click(screen.getByText('Guide me through it'))
        expect(screen.getByPlaceholderText('My Project')).toBeDefined()
        expect(screen.getByText('Project type')).toBeDefined()
      })

      // ── Beginner generate ───────────────────────────────────────────────────

      it('Beginner Generate calls harnessGenerate with seeded default rules', async () => {
        render(<HarnessWizard workspace="C:/projects/demo" />)
        await waitFor(() => expect(bridge.harnessLoad).toHaveBeenCalled())
        fireEvent.click(screen.getByText('Guide me through it'))
        fireEvent.change(screen.getByPlaceholderText('My Project'), { target: { value: 'demo' } })
        fireEvent.change(screen.getByPlaceholderText(/e\.g\. A mobile/), { target: { value: 'A'.repeat(60) } })
        fireEvent.click(screen.getByText('Generate harness'))
        await waitFor(() => expect(bridge.harnessGenerate).toHaveBeenCalledOnce())
        const [ws, cfg] = bridge.harnessGenerate.mock.calls[0] as [string, HarnessConfig]
        expect(ws).toBe('C:/projects/demo')
        expect(cfg.basics.name).toBe('demo')
        const defaultEnabled = cfg.architecture.codingRules.filter(r => r.source === 'builtin-default' && r.enabled)
        expect(defaultEnabled.length).toBeGreaterThan(10)
      })

      it('Beginner Generate is disabled when description is too short', async () => {
        render(<HarnessWizard workspace="C:/projects/demo" />)
        await waitFor(() => expect(bridge.harnessLoad).toHaveBeenCalled())
        fireEvent.click(screen.getByText('Guide me through it'))
        fireEvent.change(screen.getByPlaceholderText('My Project'), { target: { value: 'demo' } })
        const btn = screen.getByText('Generate harness') as HTMLButtonElement
        expect(btn.disabled).toBe(true)
      })

      // ── CLAUDE.md conflict modal ────────────────────────────────────────────

      it('shows conflict modal if CLAUDE.md exists when Generate is clicked', async () => {
        bridge = installBridge()
        bridge.harnessCheck.mockResolvedValue({ hasConfig: false, hasClaudeMd: true })
        render(<HarnessWizard workspace="C:/projects/demo" />)
        await waitFor(() => expect(bridge.harnessLoad).toHaveBeenCalled())
        fireEvent.click(screen.getByText('Guide me through it'))
        fireEvent.change(screen.getByPlaceholderText('My Project'), { target: { value: 'demo' } })
        fireEvent.change(screen.getByPlaceholderText(/e\.g\. A mobile/), { target: { value: 'A'.repeat(60) } })
        fireEvent.click(screen.getByText('Generate harness'))
        await waitFor(() => expect(bridge.harnessCheck).toHaveBeenCalled())
        expect(await screen.findByText(/CLAUDE.md already exists/i)).toBeDefined()
        fireEvent.click(screen.getByText(/Overwrite/i))
        await waitFor(() => expect(bridge.harnessGenerate).toHaveBeenCalledOnce())
        const [, cfg] = bridge.harnessGenerate.mock.calls[0] as [string, HarnessConfig]
        expect(cfg.meta.outputPath).toBe('claude-md')
      })

      it('Append choice writes to ccc-claude-md output path', async () => {
        bridge = installBridge()
        bridge.harnessCheck.mockResolvedValue({ hasConfig: false, hasClaudeMd: true })
        render(<HarnessWizard workspace="C:/projects/demo" />)
        await waitFor(() => expect(bridge.harnessLoad).toHaveBeenCalled())
        fireEvent.click(screen.getByText('Guide me through it'))
        fireEvent.change(screen.getByPlaceholderText('My Project'), { target: { value: 'demo' } })
        fireEvent.change(screen.getByPlaceholderText(/e\.g\. A mobile/), { target: { value: 'A'.repeat(60) } })
        fireEvent.click(screen.getByText('Generate harness'))
        await waitFor(() => expect(bridge.harnessCheck).toHaveBeenCalled())
        fireEvent.click(screen.getByText(/Append import/i))
        await waitFor(() => expect(bridge.harnessGenerate).toHaveBeenCalledOnce())
        const [, cfg] = bridge.harnessGenerate.mock.calls[0] as [string, HarnessConfig]
        expect(cfg.meta.outputPath).toBe('ccc-claude-md')
      })

      // ── Edit mode (existing config) ─────────────────────────────────────────

      it('skips mode select and shows sidebar directly when config is loaded', async () => {
        bridge = installBridge(loadedConfig())
        const { container } = render(<HarnessWizard workspace="C:/projects/demo" />)
        await waitFor(() => expect(bridge.harnessLoad).toHaveBeenCalled())
        const labels = Array.from(container.querySelectorAll('.hw-nav-label')).map(n => n.textContent)
        expect(labels).toEqual(['Basics', 'Architecture'])
        expect(screen.queryByText('Set up your harness')).toBeNull()
      })

      it('shows Update harness button (not Generate harness) in edit mode', async () => {
        bridge = installBridge(loadedConfig())
        render(<HarnessWizard workspace="C:/projects/demo" />)
        await waitFor(() => expect(bridge.harnessLoad).toHaveBeenCalled())
        expect(screen.getByText('Update harness')).toBeDefined()
      })

      it('Update calls harnessGenerate with current in-memory config', async () => {
        bridge = installBridge(loadedConfig())
        render(<HarnessWizard workspace="C:/projects/demo" />)
        await waitFor(() => expect(bridge.harnessLoad).toHaveBeenCalled())
        fireEvent.click(screen.getByText('Update harness'))
        await waitFor(() => expect(bridge.harnessGenerate).toHaveBeenCalledOnce())
        const [ws, cfg] = bridge.harnessGenerate.mock.calls[0] as [string, HarnessConfig]
        expect(ws).toBe('C:/projects/demo')
        expect(cfg.basics.name).toBe('demo')
      })

      // ── Architecture page rule UI ───────────────────────────────────────────

      it('Architecture page renders default + optional rule groups', async () => {
        bridge = installBridge(loadedConfig())
        const { container } = render(<HarnessWizard workspace="C:/projects/demo" />)
        await waitFor(() => expect(bridge.harnessLoad).toHaveBeenCalled())
        fireEvent.click(screen.getByText('Architecture'))
        const groupHeads = Array.from(container.querySelectorAll('.hw-rule-group-toggle')).map(n => n.textContent ?? '')
        expect(groupHeads.some(t => t.includes('Default rules'))).toBe(true)
        // Web-app projectType recommends discipline / react / css / testing / git / security categories
        expect(groupHeads.some(t => t.includes('Discipline'))).toBe(true)
        expect(groupHeads.some(t => t.includes('React'))).toBe(true)
      })

      // ── Close button ────────────────────────────────────────────────────────

      it('close button calls closeHarnessWindow', async () => {
        render(<HarnessWizard workspace="C:/projects/demo" />)
        await waitFor(() => expect(bridge.harnessLoad).toHaveBeenCalled())
        fireEvent.click(screen.getByLabelText('Close wizard'))
        expect(bridge.closeHarnessWindow).toHaveBeenCalledOnce()
      })
    })

    describe('coding-rules library', () => {
      it('all builtin rules have unique IDs', () => {
        const ids = BUILTIN_RULES.map(r => r.id)
        expect(new Set(ids).size).toBe(ids.length)
      })

      it('all default rules have source builtin-default', () => {
        const defaults = BUILTIN_RULES.filter(r => r.source === 'builtin-default')
        expect(defaults.length).toBeGreaterThanOrEqual(12)
      })

      it('all optional rules have a category', () => {
        const optional = BUILTIN_RULES.filter(r => r.source === 'builtin-optional')
        expect(optional.every(r => r.category)).toBe(true)
      })

      it('recommendedOptionalRuleIds returns deterministic list per projectType', () => {
        const a = recommendedOptionalRuleIds('web-app')
        const b = recommendedOptionalRuleIds('web-app')
        expect(a).toEqual(b)
        expect(a.length).toBeGreaterThan(0)
      })

      it('defaultRuleSet enables all defaults and recommended optionals only', () => {
        const set = defaultRuleSet('cli')
        const defaultEnabled = set.filter(r => r.source === 'builtin-default' && r.enabled).length
        const optionalDisabled = set.filter(r => r.source === 'builtin-optional' && !r.enabled)
        expect(defaultEnabled).toBe(set.filter(r => r.source === 'builtin-default').length)
        // 'cli' projectType doesn't recommend react/css/security/performance — those should be disabled
        const reactRules = set.filter(r => r.category === 'react')
        expect(reactRules.every(r => !r.enabled)).toBe(true)
        expect(optionalDisabled.length).toBeGreaterThan(0)
      })

      it('defaultDoD returns non-empty list for every projectType', () => {
        const types: Array<Parameters<typeof defaultDoD>[0]> = ['web-app', 'mobile', 'cli', 'library', 'data', 'desktop', 'service', 'other']
        for (const t of types) {
          expect(defaultDoD(t).length).toBeGreaterThan(0)
        }
      })
    })
  }
}

HarnessWizardTests.run()
