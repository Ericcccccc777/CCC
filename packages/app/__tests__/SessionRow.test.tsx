import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SessionRow } from '@renderer/components/SessionRow'
import type { Session } from '@renderer/types'

const SESSION: Session = {
  id:            1,
  name:          'my-session',
  workspace:     'C:/projects/my-session',
  modelId:       'claude-sonnet-4-6',
  model:         'Claude Sonnet 4.6',
  contextPct:    0.3,
  usagePct:      0,
  weeklyPct:     0,
  reset5hAt:     0,
  reset7dAt:     0,
  state:         'idle',
  notification:  null,
  pendingPermissions: [],
  lastActivityAt: 0,
  mode:           'anthropic',
}

class SessionRowTests {
  static run(): void {
    describe('SessionRow', () => {
      describe('display', () => {
        it('renders the session name', () => {
          render(<SessionRow session={SESSION} active={false} onSelect={vi.fn()} onRemove={vi.fn()} onRename={vi.fn()} />)
          expect(screen.getByText('my-session')).toBeDefined()
        })

        it('applies active class when active=true', () => {
          const { container } = render(
            <SessionRow session={SESSION} active={true} onSelect={vi.fn()} onRemove={vi.fn()} onRename={vi.fn()} />
          )
          expect(container.querySelector('.session-row.active')).not.toBeNull()
        })

        it('does not apply active class when active=false', () => {
          const { container } = render(
            <SessionRow session={SESSION} active={false} onSelect={vi.fn()} onRemove={vi.fn()} onRename={vi.fn()} />
          )
          expect(container.querySelector('.session-row.active')).toBeNull()
        })
      })

      describe('interactions', () => {
        it('calls onSelect when the row is clicked', () => {
          const onSelect = vi.fn()
          render(<SessionRow session={SESSION} active={false} onSelect={onSelect} onRemove={vi.fn()} onRename={vi.fn()} />)
          fireEvent.click(screen.getByText('my-session'))
          expect(onSelect).toHaveBeenCalledOnce()
        })

        it('calls onRemove when the close button is clicked', () => {
          const onRemove = vi.fn()
          render(<SessionRow session={SESSION} active={false} onSelect={vi.fn()} onRemove={onRemove} onRename={vi.fn()} />)
          fireEvent.click(screen.getByLabelText('Close session my-session'))
          expect(onRemove).toHaveBeenCalledOnce()
        })

        it('does not call onSelect when close button is clicked', () => {
          const onSelect = vi.fn()
          render(<SessionRow session={SESSION} active={false} onSelect={onSelect} onRemove={vi.fn()} onRename={vi.fn()} />)
          fireEvent.click(screen.getByLabelText('Close session my-session'))
          expect(onSelect).not.toHaveBeenCalled()
        })
      })

      describe('harness gear button', () => {
        it('renders the gear when onOpenHarness is provided', () => {
          render(<SessionRow session={SESSION} active={false} onSelect={vi.fn()} onRemove={vi.fn()} onRename={vi.fn()} onOpenHarness={vi.fn()} />)
          expect(screen.getByLabelText('Open harness wizard for my-session')).toBeDefined()
        })

        it('does NOT render the gear when onOpenHarness is omitted', () => {
          render(<SessionRow session={SESSION} active={false} onSelect={vi.fn()} onRemove={vi.fn()} onRename={vi.fn()} />)
          expect(screen.queryByLabelText(/Open harness wizard/)).toBeNull()
        })

        it('calls onOpenHarness on click and does not call onSelect', () => {
          const onOpenHarness = vi.fn()
          const onSelect      = vi.fn()
          render(<SessionRow session={SESSION} active={false} onSelect={onSelect} onRemove={vi.fn()} onRename={vi.fn()} onOpenHarness={onOpenHarness} />)
          fireEvent.click(screen.getByLabelText('Open harness wizard for my-session'))
          expect(onOpenHarness).toHaveBeenCalledOnce()
          expect(onSelect).not.toHaveBeenCalled()
        })
      })

      describe('remote control button', () => {
        it('renders the remote button when onOpenRemote is provided', () => {
          render(<SessionRow session={SESSION} active={false} onSelect={vi.fn()} onRemove={vi.fn()} onRename={vi.fn()} onOpenRemote={vi.fn()} />)
          expect(screen.getByLabelText('Open remote control for my-session')).toBeDefined()
        })

        it('does NOT render the remote button when onOpenRemote is omitted', () => {
          render(<SessionRow session={SESSION} active={false} onSelect={vi.fn()} onRemove={vi.fn()} onRename={vi.fn()} />)
          expect(screen.queryByLabelText(/Open remote control/)).toBeNull()
        })

        it('calls onOpenRemote on click and does not call onSelect', () => {
          const onOpenRemote = vi.fn()
          const onSelect     = vi.fn()
          render(<SessionRow session={SESSION} active={false} onSelect={onSelect} onRemove={vi.fn()} onRename={vi.fn()} onOpenRemote={onOpenRemote} />)
          fireEvent.click(screen.getByLabelText('Open remote control for my-session'))
          expect(onOpenRemote).toHaveBeenCalledOnce()
          expect(onSelect).not.toHaveBeenCalled()
        })

        it('renders the remote button to the LEFT of the harness button', () => {
          const { container } = render(
            <SessionRow session={SESSION} active={false} onSelect={vi.fn()} onRemove={vi.fn()} onRename={vi.fn()}
              onOpenRemote={vi.fn()} onOpenHarness={vi.fn()} />
          )
          const buttons = Array.from(container.querySelectorAll('button'))
          const remoteIdx  = buttons.findIndex(b => b.classList.contains('session-remote'))
          const harnessIdx = buttons.findIndex(b => b.classList.contains('session-harness'))
          expect(remoteIdx).toBeGreaterThanOrEqual(0)
          expect(harnessIdx).toBeGreaterThan(remoteIdx)
        })
      })

      describe('API mode stats (Chunk E)', () => {
        const apiSession: Session = { ...SESSION, mode: 'api', apiProviderId: 'deepseek', apiModelId: 'deepseek-v4-flash' }

        it('renders Balance + This week when balance snapshot is provided', () => {
          render(
            <SessionRow
              session={apiSession}
              active={false}
              onSelect={vi.fn()} onRemove={vi.fn()} onRename={vi.fn()}
              apiBalance={{ providerId: 'deepseek', balance: 9.94, currency: 'CNY', fetchedAt: 0, weeklySpending: 0.42, stale: false }}
            />
          )
          expect(screen.getByText(/¥9\.94/)).toBeDefined()
          expect(screen.getByText(/¥0\.42/)).toBeDefined()
        })

        it('hides the weekly span when weeklySpending is undefined', () => {
          render(
            <SessionRow
              session={apiSession}
              active={false}
              onSelect={vi.fn()} onRemove={vi.fn()} onRename={vi.fn()}
              apiBalance={{ providerId: 'deepseek', balance: 9.94, currency: 'CNY', fetchedAt: 0 }}
            />
          )
          expect(screen.getByText(/¥9\.94/)).toBeDefined()
          expect(screen.queryByText(/This week/)).toBeNull()
        })

        it('marks balance row as stale when snapshot.stale=true', () => {
          const { container } = render(
            <SessionRow
              session={apiSession}
              active={false}
              onSelect={vi.fn()} onRemove={vi.fn()} onRename={vi.fn()}
              apiBalance={{ providerId: 'deepseek', balance: 9.94, currency: 'CNY', fetchedAt: 0, stale: true }}
            />
          )
          expect(container.querySelector('.session-row-api-balance.is-stale')).not.toBeNull()
        })

        it('renders token counts + USD cost from usage snapshot', () => {
          render(
            <SessionRow
              session={apiSession}
              active={false}
              onSelect={vi.fn()} onRemove={vi.fn()} onRename={vi.fn()}
              apiUsage={{
                sessionId: 1, providerId: 'deepseek', modelId: 'deepseek-v4-flash',
                inputTokens: 1200, outputTokens: 3400, cacheReadTokens: 0, cacheCreationTokens: 0,
                estimatedCostUsd: 0.005, updatedAt: 0,
              }}
            />
          )
          expect(screen.getByText(/1\.2k → 3\.4k/)).toBeDefined()
          expect(screen.getByText(/\$0\.0050/)).toBeDefined()
        })

        it('falls back to "<amount> <code>" when the currency symbol is unknown', () => {
          render(
            <SessionRow
              session={apiSession}
              active={false}
              onSelect={vi.fn()} onRemove={vi.fn()} onRename={vi.fn()}
              apiBalance={{ providerId: 'deepseek', balance: 100, currency: 'XYZ', fetchedAt: 0 }}
            />
          )
          expect(screen.getByText(/100\.00 XYZ/)).toBeDefined()
        })

        it('does NOT render API stats block for anthropic-mode sessions even if balance is somehow passed', () => {
          const { container } = render(
            <SessionRow
              session={SESSION}
              active={false}
              onSelect={vi.fn()} onRemove={vi.fn()} onRename={vi.fn()}
              apiBalance={{ providerId: 'deepseek', balance: 9.94, currency: 'CNY', fetchedAt: 0 }}
            />
          )
          expect(container.querySelector('.session-row-api-stats')).toBeNull()
        })
      })

      describe('rename (double-click edit)', () => {
        it('shows input on double-click', () => {
          render(<SessionRow session={SESSION} active={false} onSelect={vi.fn()} onRemove={vi.fn()} onRename={vi.fn()} />)
          fireEvent.dblClick(screen.getByText('my-session'))
          expect(screen.getByDisplayValue('my-session')).toBeDefined()
        })

        it('calls onRename with new value on Enter', () => {
          const onRename = vi.fn()
          render(<SessionRow session={SESSION} active={false} onSelect={vi.fn()} onRemove={vi.fn()} onRename={onRename} />)
          fireEvent.dblClick(screen.getByText('my-session'))
          const input = screen.getByDisplayValue('my-session')
          fireEvent.change(input, { target: { value: 'new-name' } })
          fireEvent.keyDown(input, { key: 'Enter' })
          expect(onRename).toHaveBeenCalledWith('new-name')
        })

        it('reverts to original name on Escape', () => {
          const onRename = vi.fn()
          render(<SessionRow session={SESSION} active={false} onSelect={vi.fn()} onRemove={vi.fn()} onRename={onRename} />)
          fireEvent.dblClick(screen.getByText('my-session'))
          const input = screen.getByDisplayValue('my-session')
          fireEvent.change(input, { target: { value: 'changed' } })
          fireEvent.keyDown(input, { key: 'Escape' })
          expect(onRename).not.toHaveBeenCalled()
          expect(screen.getByText('my-session')).toBeDefined()
        })
      })
    })
  }
}

SessionRowTests.run()
