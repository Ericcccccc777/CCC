import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ApiSwitchPopup, type ApiSwitchPopupProps } from '@renderer/components/ApiSwitchPopup'

class ApiSwitchPopupTests {
  static makeProps(overrides: Partial<ApiSwitchPopupProps> = {}): ApiSwitchPopupProps {
    return {
      providerLabel: 'deepseek-v4-flash',
      busy:          false,
      onRestart:     vi.fn(),
      onOpenNew:     vi.fn(),
      onCancel:      vi.fn(),
      ...overrides,
    }
  }

  static run(): void {
    describe('ApiSwitchPopup', () => {
      it('renders the title, provider label, and history-not-preserved hint', () => {
        render(<ApiSwitchPopup {...ApiSwitchPopupTests.makeProps()} />)
        expect(screen.getByText('Switch to API model')).toBeDefined()
        expect(screen.getByText('deepseek-v4-flash')).toBeDefined()
        expect(screen.getByText(/history will not carry over/i)).toBeDefined()
      })

      it('shows both the Restart button and the Open-new button (Chunk D)', () => {
        render(<ApiSwitchPopup {...ApiSwitchPopupTests.makeProps()} />)
        expect(screen.getByText('Restart this session')).toBeDefined()
        expect(screen.getByText('Open a new session')).toBeDefined()
      })

      it('clicking Open-new fires onOpenNew exactly once', () => {
        const onOpenNew = vi.fn()
        render(<ApiSwitchPopup {...ApiSwitchPopupTests.makeProps({ onOpenNew })} />)
        fireEvent.click(screen.getByText('Open a new session'))
        expect(onOpenNew).toHaveBeenCalledOnce()
      })

      it('Open-new button is disabled when busy=true', () => {
        const onOpenNew = vi.fn()
        render(<ApiSwitchPopup {...ApiSwitchPopupTests.makeProps({ busy: true, onOpenNew })} />)
        const btn = screen.getByText('Open a new session') as HTMLButtonElement
        expect(btn.disabled).toBe(true)
        fireEvent.click(btn)
        expect(onOpenNew).not.toHaveBeenCalled()
      })

      it('clicking Restart fires onRestart exactly once', () => {
        const onRestart = vi.fn()
        render(<ApiSwitchPopup {...ApiSwitchPopupTests.makeProps({ onRestart })} />)
        fireEvent.click(screen.getByText('Restart this session'))
        expect(onRestart).toHaveBeenCalledOnce()
      })

      it('Restart button is disabled and label changes when busy=true', () => {
        const onRestart = vi.fn()
        render(<ApiSwitchPopup {...ApiSwitchPopupTests.makeProps({ busy: true, onRestart })} />)
        const btn = screen.getByText('Restarting…') as HTMLButtonElement
        expect(btn.disabled).toBe(true)
        fireEvent.click(btn)
        expect(onRestart).not.toHaveBeenCalled()
      })

      it('clicking the close X fires onCancel', () => {
        const onCancel = vi.fn()
        render(<ApiSwitchPopup {...ApiSwitchPopupTests.makeProps({ onCancel })} />)
        fireEvent.click(screen.getByLabelText('Dismiss notification'))
        expect(onCancel).toHaveBeenCalledOnce()
      })

      it('pressing ESC fires onCancel (window-level keydown)', () => {
        const onCancel = vi.fn()
        render(<ApiSwitchPopup {...ApiSwitchPopupTests.makeProps({ onCancel })} />)
        fireEvent.keyDown(window, { key: 'Escape' })
        expect(onCancel).toHaveBeenCalledOnce()
      })

      it('pressing other keys does NOT fire onCancel', () => {
        const onCancel = vi.fn()
        render(<ApiSwitchPopup {...ApiSwitchPopupTests.makeProps({ onCancel })} />)
        fireEvent.keyDown(window, { key: 'Enter' })
        fireEvent.keyDown(window, { key: 'a' })
        expect(onCancel).not.toHaveBeenCalled()
      })
    })
  }
}

ApiSwitchPopupTests.run()
