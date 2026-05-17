import { describe, it, expect } from 'vitest'
import { renderClaudeMd } from '../src/main/HarnessManager'
import { defaultHarnessConfig, type HarnessConfig } from '@renderer/harness-types'
import { defaultRuleSet, defaultDoD } from '@renderer/coding-rules'

function makeConfig(overrides: (c: HarnessConfig) => void = () => {}): HarnessConfig {
  const c = defaultHarnessConfig()
  c.basics.name        = 'Acme'
  c.basics.description = 'A receipt-tracking mobile app for small business owners.'
  c.basics.projectType = 'mobile'
  c.basics.stack       = 'React Native + Node'
  c.basics.runtime     = 'Node 20'
  c.basics.commands    = { build: 'pnpm build', test: 'pnpm test', dev: 'pnpm dev', lint: 'pnpm lint' }
  c.architecture.codingRules      = defaultRuleSet('mobile')
  c.architecture.definitionOfDone = defaultDoD('mobile')
  overrides(c)
  return c
}

class HarnessRendererTests {
  static run(): void {
    describe('renderClaudeMd', () => {
      it('puts the project name in the H1', () => {
        const md = renderClaudeMd(makeConfig())
        expect(md.startsWith('# Acme')).toBe(true)
      })

      it('includes the description verbatim', () => {
        const md = renderClaudeMd(makeConfig())
        expect(md).toContain('A receipt-tracking mobile app for small business owners.')
      })

      it('includes project type label, stack, runtime, package manager', () => {
        const md = renderClaudeMd(makeConfig())
        expect(md).toContain('Mobile app')
        expect(md).toContain('React Native + Node')
        expect(md).toContain('Node 20')
        expect(md).toContain('npm')
      })

      it('renders commands table only for non-empty commands', () => {
        const md = renderClaudeMd(makeConfig(c => { c.basics.commands = { build: 'pnpm build' } }))
        expect(md).toContain('| `pnpm build` | build |')
        expect(md).not.toContain('| `` |')
      })

      it('renders all enabled default rules under "硬性原则"', () => {
        const md = renderClaudeMd(makeConfig())
        expect(md).toContain('硬性原则')
        expect(md).toContain('想清楚再写')
        expect(md).toContain('精准改动')
        expect(md).toContain('始终盯住目标内容')
      })

      it('omits disabled rules from output', () => {
        const md = renderClaudeMd(makeConfig(c => {
          c.architecture.codingRules = c.architecture.codingRules.map(r =>
            r.id === 'simple-over-clever' ? { ...r, enabled: false } : r
          )
        }))
        expect(md).not.toContain('能简单就不要复杂')
      })

      it('groups optional rules by category', () => {
        const md = renderClaudeMd(makeConfig())
        expect(md).toContain('## 项目纪律')
        expect(md).toContain('· react')
      })

      it('includes custom rules under "本项目特定规则"', () => {
        const md = renderClaudeMd(makeConfig(c => {
          c.architecture.codingRules.push({
            title: 'Always log structured JSON',
            text:  'All log lines must be JSON objects with at minimum a `level` and `msg` field.',
            enabled: true,
            source: 'user-defined',
          })
        }))
        expect(md).toContain('本项目特定规则')
        expect(md).toContain('Always log structured JSON')
      })

      it('renders Definition of Done as a checkbox list', () => {
        const md = renderClaudeMd(makeConfig(c => { c.architecture.definitionOfDone = ['lint 绿', 'manual smoke 跑过'] }))
        expect(md).toContain('## Definition of Done')
        expect(md).toContain('- [ ] lint 绿')
        expect(md).toContain('- [ ] manual smoke 跑过')
      })

      it('includes commit section when commitConvention=conventional', () => {
        const md = renderClaudeMd(makeConfig(c => { c.architecture.commitConvention = 'conventional' }))
        expect(md).toContain('## 提交规范')
      })

      it('omits commit section for free-form', () => {
        const md = renderClaudeMd(makeConfig(c => { c.architecture.commitConvention = 'free' }))
        expect(md).not.toContain('## 提交规范')
      })
    })
  }
}

HarnessRendererTests.run()
