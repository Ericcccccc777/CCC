import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { HarnessWizard } from '@renderer/HarnessWizard'
import { defaultRuleSet, defaultDoD, BUILTIN_RULES, recommendedOptionalRuleIds } from '@renderer/coding-rules'
import type { MagiEnvItem } from '../src/shared/magi'

// ── CCC-MAGI panel flow ───────────────────────────────────────────────────────

interface MagiBridge {
  magiCheckInstalled: ReturnType<typeof vi.fn>
  magiCheckEnv:       ReturnType<typeof vi.fn>
  magiInstallEnv:     ReturnType<typeof vi.fn>
  magiInstall:        ReturnType<typeof vi.fn>
  magiUpdate:         ReturnType<typeof vi.fn>
  onMagiProgress:     ReturnType<typeof vi.fn>
  closeHarnessWindow: ReturnType<typeof vi.fn>
  openDashboard:      ReturnType<typeof vi.fn>
}

const env = (id: MagiEnvItem['id'], ok: boolean, detail = ''): MagiEnvItem =>
  ({ id, label: id, ok, detail, installable: true })

function installBridge(opts: {
  installed?: boolean
  items?:     MagiEnvItem[]
}): MagiBridge {
  const items = opts.items ?? [env('git', true), env('node', true), env('jq', true)]
  const m: MagiBridge = {
    magiCheckInstalled: vi.fn().mockResolvedValue({ installed: opts.installed ?? false }),
    magiCheckEnv:       vi.fn().mockResolvedValue({ items, allOk: items.every(i => i.ok) }),
    magiInstallEnv:     vi.fn().mockResolvedValue({ ok: true }),
    magiInstall:        vi.fn().mockResolvedValue({ ok: true }),
    magiUpdate:         vi.fn().mockResolvedValue({ ok: true }),
    onMagiProgress:     vi.fn().mockReturnValue(() => {}),
    closeHarnessWindow: vi.fn(),
    openDashboard:      vi.fn(),
  }
  ;(globalThis as unknown as { window: { ccc: MagiBridge } }).window.ccc = m
  return m
}

describe('HarnessWizard / CCC-MAGI panel', () => {
  let bridge: MagiBridge
  beforeEach(() => { bridge = installBridge({}) })

  it('renders CCC-MAGI title', async () => {
    render(<HarnessWizard workspace="/tmp/demo" />)
    expect(screen.getByText('CCC-MAGI')).toBeDefined()
    await waitFor(() => expect(bridge.magiCheckInstalled).toHaveBeenCalled())
  })

  it('already-installed workspace opens the console directly and closes the wizard (no maintaining page)', async () => {
    bridge = installBridge({ installed: true })
    render(<HarnessWizard workspace="/tmp/demo" />)
    await waitFor(() => expect(bridge.openDashboard).toHaveBeenCalledWith('/tmp/demo'))
    expect(bridge.closeHarnessWindow).toHaveBeenCalled()
    // env detection is skipped when already installed
    expect(bridge.magiCheckEnv).not.toHaveBeenCalled()
    // the old "already installed" interstitial is gone
    expect(screen.queryByText('CCC-MAGI is already installed here.')).toBeNull()
  })

  it('shows an Install button next to a failing environment item', async () => {
    bridge = installBridge({ items: [env('git', true), env('node', true), env('jq', false, 'not found')] })
    render(<HarnessWizard workspace="/tmp/demo" />)
    expect(await screen.findByText('jq')).toBeDefined()
    expect(screen.getByText('Install')).toBeDefined()
    expect(screen.queryByText('Install CCC-MAGI')).toBeNull()
  })

  it('clicking Install installs the env in the background and re-checks', async () => {
    bridge = installBridge({ items: [env('git', true), env('node', true), env('jq', false, 'not found')] })
    // after install, re-check returns jq passing
    bridge.magiCheckEnv
      .mockResolvedValueOnce({ items: [env('git', true), env('node', true), env('jq', false, 'not found')], allOk: false })
      .mockResolvedValueOnce({ items: [env('git', true), env('node', true), env('jq', true, 'jq-1.7')], allOk: true })
    render(<HarnessWizard workspace="/tmp/demo" />)
    fireEvent.click(await screen.findByText('Install'))
    await waitFor(() => expect(bridge.magiInstallEnv).toHaveBeenCalledWith('jq'))
    // env now all-pass → install-MAGI button appears
    expect(await screen.findByText('Install CCC-MAGI')).toBeDefined()
  })

  it('all env passing shows Install CCC-MAGI; clicking installs then opens the console + closes', async () => {
    render(<HarnessWizard workspace="/tmp/demo" />)
    fireEvent.click(await screen.findByText('Install CCC-MAGI'))
    await waitFor(() => expect(bridge.magiInstall).toHaveBeenCalledWith('/tmp/demo'))
    // install success → straight to the console; no "maintaining" interstitial
    await waitFor(() => expect(bridge.openDashboard).toHaveBeenCalledWith('/tmp/demo'))
    expect(bridge.closeHarnessWindow).toHaveBeenCalled()
    expect(screen.queryByText('CCC-MAGI is now maintaining your project.')).toBeNull()
  })

  it('does NOT show an Update button in the wizard (update lives in the console now)', async () => {
    bridge = installBridge({ items: [env('git', true), env('node', true), env('jq', false, 'not found')] })
    render(<HarnessWizard workspace="/tmp/demo" />)
    await screen.findByText('jq')
    expect(screen.queryByText('Update CCC-MAGI')).toBeNull()
  })

  it('close button calls closeHarnessWindow', async () => {
    render(<HarnessWizard workspace="/tmp/demo" />)
    await waitFor(() => expect(bridge.magiCheckInstalled).toHaveBeenCalled())
    fireEvent.click(screen.getByLabelText('Close'))
    expect(bridge.closeHarnessWindow).toHaveBeenCalledOnce()
  })
})

// ── coding-rules library (still used by the untouched main-process generator) ──

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
