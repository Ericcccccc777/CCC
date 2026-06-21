import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HarnessWizard } from '@renderer/HarnessWizard'
import { defaultRuleSet, defaultDoD, BUILTIN_RULES, recommendedOptionalRuleIds } from '@renderer/coding-rules'

// The wizard UI was stripped back to a CCC-MAGI shell pending a gradual
// rebuild. Only the shell is asserted here; the coding-rules library (still
// used by the untouched main-process generator) keeps its full coverage below.

describe('HarnessWizard (CCC-MAGI stub)', () => {
  it('renders CCC-MAGI at the top', () => {
    render(<HarnessWizard workspace="C:/projects/demo" />)
    expect(screen.getByText('CCC-MAGI')).toBeDefined()
  })

  it('close button calls closeHarnessWindow', () => {
    const closeHarnessWindow = vi.fn()
    ;(globalThis as unknown as { window: { ccc: { closeHarnessWindow: () => void } } })
      .window.ccc = { closeHarnessWindow }
    render(<HarnessWizard workspace="C:/projects/demo" />)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(closeHarnessWindow).toHaveBeenCalledOnce()
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
